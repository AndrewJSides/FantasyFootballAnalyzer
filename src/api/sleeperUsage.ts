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
  /** Red-zone opportunities: rush attempts + targets inside the 20
   *  (rush_rz_att + rec_rz_tgt) — the TD-probability read behind the
   *  Red Zone Leaders board (backlog item 145). */
  rzOpps: number;
  /** Receiving air yards (rec_air_yd) — the downfield-usage read
   *  behind the Air Yards Leaders board (backlog item 146). Can be
   *  negative on screen-heavy weeks (targets behind the line). */
  airYards: number;
  /** Deep receptions: catches of 20+ yards (rec_20_29 + rec_30_39 +
   *  rec_40p) — the converted big play behind the Deep Play Leaders
   *  board (backlog item 147). */
  deepRec: number;
  /** Longest reception of the week (rec_lng) — the ceiling read on the
   *  same board. */
  longRec: number;
  /** Yards after the catch (rec_yar) — the after-the-catch read
   *  behind the YAC Leaders board (backlog item 149). */
  yac: number;
  /** Receiving yards (rec_yd) — the per-catch efficiency read
   *  behind the YPR Leaders board (backlog item 150). */
  recYards: number;
  /** Rushing yards (rush_yd) — the per-carry efficiency read
   *  behind the YPC Leaders board (backlog item 151). */
  rushYards: number;
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
        rzOpps: num(stats.rush_rz_att) + num(stats.rec_rz_tgt),
        airYards: num(stats.rec_air_yd),
        deepRec: num(stats.rec_20_29) + num(stats.rec_30_39) + num(stats.rec_40p),
        longRec: num(stats.rec_lng),
        yac: num(stats.rec_yar),
        recYards: num(stats.rec_yd),
        rushYards: num(stats.rush_yd),
      };
    }
  }
  if (loaded.length === 0) return undefined;
  return { season, weeks: loaded, usageBySleeperId };
}
