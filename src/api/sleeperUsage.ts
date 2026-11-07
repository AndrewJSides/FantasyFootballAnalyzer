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
  /** Rushing touchdowns (rush_td) — the scoring read behind the
   *  Touchdown Leaders board (backlog item 153). */
  rushTd: number;
  /** Receiving touchdowns (rec_td) — same board, the receiving half. */
  recTd: number;
  /** Passing yards (pass_yd) — the volume read behind the Passing
   *  Leaders board (backlog item 154). */
  passYards: number;
  /** Passing touchdowns (pass_td) — same board, the scoring half. */
  passTd: number;
  /** Pass attempts (pass_att) — the volume read behind the Pass
   *  Attempts Leaders board (backlog item 167). */
  passAtt: number;
  /** Pass completions (pass_cmp) — the accuracy read on the same board. */
  passCmp: number;
  /** Interceptions thrown (pass_int) — the ball-security read behind
   *  the Passer Rating Leaders board (backlog item 186). Sleeper's
   *  QB field, distinct from the team-defense `int` mapped as defInt
   *  below. Optional so older test fixtures that build full usage
   *  lines by hand keep compiling; the mapper always sets it. */
  passInt?: number;
  /** Rushing first downs (rush_fd) — the ground half of the chain-moving
   *  read behind the First Downs Leaders board (backlog item 156). */
  rushFd: number;
  /** Receiving first downs (rec_fd) — same board, the through-the-air half. */
  recFd: number;
  /** PPR fantasy points (pts_ppr) — the scoreboard read behind the
   *  Fantasy Points Leaders board (backlog item 158). */
  ptsPpr: number;
  /** Sacks (sack) — team-defense rows only; the pressure read behind
   *  the Defense Leaders board (backlog item 169). 0 / absent on
   *  skill-player lines. */
  sacks?: number;
  /** Interceptions (int) — team-defense rows only, same board. */
  defInt?: number;
  /** Fumble recoveries (fum_rec) — team-defense rows only, same board. */
  fumRec?: number;
  /** Defensive touchdowns (td) — team-defense rows only, same board. */
  defTd?: number;
  /** Safeties (safe) — team-defense rows only, same board. */
  safeties?: number;
  /** Blocked kicks (blk_kick) — team-defense rows only, same board. */
  blkKick?: number;
  /** Points allowed (pts_allow) — team-defense rows only; the
   *  points-allowed bracket in standard D/ST scoring, same board. */
  ptsAllow?: number;
  /** Field goals made (fgm) — kicker rows only; the volume read
   *  behind the Kicker Leaders board (backlog item 170). 0 / absent
   *  on non-kicker lines. */
  fgm?: number;
  /** Field goals attempted (fga) — kicker rows only, same board. */
  fga?: number;
  /** Extra points made (xpm) — kicker rows only, same board. */
  xpm?: number;
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
        rushTd: num(stats.rush_td),
        recTd: num(stats.rec_td),
        passYards: num(stats.pass_yd),
        passTd: num(stats.pass_td),
        passAtt: num(stats.pass_att),
        passCmp: num(stats.pass_cmp),
        passInt: num(stats.pass_int),
        rushFd: num(stats.rush_fd),
        recFd: num(stats.rec_fd),
        ptsPpr: num(stats.pts_ppr),
        sacks: num(stats.sack),
        defInt: num(stats.int),
        fumRec: num(stats.fum_rec),
        defTd: num(stats.td),
        safeties: num(stats.safe),
        blkKick: num(stats.blk_kick),
        ptsAllow: num(stats.pts_allow),
        fgm: num(stats.fgm),
        fga: num(stats.fga),
        xpm: num(stats.xpm),
      };
    }
  }
  if (loaded.length === 0) return undefined;
  return { season, weeks: loaded, usageBySleeperId };
}
