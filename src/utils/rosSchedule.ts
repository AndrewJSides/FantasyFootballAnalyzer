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
 * `fromWeek` (inclusive). Bye weeks are skipped — a team simply has no
 * entry that week.
 */
export function remainingOpponents(
  team: string | null | undefined,
  fromWeek: number,
  schedule: ScheduleFile = SCHEDULE,
): Array<{ week: number; opponent: string }> {
  if (!team || !Number.isFinite(fromWeek)) return [];
  const weeks = Object.keys(schedule.weeks)
    .map(Number)
    .filter(n => Number.isFinite(n) && n >= fromWeek)
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
 * completed-week allowed-vs-position averages. Returns null for K/DST,
 * unknown teams/positions, or when no remaining games carry allowed data.
 */
export function rosMatchupStrength(
  team: string | null | undefined,
  position: string | null | undefined,
  fromWeek: number,
  schedule: ScheduleFile = SCHEDULE,
  allowed: AllowedFile = ALLOWED,
): RosScheduleStrength | null {
  const pos = (position ?? '').toUpperCase().trim();
  if (!team || !SKILL_POSITIONS.has(pos)) return null;
  const games: RosOpponent[] = [];
  for (const { week, opponent } of remainingOpponents(team, fromWeek, schedule)) {
    const entry = allowed.teams[opponent]?.[pos];
    if (!entry) continue;
    games.push({ week, opponent, avgAllowed: entry.avg, rank: entry.rank });
  }
  if (games.length === 0) return null;
  const avgRank = games.reduce((sum, g) => sum + g.rank, 0) / games.length;
  return { avgRank, label: labelFor(avgRank), games };
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
 * Full accessible label: verdict, average rank, and the remaining slate
 * game by game — e.g. "Rest of season schedule: Soft, opponents average the
 * 8th-easiest matchup for RBs. W9 vs DAL (5th-easiest) · W10 at PHI ...".
 */
export function rosLabel(strength: RosScheduleStrength, position: string): string {
  const verdict =
    strength.label === 'favorable' ? 'Soft' : strength.label === 'tough' ? 'Tough' : 'Average';
  const easy = strength.label === 'tough' ? 'toughest' : 'easiest';
  const head =
    `Rest of season: ${verdict} schedule — remaining opponents average ` +
    `the ${ordinalRank(Math.round(strength.avgRank))}-${easy} matchup for ${position.toUpperCase()}s`;
  const slate = strength.games
    .map(g => `W${g.week} vs ${g.opponent} (${ordinalRank(g.rank)}-${easy})`)
    .join(' · ');
  return `${head}. ${slate}`;
}
