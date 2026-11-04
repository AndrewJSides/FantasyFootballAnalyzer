// League-mode TD/usage component join (pipeline follow-up: league-mode
// wiring of the projection model's TD regression and usage-trend terms).
//
// League playerWeeklyPoints is points-only — the sync stores no TD or
// usage lines, and building a sync-side component store would touch the
// sync schema. Instead, league Start/Sit reuses the same free Sleeper
// weekly stats the guest fetch already reads: each roster player resolves
// to a bundled pool player (which carries the Sleeper id, including for
// Yahoo/ESPN ids via the name fallback in resolvePoolPlayer), and that
// player's Sleeper TD/usage series is re-keyed onto the roster player's
// platform id — the key space scoreRosterPlayers already looks up.
//
// Behavior at today's production defaults is unchanged (both terms are
// strength 0, measured OFF on weeks 1–8): the join only makes a future
// nonzero default move league mode together with guest mode. A failed
// Sleeper fetch degrades to no components — league points still render,
// the terms just stay 0, exactly as before this wiring existed. Series
// are passed through as-is, including partial ones: scoreRosterPlayers
// attaches a component line per week only when the week carries a finite
// value, and the model skips a term whose series is incomplete rather
// than guessing it.

import type { Player } from '@/types';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';

export interface RosterComponentMaps {
  /** Platform-id-keyed per-week TD fantasy points, like weeklyPoints. */
  weeklyTdPoints: Record<string, Record<number, number>>;
  /** Platform-id-keyed per-week opportunities, like weeklyPoints. */
  weeklyUsage: Record<string, Record<number, number>>;
}

/**
 * Backlog item 123 — roster key (platformId ?? id) -> Sleeper id, via the
 * same pool join as the component maps. Unlike the component maps this is
 * not restricted to skill positions: Sleeper publishes weekly projections
 * for kickers and defenses too, so a K/DST row gets its market number when
 * the pool resolves it. Players with no pool match (or no Sleeper id) are
 * simply absent — the caller renders a dash, never a guess.
 */
export function mapRosterToSleeperIds(roster: Player[]): Map<string, string> {
  const poolIndex = indexPool(POOL);
  const out = new Map<string, string>();
  for (const rosterPlayer of roster) {
    const poolPlayer = resolvePoolPlayer(rosterPlayer, poolIndex);
    const sleeperId = poolPlayer?.sleeperId;
    if (!sleeperId) continue;
    out.set(rosterPlayer.platformId ?? rosterPlayer.id, String(sleeperId));
  }
  return out;
}

/** Skill positions only: K/DST carry no TD/usage series worth pricing. */
const COMPONENT_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

export function mapSleeperComponentsToRosterKeys(
  roster: Player[],
  tdBySleeperId: Record<string, Record<number, number>>,
  usageBySleeperId: Record<string, Record<number, number>>,
): RosterComponentMaps {
  const poolIndex = indexPool(POOL);
  const weeklyTdPoints: Record<string, Record<number, number>> = {};
  const weeklyUsage: Record<string, Record<number, number>> = {};
  for (const rosterPlayer of roster) {
    if (!COMPONENT_POSITIONS.has(rosterPlayer.position)) continue;
    const poolPlayer = resolvePoolPlayer(rosterPlayer, poolIndex);
    const sleeperId = poolPlayer?.sleeperId;
    if (!sleeperId) continue;
    const key = rosterPlayer.platformId ?? rosterPlayer.id;
    const tdSeries = tdBySleeperId[String(sleeperId)];
    if (tdSeries !== undefined) weeklyTdPoints[key] = tdSeries;
    const usageSeries = usageBySleeperId[String(sleeperId)];
    if (usageSeries !== undefined) weeklyUsage[key] = usageSeries;
  }
  return { weeklyTdPoints, weeklyUsage };
}
