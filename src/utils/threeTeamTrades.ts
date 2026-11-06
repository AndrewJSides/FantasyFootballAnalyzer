// Three-team trades (backlog item 172): the Trade Finder only proposes
// two-team swaps, but real leagues — especially near the trade deadline —
// regularly do three-team deals where no two teams match up directly
// (A needs B's RB, B needs C's WR, C needs A's TE). No competitor ships a
// three-team finder; this is TraderApe's edge, built from its own VOR
// model + team profiles, no copied content.
//
// A cycle is three directed legs A -> B -> C -> A, one player per leg —
// except a 'package' leg, which moves TWO depth pieces (see below). Each
// leg reuses the pair finder's gates: the giver is deep (surplus) at the
// position and the receiver genuinely needs that position (best below the
// league median) and gets a better starter out of it (starter gain > 0).
// A leg moves either the giver's second-best depth piece (kind 'depth',
// the v1 shape) or its positional STAR (kind 'star'): a star leg only fires
// when the star beats the receiver's best — the classic "my RB1 for your
// WR1" need swap, folded into the circle. A 'package' leg (the 2-for-1
// remainder) moves the giver's second- AND third-best at the position: it
// only fires when BOTH pieces beat the receiver's current best, so the
// receiver gains a better starter AND a better second-best (depth gain =
// third-best VOR minus the receiver's best, strictly positive by the gate).
// The giver keeps starter cover either way: the `surplus` flag guarantees
// giving the second-best leaves demand covered, giving the star leaves the
// second-best (positive VOR) as the new best with startable-1 still >=
// demand, and a package leg requires startable > demand + 1, so giving two
// still leaves demand covered with the star in place. Star legs are named
// in the reasons with the fallback, package legs with the extra piece and
// the freed bench spot, so the cost is visible, and cycles are
// de-duplicated by deal shape (giver/receiver/position per leg) keeping the
// best star/depth/package variant — four near-identical micro-variants of
// one deal never crowd the list. Ranking is by score = total starter gain
// + total depth gain, so a package variant only beats the 1-for-1 of the
// same shape when its extra piece genuinely deepens the receiver's bench;
// totalGain stays the sum of starter gains, the headline number.
//
// Fairness is deliberately NOT the pair finder's +/-25% VOR band: in a
// three-way deal there is no pairwise price to balance — the same three
// players circulate, so aggregate value is balanced by construction, and
// each team's cost is a player it can spare while its gain is a real
// starter upgrade. The check is starter gain on every leg, and cycles rank
// by total starter gain. A three-team deal can't deep-link into the
// two-team Trade Analyzer, so the page states the exact three-way split
// instead. Legs in one cycle must sit at three distinct positions: a team
// giving and receiving at the same position would double-count its own
// best-before, so those pass-through shapes never form.
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
import { demandFor, teamProfiles } from './tradeFinder';
import { valueLeagueFor, type PositionKey } from './tradeAnalysis';

const POSITIONS: PositionKey[] = ['QB', 'RB', 'WR', 'TE'];

// Maximum cycles kept, ranked by total starter gain.
const MAX_CYCLES = 4;

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface CycleLeg {
  giver: Team;
  receiver: Team;
  /** The player moving along this leg: a surplus depth piece or a star. */
  player: PoolPlayer;
  position: PositionKey;
  /**
   * 'depth' moves the giver's second-best; 'star' moves its positional
   * best; 'package' moves its second- AND third-best (extraPlayer).
   */
  kind: 'depth' | 'star' | 'package';
  playerVor: number;
  /** Receiver's best VOR at the position before the trade. */
  receiverBestBefore: number;
  /** playerVor - receiverBestBefore: the receiver's starter upgrade. */
  starterGain: number;
  /** Star legs only: who the giver falls back to at the position. */
  fallbackName?: string;
  fallbackVor?: number;
  /** Package legs only: the second depth piece moving on this leg. */
  extraPlayer?: PoolPlayer;
  extraPlayerVor?: number;
  /**
   * Package legs only: extraPlayerVor - receiverBestBefore — how much
   * the extra piece lifts the receiver's second-best over the 1-for-1
   * variant. Strictly positive by the firing gate.
   */
  depthGain?: number;
}

