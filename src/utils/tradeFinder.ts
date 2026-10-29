// Trade finder: propose concrete win-win swaps between league teams.
//
// Scans every team pair for three kinds of depth-for-need trade:
// depth-for-need 1-for-1 swaps (second-best pieces), 2-for-1 consolidation
// packages, and star-for-star need swaps (each side's best at a position the
// other needs). Each candidate is graded with the same value model as the
// Trade Analyzer (VOR from projected points) plus the same roster-impact
// takes, and only swaps that are fair on paper AND leave neither team's
// starting value worse are proposed.
//
// Season-agnostic: consumes whatever pool season is bundled and whatever
// league is supplied. The optional valueLeague override lets callers run the
// same scan on synthetic teams (guest mode, two manually entered rosters)
// priced on the default manual shape; without it the shape comes from the
// league like before.

import type { League, Player, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import {
  DEFAULT_VOR_CONFIG,
  vorPoints,
  type ValueLeague,
  type VorConfig,
} from './projectionValues';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import {
  analyzeTrade,
  valueLeagueFor,
  type FullTradeAnalysis,
  type PositionKey,
} from './tradeAnalysis';

const POSITIONS: PositionKey[] = ['QB', 'RB', 'WR', 'TE'];

// A swap counts as fair when each side's value is within this share of the
// larger side. Slightly looser than the analyzer's 0.15 "even" band: a finder
// proposal is a starting point, and depth-for-need math often runs a little
// off exact parity.
const FAIR_MARGIN_SHARE = 0.25;

// Maximum candidates kept per team pair, and overall.
const MAX_PER_PAIR = 3;
const MAX_CANDIDATES = 12;

// Maximum 2-for-1 packages kept per team pair (separate cap so packages
// don't crowd out the 1-for-1s).
const MAX_TWO_FOR_ONE_PER_PAIR = 2;

// Maximum star-for-star swaps kept per team pair (separate cap so they
// don't crowd out the depth trades).
const MAX_STAR_SWAP_PER_PAIR = 2;

export interface PositionProfile {
  position: PositionKey;
  // Best VOR on the roster at this position.
  best: number;
  // Count of positive-VOR players at this position.
  startable: number;
  // Below the league median best at this position: a trade target.
  need: boolean;
  // Can give one up and still cover starter demand.
  surplus: boolean;
  // Positive-VOR players sorted by VOR desc (includes the best).
  depthChart: PoolPlayer[];
}

export interface TeamProfile {
  team: Team;
  positions: Record<PositionKey, PositionProfile>;
  unmapped: number;
}

// Resolve a league team's roster to pool players for value math.
function resolveTeamRoster(team: Team, pool: DraftPoolFile): PoolPlayer[] {
  const index = indexPool(pool);
  const out: PoolPlayer[] = [];
  for (const p of team.roster ?? []) {
    const resolved = resolvePoolPlayer(p as Player, index);
    if (resolved) out.push(resolved);
  }
  return out;
}

// Starter demand per position, counting each FLEX slot as one more slot
// split across RB/WR/TE (coarse, same convention as tradeAnalysis.ts).
function demandFor(
  position: PositionKey,
  slots: NonNullable<League['rosterSlots']>,
): number {
  const flex = slots.FLEX ?? 0;
  const base =
    position === 'QB'
      ? (slots.QB ?? 0)
      : position === 'RB'
        ? (slots.RB ?? 0)
        : position === 'WR'
          ? (slots.WR ?? 0)
          : (slots.TE ?? 0);
  return base + (flex > 0 && position !== 'QB' ? 1 : 0);
}

function posKeyOf(p: PoolPlayer): PositionKey | null {
  const p_ = p.pos.toUpperCase();
  return p_ === 'QB' || p_ === 'RB' || p_ === 'WR' || p_ === 'TE'
    ? (p_ as PositionKey)
    : null;
}

export function teamProfiles(
  league: League,
  pool: DraftPoolFile = POOL,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
  valueLeague: ValueLeague = valueLeagueFor(league),
): TeamProfile[] {
  const vor = vorPoints(pool.players, valueLeague, cfg);
  const slots = valueLeague.rosterSlots;
  const perTeam = league.teams.map(team => {
    const roster = resolveTeamRoster(team, pool);
    const positions = {} as Record<PositionKey, PositionProfile>;
    let mapped = 0;
    for (const position of POSITIONS) {
      const at = roster
        .filter(p => posKeyOf(p) === position)
        .sort((a, b) => (vor.get(b.id) ?? 0) - (vor.get(a.id) ?? 0));
      const best = at.length > 0 ? (vor.get(at[0].id) ?? 0) : 0;
      const startable = at.filter(p => (vor.get(p.id) ?? 0) > 0).length;
      mapped += at.length;
      positions[position] = {
        position,
        best: Math.round(best * 10) / 10,
        startable,
        need: false,
        surplus: false,
        depthChart: at,
      };
    }
    return { team, positions, unmapped: (team.roster ?? []).length - mapped };
  });

  // League-relative need/surplus: median best per position, demand per slot.
  for (const position of POSITIONS) {
    const bests = perTeam.map(t => t.positions[position].best).sort((a, b) => a - b);
    const median = bests.length > 0 ? bests[Math.floor(bests.length / 2)] : 0;
    const demand = demandFor(position, slots);
    for (const t of perTeam) {
      const prof = t.positions[position];
      prof.need = prof.best < median - 0.5;
      // Surplus means giving the second-best still leaves starter demand
      // covered: more than `demand` startable players, and the depth piece
      // itself has positive value.
      prof.surplus =
        prof.startable > demand &&
        prof.depthChart.length > 1 &&
        (vor.get(prof.depthChart[1].id) ?? 0) > 0;
    }
  }
  return perTeam;
}

export interface TradeCandidate {
  teamA: Team;
  teamB: Team;
  // Pool ids, not full players: the page resolves names from the pool.
  aGives: PoolPlayer[];
  bGives: PoolPlayer[];
  analysis: FullTradeAnalysis;
  // Strongest-first human-readable reasons this is win-win.
  reasons: string[];
  // Ranking score: mutual starter-upgrade gain + fairness.
  score: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function upgradeGain(analysis: FullTradeAnalysis): number {
  // Sum of "best VOR after - before" at positions where the team improved,
  // across both teams' impact takes. Parsed from the depth lines rather than
  // the free-text takes so the score stays stable if wording changes.
  let gain = 0;
  for (const impact of [analysis.teamAImpact, analysis.teamBImpact]) {
    for (const d of impact?.depth ?? []) {
      if (d.bestAfter > d.bestBefore) gain += d.bestAfter - d.bestBefore;
    }
  }
  return round1(gain);
}

function harmsStarter(analysis: FullTradeAnalysis): boolean {
  for (const impact of [analysis.teamAImpact, analysis.teamBImpact]) {
    for (const d of impact?.depth ?? []) {
      if (d.bestAfter < d.bestBefore - 0.5) return true;
      if (d.startableAfter < d.startableBefore && d.startableAfter < 2) return true;
    }
  }
  return false;
}

function vorOf(vor: Map<string, number>, p: PoolPlayer): number {
  return vor.get(p.id) ?? 0;
}

// 2-for-1 packages: the buyer (need at p) gives two depth pieces for the
// seller's SECOND-best at p — never the star, so neither starting lineup is
// harmed. The classic consolidation deal: the buyer upgrades a weak starter
// and frees a bench spot; the seller turns one surplus depth piece into two
// startable players. Fairness is the same ±25% band as the 1-for-1s, which
// means the single piece has to be worth roughly the pair combined — i.e.
// the seller must be genuinely stacked at p (two near-equal studs), which is
// exactly when a 2-for-1 makes sense for both sides.
function twoForOneAttempts(
  buyer: TeamProfile,
  seller: TeamProfile,
  vor: Map<string, number>,
  valueLeague: ValueLeague,
  pool: DraftPoolFile,
  cfg: VorConfig,
): TradeCandidate[] {
  const out: TradeCandidate[] = [];
  const seenLocal = new Set<string>();

  for (const p of POSITIONS) {
    if (!buyer.positions[p].need || !seller.positions[p].surplus) continue;
    const piece = seller.positions[p].depthChart[1]; // depth, not the star
    if (!piece || vorOf(vor, piece) <= 0) continue;

    // Candidate depth pieces: second-best from each buyer surplus position
    // (the star they keep stays), skipping p itself. A second spare from a
    // 3+-deep position is also tradable.
    const spares: { player: PoolPlayer; position: PositionKey }[] = [];
    for (const q of POSITIONS) {
      if (q === p) continue;
      const prof = buyer.positions[q];
      if (!prof.surplus) continue;
      for (const depthIdx of [1, 2]) {
        if (prof.depthChart.length <= depthIdx) break;
        const spare = prof.depthChart[depthIdx];
        if (vorOf(vor, spare) <= 0) break;
        spares.push({ player: spare, position: q });
      }
    }

    // All unordered pairs of spares.
    for (let i = 0; i < spares.length; i++) {
      for (let j = i + 1; j < spares.length; j++) {
        const g1 = spares[i];
        const g2 = spares[j];
        const key = [
          '2for1',
          buyer.team.id,
          seller.team.id,
          piece.id,
          g1.player.id,
          g2.player.id,
        ]
          .sort()
          .join('|');
        if (seenLocal.has(key)) continue;
        seenLocal.add(key);

        const analysis = analyzeTrade([g1.player, g2.player], [piece], {
          valueLeague,
          teamA: buyer.team,
          teamB: seller.team,
          pool,
          cfg,
        });
        if (analysis.marginShare > FAIR_MARGIN_SHARE) continue;
        if (harmsStarter(analysis)) continue;
        const gain = upgradeGain(analysis);
        // A 2-for-1 that upgrades nobody's starter is just churn.
        if (gain <= 0) continue;

        const reasons: string[] = [
          `${buyer.team.name} consolidates: ${piece.name} (${round1(vorOf(vor, piece))} VOR) becomes their best ${p}, upgrading the position from ${buyer.positions[p].best} VOR — and the deal frees a bench spot.`,
          `${seller.team.name} turns surplus ${p} depth into two startable pieces: ${g1.player.name} (${g1.position}, ${round1(vorOf(vor, g1.player))} VOR) and ${g2.player.name} (${g2.position}, ${round1(vorOf(vor, g2.player))} VOR), keeping its ${p} star.`,
          `Fair on paper: ${round1(analysis.sideATotal)} vs ${round1(analysis.sideBTotal)} VOR (within ${Math.round(analysis.marginShare * 100)}%).`,
        ];
        out.push({
          teamA: buyer.team,
          teamB: seller.team,
          aGives: [g1.player, g2.player],
          bGives: [piece],
          analysis,
          reasons,
          score: round1(gain + 1 / (1 + analysis.marginShare)),
        });
      }
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, MAX_TWO_FOR_ONE_PER_PAIR);
}

// Net change in a team's starting value (best VOR at each position, before
// → after). A star-for-star swap trades a positional best away, so the
// depth-trade "no position gets worse" rule can't apply here — instead each
// team must NET gain or break even on starting value.
function netStarterChange(
  impact: FullTradeAnalysis['teamAImpact'],
): number {
  let net = 0;
  for (const d of impact?.depth ?? []) net += d.bestAfter - d.bestBefore;
  return round1(net);
}

// Star-for-star need swaps: A is weak at p where B is deep, and B is weak at
// q where A is deep. Unlike the depth-for-need 1-for-1s (which trade the
// SECOND-best at each position), the stars themselves move — the classic "my
// RB1 for your WR1" deal. It only fires when the pairing is win-win: each
// side's gain at its need position outweighs the loss at the position it
// trades from, and the `surplus` flag already guarantees the team keeps
// starter demand covered after the star leaves.
function needVsNeedAttempts(
  A: TeamProfile,
  B: TeamProfile,
  vor: Map<string, number>,
  valueLeague: ValueLeague,
  pool: DraftPoolFile,
  cfg: VorConfig,
): TradeCandidate[] {
  const out: TradeCandidate[] = [];
  const seenLocal = new Set<string>();

  // One attempt per direction: A needs p, B needs q, each gives its star.
  const attempts: {
    giver: TeamProfile;
    receiver: TeamProfile;
    give: PositionKey;
    get: PositionKey;
  }[] = [];
  for (const p of POSITIONS) {
    for (const q of POSITIONS) {
      if (p === q) continue;
      if (
        A.positions[p].need &&
        B.positions[p].surplus &&
        B.positions[q].need &&
        A.positions[q].surplus
      ) {
        attempts.push({ giver: A, receiver: B, give: q, get: p });
      }
    }
  }

  for (const { giver, receiver, give, get } of attempts) {
    const giverStar = giver.positions[give].depthChart[0];
    const receiverStar = receiver.positions[get].depthChart[0];
    if (!giverStar || !receiverStar) continue;
    if (vorOf(vor, giverStar) <= 0 || vorOf(vor, receiverStar) <= 0) continue;

    const key = [
      'star',
      giver.team.id,
      receiver.team.id,
      giverStar.id,
      receiverStar.id,
    ]
      .sort()
      .join('|');
    if (seenLocal.has(key)) continue;
    seenLocal.add(key);

    const analysis = analyzeTrade([giverStar], [receiverStar], {
      valueLeague,
      teamA: giver.team,
      teamB: receiver.team,
      pool,
      cfg,
    });
    if (analysis.marginShare > FAIR_MARGIN_SHARE) continue;

    const giverNet = netStarterChange(analysis.teamAImpact);
    const receiverNet = netStarterChange(analysis.teamBImpact);
    // Win-win: neither team's starting value goes backwards.
    if (giverNet < 0 || receiverNet < 0) continue;
    // A star swap that upgrades nobody's starter is just churn.
    if (upgradeGain(analysis) <= 0) continue;

    const giverNewBest =
      analysis.teamAImpact?.depth.find(d => d.position === give)?.bestAfter ??
      0;
    const giverSecond = giver.positions[give].depthChart[1];

    const reasons: string[] = [
      `${giver.team.name} gets the ${get} it needs: ${receiverStar.name} (${round1(vorOf(vor, receiverStar))} VOR) becomes its best ${get}, up from ${giver.positions[get].best} VOR.`,
      `${receiver.team.name} gets the ${give} it needs: ${giverStar.name} (${round1(vorOf(vor, giverStar))} VOR) becomes its best ${give}, up from ${receiver.positions[give].best} VOR.`,
      `Both teams net-upgrade their starters (+${round1(giverNet)} / +${round1(receiverNet)} VOR) and still cover demand — ${giver.team.name}'s ${give} falls back to ${giverSecond.name} (${giverNewBest} VOR).`,
      `Fair on paper: ${round1(analysis.sideATotal)} vs ${round1(analysis.sideBTotal)} VOR (within ${Math.round(analysis.marginShare * 100)}%).`,
    ];
    out.push({
      teamA: giver.team,
      teamB: receiver.team,
      aGives: [giverStar],
      bGives: [receiverStar],
      analysis,
      reasons,
      score: round1(
        giverNet + receiverNet + 1 / (1 + analysis.marginShare),
      ),
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, MAX_STAR_SWAP_PER_PAIR);
}

export function findTradeCandidates(
  league: League,
  pool: DraftPoolFile = POOL,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
  valueLeague: ValueLeague = valueLeagueFor(league),
): TradeCandidate[] {
  const vor = vorPoints(pool.players, valueLeague, cfg);
  const profiles = teamProfiles(league, pool, cfg, valueLeague);
  const candidates: TradeCandidate[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const A = profiles[i];
      const B = profiles[j];
      let pairCount = 0;

      // 2-for-1 packages, both directions: the side that needs a position
      // gives two depth pieces for the deep side's second-best there.
      for (const [buyer, seller] of [
        [A, B],
        [B, A],
      ] as const) {
        for (const pkg of twoForOneAttempts(
          buyer,
          seller,
          vor,
          valueLeague,
          pool,
          cfg,
        )) {
          const key = [
            'pkg',
            pkg.teamA.id,
            pkg.teamB.id,
            ...pkg.aGives.map(p => p.id).sort(),
            ...pkg.bGives.map(p => p.id),
          ].join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push(pkg);
        }
      }

      // Star-for-star need swaps: the attempts already cover both
      // directions, so one call per pair is enough.
      for (const swap of needVsNeedAttempts(
        A,
        B,
        vor,
        valueLeague,
        pool,
        cfg,
      )) {
        const key = [
          'star',
          swap.teamA.id,
          swap.teamB.id,
          ...swap.aGives.map(p => p.id).sort(),
          ...swap.bGives.map(p => p.id).sort(),
        ].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(swap);
      }

      // Both directions: A needs p while B is deep at p, and B needs q
      // while A is deep at q.
      for (const p of POSITIONS) {
        if (!A.positions[p].need || !B.positions[p].surplus) continue;
        for (const q of POSITIONS) {
          if (p === q) continue;
          if (!B.positions[q].need || !A.positions[q].surplus) continue;

          const bGive = B.positions[p].depthChart[1]; // second-best: depth, not the star
          const aGive = A.positions[q].depthChart[1];
          if (!bGive || !aGive) continue;

          const key = [A.team.id, B.team.id, aGive.id, bGive.id, p, q]
            .sort()
            .join('|');
          if (seen.has(key)) continue;
          seen.add(key);

          const analysis = analyzeTrade([aGive], [bGive], {
            valueLeague,
            teamA: A.team,
            teamB: B.team,
            pool,
            cfg,
          });
          if (analysis.marginShare > FAIR_MARGIN_SHARE) continue;
          if (harmsStarter(analysis)) continue;

          const reasons: string[] = [
            `${A.team.name} fills a ${p} need: ${bGive.name} (${round1(vorOf(vor, bGive))} VOR) upgrades their ${p} starter from ${A.positions[p].best} VOR, giving up ${q} depth it can spare.`,
            `${B.team.name} fills a ${q} need: ${aGive.name} (${round1(vorOf(vor, aGive))} VOR) upgrades their ${q} starter from ${B.positions[q].best} VOR, giving up ${p} depth it can spare.`,
            `Fair on paper: ${round1(analysis.sideATotal)} vs ${round1(analysis.sideBTotal)} VOR (within ${Math.round(analysis.marginShare * 100)}%).`,
          ];
          const gain = upgradeGain(analysis);
          candidates.push({
            teamA: A.team,
            teamB: B.team,
            aGives: [aGive],
            bGives: [bGive],
            analysis,
            reasons,
            score: round1(gain + 1 / (1 + analysis.marginShare)),
          });
          pairCount++;
          if (pairCount >= MAX_PER_PAIR) break;
        }
        if (pairCount >= MAX_PER_PAIR) break;
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
}
