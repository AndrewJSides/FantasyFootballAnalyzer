// QB & TE streaming recommendations (backlog item 39): rank the available
// starting quarterbacks and tight ends for a given week by how generous
// their opponent's defense has been to that position over completed weeks.
//
// Data is the same weekly matchup-allowed ratings that power the Matchup
// Calendar and weekly matchup chips (scripts/buildMatchupRatings.ts, from
// Sleeper's free weekly stat lines, half-PPR scoring for skill positions).
// Rank 1 = the defense gives up the most fantasy points to the position
// (the best streaming target). Implemented from TraderApe's own data; the
// weekly "who do I stream at QB / TE" question is the FantasyPros QB/TE
// Streamers use case, priced here on our own numbers.

import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import scheduleJson from '@/data/nflSchedule.2026.json';
import allowedJson from '@/data/matchupAllowed.2026.json';

export type SkillStreamerPosition = 'QB' | 'TE';
export type SkillMatchupLabel = 'favorable' | 'neutral' | 'tough';

export interface SkillMatchup {
  /** The bundled pool id of the streaming player (for keys). */
  playerId: string;
  /** The streaming player's name. */
  name: string;
  /** The player's NFL team (canonical abbreviation). */
  team: string;
  position: SkillStreamerPosition;
  /** This week's opponent (canonical abbreviation). */
  opponent: string;
  /** Avg fantasy pts the opponent's defense allowed to the position. */
  avgAllowed: number;
  /** 1 = most generous to the position (best streaming target). */
  rank: number;
  label: SkillMatchupLabel;
  /** The player's own projected weekly points (bundled pool, half-PPR). */
  ownWeeklyProj: number;
  /** Questionable / Out / IR / PUP / Sus — absent when healthy. */
  injuryStatus?: string;
}

interface ScheduleFile {
  season: number;
  weeks: Record<string, Array<[string, string]>>;
  generatedAt: string;
}

interface AllowedFile {
  season: number;
  weeks: [number, number];
  teams: Record<string, Record<string, { avg: number; rank: number }>>;
  generatedAt: string;
}

// JSON imports widen tuples to arrays; assert through unknown so the
// tuple types hold.
const SCHEDULE = scheduleJson as unknown as ScheduleFile;
const ALLOWED = allowedJson as unknown as AllowedFile;

function labelFor(rank: number): SkillMatchupLabel {
  // Same cutoffs as the weekly skill-position matchup rating and the
  // D/ST + kicker streamers.
  if (rank <= 10) return 'favorable';
  if (rank >= 23) return 'tough';
  return 'neutral';
}

/** First and last completed week that fed the matchup-allowed averages. */
export function skillMatchupWeeksRange(): [number, number] {
  return ALLOWED.weeks;
}

/**
 * The listed starter (per the bundled draft pool) at the position for each
 * NFL team. Teams whose starter isn't in the pool fall back to no entry —
 * never a phantom player.
 */
export function startingSkillPlayers(
  position: SkillStreamerPosition,
  pool: DraftPoolFile = POOL,
): Map<string, PoolPlayer> {
  const byTeam = new Map<string, PoolPlayer>();
  for (const p of pool.players) {
    if (p.pos !== position || p.depthChartOrder !== 1 || !p.team) continue;
    if (!byTeam.has(p.team)) byTeam.set(p.team, p);
  }
  return byTeam;
}

/** Season-long half-PPR projection expressed as a weekly rate (tie-break). */
function weeklyProjectionOf(p: PoolPlayer): number {
  const season = p.projPtsPpr ?? p.projPts ?? p.projPtsStd ?? 0;
  return season / 17;
}

/**
 * This week's streaming matchup for one team's starter at the position:
 * the opponent from the bundled schedule plus the opponent's generosity
 * rating to the position. Null when the team has no game that week (bye),
 * no starter in the pool, or no matchup-allowed data.
 */
export function getSkillMatchup(
  team: string | null | undefined,
  week: number | undefined,
  position: SkillStreamerPosition,
  schedule: ScheduleFile = SCHEDULE,
  allowed: AllowedFile = ALLOWED,
  starters: Map<string, PoolPlayer> = startingSkillPlayers(position),
): SkillMatchup | null {
  if (!team || week === undefined) return null;
  const games = schedule.weeks[String(week)];
  const game = games?.find(([h, a]) => h === team || a === team);
  if (!game) return null;
  const starter = starters.get(team);
  if (!starter) return null;
  const opponent = game[0] === team ? game[1] : game[0];
  const entry = allowed.teams[opponent]?.[position];
  if (!entry) return null;
  return {
    playerId: starter.id,
    name: starter.name,
    team,
    position,
    opponent,
    avgAllowed: entry.avg,
    rank: entry.rank,
    label: labelFor(entry.rank),
    ownWeeklyProj: weeklyProjectionOf(starter),
    ...(starter.injuryStatus ? { injuryStatus: starter.injuryStatus } : {}),
  };
}

/**
 * Rank the players available in `week` at the position for streaming: every
 * NFL team with a game that week and no matchup-allowed data gaps,
 * excluding the ones already rostered (matched by pool player id). Ordered
 * by opponent generosity (best target first), ties broken by the player's
 * own projected weekly points.
 */
export function rankSkillStreamers(
  week: number | undefined,
  position: SkillStreamerPosition,
  rosteredPlayerIds: ReadonlySet<string>,
  limit = 5,
  schedule: ScheduleFile = SCHEDULE,
  allowed: AllowedFile = ALLOWED,
  starters?: Map<string, PoolPlayer>,
): SkillMatchup[] {
  if (week === undefined) return [];
  const byTeam = starters ?? startingSkillPlayers(position);
  const seen = new Set<string>();
  const entries: SkillMatchup[] = [];
  for (const [h, a] of schedule.weeks[String(week)] ?? []) {
    for (const team of [h, a]) {
      if (seen.has(team)) continue;
      seen.add(team);
      const matchup = getSkillMatchup(team, week, position, schedule, allowed, byTeam);
      if (!matchup || rosteredPlayerIds.has(matchup.playerId)) continue;
      entries.push(matchup);
    }
  }
  entries.sort((x, y) => x.rank - y.rank || y.ownWeeklyProj - x.ownWeeklyProj);
  return entries.slice(0, Math.max(0, limit));
}
