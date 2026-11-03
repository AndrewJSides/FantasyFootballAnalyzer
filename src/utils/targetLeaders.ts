// Target Share Leaders board (backlog item 107).
//
// Per-position (RB/WR/TE) target-share leaders over the last 3 completed
// weeks — the season-long "who's actually getting fed" reference board.
// Distinct from Opportunity Watch (item 71), which flags available
// players earning a role with waiver-oriented thresholds, and from Snap
// Leaders (item 104), which ranks by snap share: the board ranks
// everyone, rostered or not, purely by share of his own NFL team's
// targets. Pure NFL data (Sleeper's free public weekly stats: rec_tgt
// against the team-target denominator Opportunity Watch already exports),
// no league needed, so guests get the full board like the /snaps page.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import { teamTargetsByWeek } from '@/utils/opportunityWatch';

export const TARGET_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type TargetPosition = (typeof TARGET_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const TARGET_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_TARGET_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface TargetLeader {
  player: PoolPlayer;
  /** Target share over the recent window (0..1). */
  targetShare: number;
  /** Targets per game over the recent window. */
  targetsPerGame: number;
  /** Receptions per game over the recent window. */
  receptionsPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface TargetLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position target-share leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games, ranked by
 * target share descending (ties broken by targets per game), top 15 per
 * position. Players without a team (or whose team recorded no targets in
 * the window) can't be priced and are skipped. Returns a Map keyed by
 * position; positions with no leaders are absent.
 */
export function buildTargetLeaders(
  input: TargetLeadersInput,
): Map<TargetPosition, TargetLeader[]> {
  const targetsByWeek = teamTargetsByWeek(
    input.poolPlayers,
    input.usageBySleeperId,
  );

  const out = new Map<TargetPosition, TargetLeader[]>();
  for (const pos of TARGET_POSITIONS) {
    const rows: TargetLeader[] = [];
    for (const p of input.poolPlayers) {
      if (p.pos.toUpperCase() !== pos) continue;
      if (!p.team) continue;
      const teamWeeks = targetsByWeek.get(p.team.toUpperCase());
      if (!teamWeeks) continue;
      const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
        .map(([w, line]) => ({ week: Number(w), line }))
        .filter(
          e =>
            Number.isFinite(e.week) &&
            e.week < input.currentWeek &&
            e.week >= input.currentWeek - 3,
        );
      if (entries.length < TARGET_MIN_GAMES) continue;

      const targets = entries.reduce((s, e) => s + e.line.targets, 0);
      const teamTargets = entries.reduce(
        (s, e) => s + (teamWeeks.get(e.week) ?? 0),
        0,
      );
      if (teamTargets <= 0) continue;
      const receptions = entries.reduce((s, e) => s + e.line.receptions, 0);
      rows.push({
        player: p,
        targetShare: round1((targets / teamTargets) * 100) / 100,
        targetsPerGame: round1(targets / entries.length),
        receptionsPerGame: round1(receptions / entries.length),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.targetShare - a.targetShare || b.targetsPerGame - a.targetsPerGame,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_TARGET_LEADERS));
  }
  return out;
}
