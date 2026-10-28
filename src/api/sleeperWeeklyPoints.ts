// Full-PPR points per player per completed week, from Sleeper's public
// weekly stats (free, no auth) — the data source behind guest-mode Start/Sit,
// so a visitor with no connected league still gets a projection-driven
// lineup. Same endpoint/fetch pattern as sleeperGamesPlayed.ts (which reads
// `gp` from the same responses); kept separate because the shapes and
// failure modes differ: a week that loads but has no pts_ppr for a player
// still counts as a loaded week for that player's games-played denominator.

import { logger } from '@/utils/logger';

const STATS_URL = 'https://api.sleeper.app/v1/stats/nfl/regular';

export interface WeeklyPprPoints {
  season: number;
  /** Weeks that loaded successfully (the completed weeks being scored). */
  weeks: number[];
  /** Sleeper player id -> week -> full-PPR points. */
  pointsBySleeperId: Record<string, Record<number, number>>;
  /** Sleeper player id -> weeks with gp > 0 (played, even if scoreless). */
  gamesBySleeperId: Record<string, number[]>;
}

export async function fetchWeeklyPprPoints(
  season: number,
  throughWeek: number,
): Promise<WeeklyPprPoints | undefined> {
  const weeks = Array.from(
    { length: Math.max(0, Math.min(throughWeek, 18)) },
    (_, i) => i + 1,
  );
  if (weeks.length === 0) return undefined;
  const results = await Promise.all(
    weeks.map(async week => {
      try {
        const res = await fetch(`${STATS_URL}/${season}/${week}`);
        if (!res.ok) throw new Error(`Sleeper stats week ${week}: HTTP ${res.status}`);
        const data = (await res.json()) as Record<
          string,
          { pts_ppr?: number; gp?: number } | null
        >;
        return { week, data };
      } catch (e) {
        logger.warn('[weeklyPpr] week fetch failed:', e);
        return { week, data: null };
      }
    }),
  );

  const loaded: number[] = [];
  const pointsBySleeperId: Record<string, Record<number, number>> = {};
  const gamesBySleeperId: Record<string, number[]> = {};
  for (const { week, data } of results) {
    if (!data) continue;
    loaded.push(week);
    for (const [id, stats] of Object.entries(data)) {
      // gp > 0 marks a played week; a 0-point game still counts toward the
      // average so a goose egg isn't silently dropped from the denominator.
      if ((stats?.gp ?? 0) > 0) {
        (gamesBySleeperId[id] ??= []).push(week);
        const pts = stats?.pts_ppr;
        if (typeof pts === 'number' && Number.isFinite(pts)) {
          (pointsBySleeperId[id] ??= {})[week] = pts;
        }
      }
    }
  }
  if (loaded.length === 0) return undefined;
  return { season, weeks: loaded, pointsBySleeperId, gamesBySleeperId };
}
