// Target Volume Leaders board (backlog item 155).
//
// Per-position (RB/WR/TE) target leaders over the last 3 completed
// weeks — the season-long "who is actually getting thrown to"
// reference board. Targets are Sleeper's rec_tgt and receptions are
// rec, both already mapped in WeeklyUsageLine, so the board prices
// the raw-volume read itself: the target-share board (item 107)
// shows share-of-team, which hides the volume — a 30% share on a
// 20-pass team is 6 targets, on a 40-pass team it's 12. Ranked by
// targets per game so a 2-game window can't outrank a 3-game one on
// raw totals. Pure NFL data (Sleeper's free public weekly stats),
// no league needed, so guests get the full board like the /targets,
// /red-zone, /air-yards, /deep-plays, /catch-rate, /yac, /ypr,
// /ypc, /scrimmage, /touchdowns, and /passing pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const TARGET_VOLUME_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type TargetVolumePosition =
  (typeof TARGET_VOLUME_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const TARGET_VOLUME_MIN_GAMES = 2;
/** Leaders kept. */
export const MAX_TARGET_VOLUME_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface TargetVolumeLeader {
  player: PoolPlayer;
  /** Targets over the recent window. */
  targets: number;
  /** Targets per game over the recent window. */
  targetsPerGame: number;
  /** Receptions over the recent window. */
  receptions: number;
  /** Catch rate (receptions / targets) as a percentage, one decimal. */
  catchRate: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface TargetVolumeLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position target leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games,
 * ranked by targets per game descending (ties broken by total
 * targets, then receptions), top 15 per position. Players with no
 * targets never lead the board. Returns a Map keyed by position;
 * a position's entry is absent when no player qualifies.
 */
export function buildTargetVolumeLeaders(
  input: TargetVolumeLeadersInput,
): Map<TargetVolumePosition, TargetVolumeLeader[]> {
  const out = new Map<TargetVolumePosition, TargetVolumeLeader[]>();
  for (const pos of TARGET_VOLUME_POSITIONS) {
    const rows: TargetVolumeLeader[] = [];
    for (const p of input.poolPlayers) {
      if (p.pos.toUpperCase() !== pos) continue;
      const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
        .map(([w, line]) => ({ week: Number(w), line }))
        .filter(
          e =>
            Number.isFinite(e.week) &&
            e.week < input.currentWeek &&
            e.week >= input.currentWeek - 3,
        );
      if (entries.length < TARGET_VOLUME_MIN_GAMES) continue;

      const targets = entries.reduce((s, e) => s + e.line.targets, 0);
      if (targets <= 0) continue;
      const receptions = entries.reduce((s, e) => s + e.line.receptions, 0);
      rows.push({
        player: p,
        targets,
        targetsPerGame: round1(targets / entries.length),
        receptions,
        catchRate: round1((receptions / targets) * 100),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.targetsPerGame - a.targetsPerGame ||
        b.targets - a.targets ||
        b.receptions - a.receptions,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_TARGET_VOLUME_LEADERS));
  }
  return out;
}
