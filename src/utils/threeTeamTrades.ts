// Three-team trades (backlog item 172): the Trade Finder only proposes
// two-team swaps, but real leagues — especially near the trade deadline —
// regularly do three-team deals where no two teams match up directly
// (A needs B's RB, B needs C's WR, C needs A's TE). No competitor ships a
// three-team finder; this is TraderApe's edge, built from its own VOR
// model + team profiles, no copied content.
//
// A cycle is three directed legs A -> B -> C -> A, one player per leg. Each
// leg reuses the pair finder's gates: the giver is deep (surplus) at the
// position and gives its second-best depth piece — never a star or a
// starter — and the receiver genuinely needs that position (best below the
// league median) and gets a better starter out of it (starter gain > 0).
//
// Fairness is deliberately NOT the pair finder's +/-25% VOR band: in a
// three-way deal there is no pairwise price to balance — the same three
// players circulate, so aggregate value is balanced by construction, and
// each team's cost is a bench piece worth 0 in its starting lineup while
// its gain is a real starter upgrade. The check is starter gain on every
// leg, and cycles rank by total starter gain. A three-team deal can't
// deep-link into the two-team Trade Analyzer, so the page states the exact
// three-way split instead.
//
// Season-agnostic: consumes whatever pool season is bundled and whatever
// league is supplied, like findTradeCandidates. Needs 3+ teams, so guest
// mode (two synthetic teams) has no cycles and the page hides the section.

import type { League, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import {
  DEFAULT_VOR_CONFIG,
  vorPoints,
  type ValueLeague,
  type VorConfig,
} from './projectionValues';
import { teamProfiles } from './tradeFinder';
import { valueLeagueFor, type PositionKey } from './tradeAnalysis';

const POSITIONS: PositionKey[] = ['QB', 'RB', 'WR', 'TE'];

// Maximum cycles kept, ranked by total starter gain.
const MAX_CYCLES = 4;

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface CycleLeg {
  giver: Team;
  receiver: Team;
  /** The surplus depth piece moving along this leg (never a star). */
  player: PoolPlayer;
  position: PositionKey;
  playerVor: number;
  /** Receiver's best VOR at the position before the trade. */
  receiverBestBefore: number;
  /** playerVor - receiverBestBefore: the receiver's starter upgrade. */
  starterGain: number;
}

export interface ThreeTeamCycle {
  /** Legs in flow order: legs[0] A -> B, legs[1] B -> C, legs[2] C -> A. */
  legs: [CycleLeg, CycleLeg, CycleLeg];
  /** Sum of the three starter gains — the cycle's ranking score. */
  totalGain: number;
  score: number;
  reasons: string[];
}

interface Edge {
  giverId: string;
  receiverId: string;
  leg: CycleLeg;
}

/**
 * Find three-team trade cycles: each team gives one surplus depth piece to
 * a team that needs it and receives a better starter at a position it needs.
 * Returns at most MAX_CYCLES cycles, best total starter gain first.
 */
export function findThreeTeamCycles(
  league: League,
  pool: DraftPoolFile = POOL,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
  valueLeague: ValueLeague = valueLeagueFor(league),
): ThreeTeamCycle[] {
  const profiles = teamProfiles(league, pool, cfg, valueLeague);
  if (profiles.length < 3) return [];
  const vor = vorPoints(pool.players, valueLeague, cfg);

  // Directed edges: giver -> receiver at one position, priced on the
  // giver's second-best (depth, not the star) at a surplus position the
  // receiver needs, where the piece beats the receiver's current best.
  const edges: Edge[] = [];
  for (const giver of profiles) {
    for (const receiver of profiles) {
      if (giver.team.id === receiver.team.id) continue;
      for (const p of POSITIONS) {
        if (!receiver.positions[p].need || !giver.positions[p].surplus) continue;
        const piece = giver.positions[p].depthChart[1];
        if (!piece) continue;
        const playerVor = round1(vor.get(piece.id) ?? 0);
        if (playerVor <= 0) continue;
        const receiverBestBefore = receiver.positions[p].best;
        const starterGain = round1(playerVor - receiverBestBefore);
        if (starterGain <= 0) continue;
        edges.push({
          giverId: giver.team.id,
          receiverId: receiver.team.id,
          leg: {
            giver: giver.team,
            receiver: receiver.team,
            player: piece,
            position: p,
            playerVor,
            receiverBestBefore,
            starterGain,
          },
        });
      }
    }
  }
  if (edges.length < 3) return [];

  const byPair = new Map<string, Edge[]>();
  for (const e of edges) {
    const key = `${e.giverId}|${e.receiverId}`;
    const list = byPair.get(key) ?? [];
    list.push(e);
    byPair.set(key, list);
  }

  const cycles: ThreeTeamCycle[] = [];
  const seen = new Set<string>();
  const ids = profiles.map(p => p.team.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = 0; j < ids.length; j++) {
      if (j === i) continue;
      for (let k = 0; k < ids.length; k++) {
        if (k === i || k === j) continue;
        const first = byPair.get(`${ids[i]}|${ids[j]}`) ?? [];
        const second = byPair.get(`${ids[j]}|${ids[k]}`) ?? [];
        const third = byPair.get(`${ids[k]}|${ids[i]}`) ?? [];
        for (const e1 of first) {
          for (const e2 of second) {
            for (const e3 of third) {
              const legs = [e1.leg, e2.leg, e3.leg] as ThreeTeamCycle['legs'];
              const key = legs
                .map(l => `${l.giver.id}|${l.player.id}|${l.receiver.id}`)
                .sort()
                .join(';');
              if (seen.has(key)) continue;
              seen.add(key);
              const totalGain = round1(
                legs.reduce((sum, l) => sum + l.starterGain, 0),
              );
              const reasons = legs.map(
                l =>
                  `${l.giver.name} sends ${l.player.name} (${l.position}, ${l.playerVor} VOR) to ${l.receiver.name}, upgrading its ${l.position} starter from ${l.receiverBestBefore} to ${l.playerVor} VOR.`,
              );
              reasons.push(
                `Total starter gain +${totalGain} VOR across the three teams — each side gives bench depth it can spare and gets a better starter.`,
              );
              cycles.push({ legs, totalGain, score: totalGain, reasons });
            }
          }
        }
      }
    }
  }

  return cycles
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CYCLES);
}

/** Short label for a cycle's flow, e.g. "Team A → Team B → Team C → Team A". */
export function cycleFlowLabel(cycle: ThreeTeamCycle): string {
  const [a, b, c] = cycle.legs;
  return `${a.giver.name} → ${b.giver.name} → ${c.giver.name} → ${a.giver.name}`;
}
