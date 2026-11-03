// Peak Weeks board (backlog item 106).
//
// Per-position (QB/RB/WR/TE) best single-week full-PPR performances of the
// season so far — the "who has already gone off, and against whom"
// ceiling evidence behind a buy-low or a start/sit call. Distinct from
// League Leaders (item 78, season totals) and from the recent-window
// boards (Snap Leaders item 104, Efficiency Leaders item 105): a player
// may appear more than once, once per explosive week. Priced by joining
// Sleeper's free public weekly points feed (the same one the /efficiency
// page fetches at runtime) with the bundled schedule for the opponent, so
// no new data source. League-independent, like /snaps and /efficiency:
// guests get the full board.

import type { PoolPlayer } from '@/types/draft';

export const PEAK_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type PeakPosition = (typeof PEAK_POSITIONS)[number];

/** Peak weeks kept per position. */
export const MAX_PEAK_WEEKS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface PeakWeek {
  player: PoolPlayer;
  /** The week of the performance (completed weeks only). */
  week: number;
  /** Full-PPR points that week, one decimal. */
  points: number;
  /** Opponent that week from the bundled schedule, null when unknown. */
  opponent: string | null;
}

export interface PeakWeeksInput {
  poolPlayers: PoolPlayer[];
  /** Sleeper player id -> week -> full-PPR points. */
  pointsBySleeperId: Record<string, Record<number, number>>;
  /** The in-progress week — only weeks strictly before it count. */
  currentWeek: number;
  /** Resolves (NFL team, week) to the opponent; defaults to null. */
  opponentFor?: (team: string | null | undefined, week: number) => string | null;
}

/**
 * Per-position best single weeks across all completed weeks (week <
 * currentWeek), ranked by points descending (ties: earlier week first,
 * then player name, so the board is deterministic). A player may appear
 * more than once — once per explosive week. Returns a Map keyed by
 * position; positions with no entries are absent.
 */
export function buildPeakWeeks(
  input: PeakWeeksInput,
): Map<PeakPosition, PeakWeek[]> {
  const out = new Map<PeakPosition, PeakWeek[]>();
  for (const pos of PEAK_POSITIONS) {
    const rows: PeakWeek[] = [];
    for (const p of input.poolPlayers) {
      if (p.pos.toUpperCase() !== pos) continue;
      const weeks = input.pointsBySleeperId[p.sleeperId ?? ''] ?? {};
      for (const [w, pts] of Object.entries(weeks)) {
        const week = Number(w);
        if (!Number.isFinite(week) || week >= input.currentWeek) continue;
        if (typeof pts !== 'number' || !Number.isFinite(pts)) continue;
        rows.push({
          player: p,
          week,
          points: round1(pts),
          opponent: input.opponentFor?.(p.team, week) ?? null,
        });
      }
    }
    rows.sort(
      (a, b) =>
        b.points - a.points ||
        a.week - b.week ||
        a.player.name.localeCompare(b.player.name),
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_PEAK_WEEKS));
  }
  return out;
}
