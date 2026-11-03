// Snap Leaders board (backlog item 104).
//
// Per-position (RB/WR/TE) snap-share leaders over the last 3 completed
// weeks — the season-long "who's actually playing every snap" reference
// board. Distinct from Opportunity Watch (item 71), which flags available
// players earning a role with waiver-oriented thresholds: the board ranks
// everyone, rostered or not, purely by snap share. Pure NFL data (Sleeper's
// free public weekly stats: off_snp / tm_off_snp / rec_tgt), no league
// needed, so guests get the full board like the /points-allowed page.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import { teamTargetsByWeek } from '@/utils/opportunityWatch';

export const SNAP_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type SnapPosition = (typeof SNAP_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const SNAP_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_SNAP_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface SnapLeader {
  player: PoolPlayer;
  /** Snap share over the recent window (0..1). */
  snapShare: number;
  /** Target share over the recent window (0..1); null without team data. */
  targetShare: number | null;
  /** Touches per game over the recent window (rush att + receptions). */
  touchesPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface SnapLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position snap-share leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games, ranked by
 * snap share descending (ties broken by touches per game), top 15 per
 * position. Returns a Map keyed by position; positions with no leaders
 * are absent.
 */
export function buildSnapLeaders(
  input: SnapLeadersInput,
): Map<SnapPosition, SnapLeader[]> {
  const targetsByWeek = teamTargetsByWeek(
    input.poolPlayers,
    input.usageBySleeperId,
  );

  const out = new Map<SnapPosition, SnapLeader[]>();
  for (const pos of SNAP_POSITIONS) {
    const rows: SnapLeader[] = [];
    for (const p of input.poolPlayers) {
      if (p.pos.toUpperCase() !== pos) continue;
      const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
        .map(([w, line]) => ({ week: Number(w), line }))
        .filter(
          e =>
            Number.isFinite(e.week) &&
            e.week < input.currentWeek &&
            e.week >= input.currentWeek - 3 &&
            e.line.teamSnaps > 0,
        );
      if (entries.length < SNAP_MIN_GAMES) continue;

      const offSnaps = entries.reduce((s, e) => s + e.line.offSnaps, 0);
      const teamSnaps = entries.reduce((s, e) => s + e.line.teamSnaps, 0);
      if (teamSnaps <= 0) continue;
      const snapShare = offSnaps / teamSnaps;

      // Same team-target denominator as Opportunity Watch: the player's
      // targets against his own NFL team's targets in the same weeks.
      let targetShare: number | null = null;
      if (p.team) {
        const teamWeeks = targetsByWeek.get(p.team.toUpperCase());
        if (teamWeeks) {
          const targets = entries.reduce((s, e) => s + e.line.targets, 0);
          const teamTargets = entries.reduce(
            (s, e) => s + (teamWeeks.get(e.week) ?? 0),
            0,
          );
          if (teamTargets > 0) targetShare = targets / teamTargets;
        }
      }

      const touches = entries.reduce(
        (s, e) => s + e.line.rushAtt + e.line.receptions,
        0,
      );
      rows.push({
        player: p,
        snapShare: round1(snapShare * 100) / 100,
        targetShare:
          targetShare === null ? null : round1(targetShare * 100) / 100,
        touchesPerGame: round1(touches / entries.length),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) => b.snapShare - a.snapShare || b.touchesPerGame - a.touchesPerGame,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_SNAP_LEADERS));
  }
  return out;
}
