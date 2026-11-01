// Upcoming matchup chips for the Start/Sit table (backlog item 66): each
// starter's next N played weeks as favorable/tough/neutral chips, priced on
// the same season-to-date allowed-vs-position averages as the weekly rating
// and the Matchup Calendar (backlog item 31) — a difficulty map, not a
// forecast. Answers "can I sit him for one bad week and come back after"
// right in the row where the start/sit call is made.

import {
  buildMatchupCalendar,
  type AllowedFile,
  type MatchupCalendarEntry,
  type ScheduleFile,
} from '@/utils/matchupRating';

/**
 * The player's next `count` played weeks strictly after `fromWeek`
 * (exclusive — the current week already has its own Matchup column),
 * each with that week's opponent + rating. Bye weeks are skipped; the
 * bundled window is oversized by 3 so the count stays exact even with a
 * bye (and a mid-season international-week gap) in the window. Returns
 * fewer entries than `count` when the remaining schedule runs out.
 */
export function upcomingMatchupChips(
  team: string | null | undefined,
  position: string | null | undefined,
  fromWeek: number,
  count = 3,
  schedule?: ScheduleFile,
  allowed?: AllowedFile,
): MatchupCalendarEntry[] {
  if (!team || !Number.isFinite(fromWeek)) return [];
  const calendar = buildMatchupCalendar(
    team,
    position,
    fromWeek + 1,
    fromWeek + count + 3,
    schedule,
    allowed,
  );
  return calendar.filter(e => e.rating !== null).slice(0, count);
}
