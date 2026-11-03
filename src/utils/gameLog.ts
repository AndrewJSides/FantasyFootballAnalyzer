// Game log (backlog item 112): the week-by-week record behind the Points By
// Week chart — each completed week's opponent from the bundled 2026 NFL
// schedule joined to the league snapshot's weekly full-PPR series. Bye weeks
// (no game in the schedule) carry a null opponent; weeks with no recorded
// points carry null points — the table renders those as "Bye" and a dash
// rather than inventing a zero, so a did-not-play week never reads as a
// scoreless game.

import type { ScheduleFile } from './matchupRating';
import scheduleJson from '@/data/nflSchedule.2026.json';

const SCHEDULE = scheduleJson as unknown as ScheduleFile;

export interface GameLogRow {
  week: number;
  /** Null on the team's bye week (no game in the schedule). */
  opponent: string | null;
  /** Null when the weekly series records no points for the week. */
  points: number | null;
}

/**
 * One row per week from 1 through `toWeek` (the caller's last completed
 * week). Returns [] without a team, without a weekly series, or for a
 * non-positive week range, so the section hides in guest mode and on old
 * snapshots exactly like the chart it sits under.
 */
export function buildGameLog(
  team: string | null | undefined,
  weekly: Record<number, number> | undefined,
  toWeek: number,
  schedule: ScheduleFile = SCHEDULE,
): GameLogRow[] {
  if (!team || !weekly || !Number.isFinite(toWeek) || toWeek < 1) return [];
  const rows: GameLogRow[] = [];
  for (let week = 1; week <= toWeek; week++) {
    const game = schedule.weeks[String(week)]?.find(
      ([home, away]) => home === team || away === team,
    );
    const opponent = game ? (game[0] === team ? game[1] : game[0]) : null;
    const pts = weekly[week];
    rows.push({
      week,
      opponent,
      points: typeof pts === 'number' && Number.isFinite(pts) ? pts : null,
    });
  }
  return rows;
}