export interface ThreeTeamCycle {
  /** Legs in flow order: legs[0] A -> B, legs[1] B -> C, legs[2] C -> A. */
  legs: [CycleLeg, CycleLeg, CycleLeg];
  /** Sum of the three starter gains — the cycle's headline number. */
  totalGain: number;
  /** Sum of the package legs' depth gains (0 when no leg is a package). */
  totalDepthGain: number;
  /** Ranking score: totalGain + totalDepthGain. */
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
  // giver's surplus depth at a position the receiver needs, where the
  // piece beats the receiver's current best. Three variants per
  // giver/receiver/position: the second-best depth piece, the star, and
  // the 2-for-1 package (second- + third-best) — the star only fires when
  // it beats the receiver's best too, and the giver keeps cover either
  // way (see the header note).
  const edges: Edge[] = [];
  for (const giver of profiles) {
    for (const receiver of profiles) {
      if (giver.team.id === receiver.team.id) continue;
      for (const p of POSITIONS) {
        if (!receiver.positions[p].need || !giver.positions[p].surplus) continue;
        const chart = giver.positions[p].depthChart;
        const receiverBestBefore = receiver.positions[p].best;
        for (const [kind, piece] of [
          ['depth', chart[1]],
          ['star', chart[0]],
        ] as const) {
          if (!piece) continue;
          const playerVor = round1(vor.get(piece.id) ?? 0);
          if (playerVor <= 0) continue;
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
              kind,
              playerVor,
              receiverBestBefore,
              starterGain,
              ...(kind === 'star' && chart[1]
                ? {
                    fallbackName: chart[1].name,
                    fallbackVor: round1(vor.get(chart[1].id) ?? 0),
                  }
                : {}),
            },
          });
        }
        // 2-for-1 package leg: the giver sends its second- AND third-best
        // at p, so the receiver gains a better starter and a better
        // second-best. Both pieces must beat the receiver's current best
        // (otherwise the extra piece adds nothing over the 1-for-1), and
        // the giver must keep starter cover after losing TWO pieces
        // (startable > demand + 1 — the surplus flag only covers one).
        // The star never moves on a package leg, mirroring the pair
        // finder's 2-for-1 rule.
        const second = chart[1];
        const third = chart[2];
        if (second && third) {
          const secondVor = round1(vor.get(second.id) ?? 0);
          const thirdVor = round1(vor.get(third.id) ?? 0);
          const starterGain = round1(secondVor - receiverBestBefore);
          const depthGain = round1(thirdVor - receiverBestBefore);
          if (
            secondVor > 0 &&
            thirdVor > 0 &&
            starterGain > 0 &&
            depthGain > 0 &&
            giver.positions[p].startable >
              demandFor(p, valueLeague.rosterSlots) + 1
          ) {
            edges.push({
              giverId: giver.team.id,
              receiverId: receiver.team.id,
              leg: {
                giver: giver.team,
                receiver: receiver.team,
                player: second,
                position: p,
                kind: 'package',
                playerVor: secondVor,
                receiverBestBefore,
                starterGain,
                extraPlayer: third,
                extraPlayerVor: thirdVor,
                depthGain,
              },
            });
          }
        }
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

  // One cycle per deal shape (giver/receiver/position per leg), keeping
  // the best star/depth/package variant: the same three teams trading the
  // same three positions is one deal, not four micro-variants.
  const bestByShape = new Map<string, ThreeTeamCycle>();
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
              // Three distinct positions: a repeated position means some
              // team gives and receives at the same spot, which would
              // double-count its own best-before.
              if (
                legs[0].position === legs[1].position ||
                legs[1].position === legs[2].position ||
                legs[2].position === legs[0].position
              ) {
                continue;
              }
              const shape = legs
                .map(l => `${l.giver.id}|${l.receiver.id}|${l.position}`)
                .sort()
                .join(';');
              const totalGain = round1(
                legs.reduce((sum, l) => sum + l.starterGain, 0),
              );
              const totalDepthGain = round1(
                legs.reduce((sum, l) => sum + (l.depthGain ?? 0), 0),
              );
              const reasons = legs.map(l =>
                l.kind === 'star'
                  ? `${l.giver.name} sends its ${l.position} star ${l.player.name} (${l.playerVor} VOR) to ${l.receiver.name}, upgrading its ${l.position} starter from ${l.receiverBestBefore} to ${l.playerVor} VOR — ${l.giver.name} falls back to ${l.fallbackName} (${l.fallbackVor} VOR) at ${l.position}.`
                  : l.kind === 'package'
                    ? `${l.giver.name} sends ${l.player.name} (${l.playerVor} VOR) and ${l.extraPlayer?.name} (${l.extraPlayerVor} VOR) to ${l.receiver.name} — a 2-for-1 at ${l.position}: the starter upgrades from ${l.receiverBestBefore} to ${l.playerVor} VOR and the bench deepens by +${l.depthGain} VOR, while ${l.giver.name} frees a bench spot.`
                    : `${l.giver.name} sends ${l.player.name} (${l.position}, ${l.playerVor} VOR) to ${l.receiver.name}, upgrading its ${l.position} starter from ${l.receiverBestBefore} to ${l.playerVor} VOR.`,
              );
              const hasPackage = legs.some(l => l.kind === 'package');
              reasons.push(
                `Total starter gain +${totalGain} VOR${totalDepthGain > 0 ? `, plus +${totalDepthGain} VOR of bench depth` : ''} across the three teams — each side gives ${hasPackage ? 'players it can spare' : 'a player it can spare'} and gets a better starter.`,
              );
              const cycle: ThreeTeamCycle = {
                legs,
                totalGain,
                totalDepthGain,
                score: round1(totalGain + totalDepthGain),
                reasons,
              };
              const prev = bestByShape.get(shape);
              if (!prev || cycle.score > prev.score) bestByShape.set(shape, cycle);
            }
          }
        }
      }
    }
  }

  return [...bestByShape.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CYCLES);
}

/** Short label for a cycle's flow, e.g. "Team A → Team B → Team C → Team A". */
export function cycleFlowLabel(cycle: ThreeTeamCycle): string {
  const [a, b, c] = cycle.legs;
  return `${a.giver.name} → ${b.giver.name} → ${c.giver.name} → ${a.giver.name}`;
}
