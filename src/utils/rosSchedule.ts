// Rest-of-season strength of schedule (backlog item 11): for a player's
// NFL team and skill position, average the opponents' fantasy points
// allowed-vs-position ranks over the remaining schedule. Same data as the
// weekly matchup rating (matchupRating.ts) — the bundled 2026 NFL schedule
// plus per-team points allowed to each position from completed weeks.
// Rank 1 = allows the most points (easiest matchup), so a lower average
// rank means a softer remaining schedule.

import scheduleJson from '@/data/nflSchedule.2026.json';
import allowedJson from '@/data/matchupAllowed.2026.json';
import type { ScheduleFile, AllowedFile } from './matchupRating';

export type RosLabel = 'favorable' | 'neutral' | 'tough';

export interface RosOpponent {
  week: number;
  opponent: string;
  avgAllowed: number;
  rank: number;
}

export interface RosScheduleStrength {
  /** Mean of the opponents' allowed-vs-position ranks (1 = easiest). */
  avgRank: number;
  label: RosLabel;
  games: RosOpponent[];
}

const SCHEDULE = scheduleJson as unknown as ScheduleFile;
const ALLOWED = allowedJson as unknown as AllowedFile;

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

function labelFor(avgRank: number): RosLabel {
  if (avgRank <= 10) return 'favorable';
  if (avgRank >= 23) return 'tough';
  return 'neutral';
}

/**
 * Remaining regular-season opponents for an NFL team, starting at
 * `fromWeek` (inclusive) and ending at `toWeek` (inclusive) when given.
 * Bye weeks are skipped — a team simply has no entry that week.
 */
export function remainingOpponents(
  team: string | null | undefined,
  fromWeek: number,
  schedule: ScheduleFile = SCHEDULE,
  toWeek?: number,
): Array<{ week: number; opponent: string }> {
  if (!team || !Number.isFinite(fromWeek)) return [];
  const weeks = Object.keys(schedule.weeks)
    .map(Number)
    .filter(
      n =>
        Number.isFinite(n) &&
        n >= fromWeek &&
        (toWeek === undefined || n <= toWeek),
    )
    .sort((a, b) => a - b);
  const games: Array<{ week: number; opponent: string }> = [];
  for (const week of weeks) {
    const game = schedule.weeks[String(week)]?.find(([h, a]) => h === team || a === team);
    if (!game) continue;
    games.push({ week, opponent: game[0] === team ? game[1] : game[0] });
  }
  return games;
}

/**
 * Rest-of-season matchup strength for one player, priced on the opponents'
 * completed-week allowed-vs-position averages. When `toWeek` is given the
 * window is clipped there (used for the playoff-weeks variant below).
 * Returns null for K/DST, unknown teams/positions, or when no games in the
 * window carry allowed data.
 */
export function rosMatchupStrength(
  team: string | null | undefined,
  position: string | null | undefined,
  fromWeek: number,
  schedule: ScheduleFile = SCHEDULE,
  allowed: AllowedFile = ALLOWED,
  toWeek?: number,
): RosScheduleStrength | null {
  const pos = (position ?? '').toUpperCase().trim();
  if (!team || !SKILL_POSITIONS.has(pos)) return null;
  const games: RosOpponent[] = [];
  for (const { week, opponent } of remainingOpponents(team, fromWeek, schedule, toWeek)) {
    const entry = allowed.teams[opponent]?.[pos];
    if (!entry) continue;
    games.push({ week, opponent, avgAllowed: entry.avg, rank: entry.rank });
  }
  if (games.length === 0) return null;
  const avgRank = games.reduce((sum, g) => sum + g.rank, 0) / games.length;
  return { avgRank, label: labelFor(avgRank), games };
}

/**
 * The fantasy-playoff week window for a league. Defaults to weeks 15–17
 * (the ESPN/Bleacher Nation convention — most leagues crown their champion
 * in week 17, week 18 excluded), shifted to the league's playoffStartWeek
 * when known. Clipped at week 18.
 */
export function playoffWeeksForLeague(playoffStartWeek?: number | null): number[] {
  const start =
    playoffStartWeek && Number.isFinite(playoffStartWeek) ? playoffStartWeek : 15;
  const weeks: number[] = [];
  for (let w = start; w <= Math.min(start + 2, 18); w++) weeks.push(w);
  return weeks.length > 0 ? weeks : [15, 16, 17];
}

/**
 * Playoff-schedule strength for one player (backlog item 19): same engine
 * as ROS SOS, but the opponent ranks are averaged over the league's fantasy
 * playoff weeks only (weeks 15–17 by default). Null for K/DST, unknown
 * teams/positions, or no allowed data in the window.
 */
export function playoffScheduleStrength(
  team: string | null | undefined,
  position: string | null | undefined,
  weeks: number[] | null | undefined,
  schedule: ScheduleFile = SCHEDULE,
  allowed: AllowedFile = ALLOWED,
): RosScheduleStrength | null {
  if (!weeks || weeks.length === 0) return null;
  const from = Math.min(...weeks);
  const to = Math.max(...weeks);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return rosMatchupStrength(team, position, from, schedule, allowed, to);
}

/** Compact cell text, e.g. "Soft (8.4)". */
export function rosShort(strength: RosScheduleStrength): string {
  const verdict =
    strength.label === 'favorable' ? 'Soft' : strength.label === 'tough' ? 'Tough' : 'Avg';
  return `${verdict} (${strength.avgRank.toFixed(1)})`;
}

function ordinalRank(rank: number): string {
  const suffix =
    rank % 10 === 1 && rank % 100 !== 11
      ? 'st'
      : rank % 10 === 2 && rank % 100 !== 12
        ? 'nd'
        : rank % 10 === 3 && rank % 100 !== 13
          ? 'rd'
          : 'th';
  return `${rank}${suffix}`;
}

/**
 * Full accessible label: verdict, average rank, and the slate game by game —
 * e.g. "Rest of season: Soft, opponents average the 8th-easiest matchup for
 * RBs. W9 vs DAL (5th-easiest) · W10 at PHI ...". Pass the playoff window
 * (weeks from playoffWeeksForLeague) to name the fantasy-playoff slate
 * instead of the rest of season.
 */
export function rosLabel(
  strength: RosScheduleStrength,
  position: string,
  playoffWeeks?: number[] | null,
): string {
  const verdict =
    strength.label === 'favorable' ? 'Soft' : strength.label === 'tough' ? 'Tough' : 'Average';
  const easy = strength.label === 'tough' ? 'toughest' : 'easiest';
  const slateWords =
    playoffWeeks && playoffWeeks.length > 0
      ? `Fantasy playoffs (W${Math.min(...playoffWeeks)}–W${Math.max(...playoffWeeks)})`
      : 'Rest of season';
  const slateGames =
    playoffWeeks && playoffWeeks.length > 0 ? 'playoff opponents' : 'remaining opponents';
  const head =
    `${slateWords}: ${verdict} schedule — ${slateGames} average ` +
    `the ${ordinalRank(Math.round(strength.avgRank))}-${easy} matchup for ${position.toUpperCase()}s`;
  const slate = strength.games
    .map(g => `W${g.week} vs ${g.opponent} (${ordinalRank(g.rank)}-${easy})`)
    .join(' · ');
  return `${head}. ${slate}`;
}
