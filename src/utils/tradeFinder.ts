// Trade finder: propose concrete win-win swaps between league teams.
//
// Scans every team pair for depth-for-need 1-for-1 swaps: Team A is weak at a
// position where Team B is deep, and vice versa. Each candidate is graded with
// the same value model as the Trade Analyzer (VOR from projected points) plus
// the same roster-impact takes, and only swaps that are fair on paper AND
// don't harm either team's starting lineup are proposed.
//
// Season-agnostic: consumes whatever pool season is bundled and whatever
// league is supplied. Requires a connected league (team rosters) — there is
// no guest-mode fallback in this slice.

import type { League, Player, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import {
  DEFAULT_VOR_CONFIG,
  vorPoints,
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
): TeamProfile[] {
  const vor = vorPoints(pool.players, valueLeagueFor(league), cfg);
  const slots = valueLeagueFor(league).rosterSlots;
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

export function findTradeCandidates(
  league: League,
  pool: DraftPoolFile = POOL,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
): TradeCandidate[] {
  const valueLeague = valueLeagueFor(league);
  const vor = vorPoints(pool.players, valueLeague, cfg);
  const profiles = teamProfiles(league, pool, cfg);
  const candidates: TradeCandidate[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const A = profiles[i];
      const B = profiles[j];
      let pairCount = 0;

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
