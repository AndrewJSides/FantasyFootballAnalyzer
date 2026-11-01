// Weekly opportunity (usage) data per player, from Sleeper's public weekly
// stats (free, no auth) — the data source behind Opportunity Watch
// (backlog item 71). Same endpoint/fetch pattern as sleeperWeeklyPoints.ts:
// a week that loads but has no usage fields for a player still counts as a
// loaded week, and per-week failures are skipped so one bad response can't
// sink the whole panel.

import { logger } from '@/utils/logger';

const STATS_URL = 'https://api.sleeper.app/v1/stats/nfl/regular';

/** One player's opportunity line for one completed week. */
export interface WeeklyUsageLine {
  /** Offensive snaps played. */
  offSnaps: number;
  /** The player's NFL team's offensive snaps that week. */
  teamSnaps: number;
  /** Targets (rec_tgt). */
  targets: number;
  /** Rushing attempts. */
  rushAtt: number;
  /** Receptions. */
  receptions: number;
}

export interface WeeklyUsage {
  season: number;
  /** Weeks that loaded successfully (the completed weeks being scored). */
  weeks: number[];
  /** Sleeper player id -> week -> usage line. */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function fetchWeeklyUsage(
  season: number,
  throughWeek: number,
): Promise<WeeklyUsage | undefined> {
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
        const data = (await res.json()) as Record<string, Record<string, number> | null>;
        return { week, data };
      } catch (e) {
        logger.warn('[weeklyUsage] week fetch failed:', e);
        return { week, data: null };
      }
    }),
  );

  const loaded: number[] = [];
  const usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>> = {};
  for (const { week, data } of results) {
    if (!data) continue;
    loaded.push(week);
    for (const [id, stats] of Object.entries(data)) {
      if (!stats || num(stats.gp) <= 0) continue;
      (usageBySleeperId[id] ??= {})[week] = {
        offSnaps: num(stats.off_snp),
        teamSnaps: num(stats.tm_off_snp),
        targets: num(stats.rec_tgt),
        rushAtt: num(stats.rush_att),
        receptions: num(stats.rec),
      };
    }
  }
  if (loaded.length === 0) return undefined;
  return { season, weeks: loaded, usageBySleeperId };
}
