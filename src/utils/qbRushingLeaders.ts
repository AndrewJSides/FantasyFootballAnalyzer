// QB Rushing Leaders board (backlog item 185).
//
// Quarterbacks ranked by rushing yards per game over the last 3
// completed weeks — the season-long "who's actually running"
// reference board. The Konami-code read behind every QB start/sit
// call and QB2 streamer pick: a rushing yard is worth 2.5x a passing
// yard and a rushing TD 1.5x a passing TD in full-PPR scoring, so a
// QB's rushing floor is worth more than his passing volume. Distinct
// from the Rushing Yards board (item 162) and the Rush Share board
// (item 184), which are RB/WR/TE only — the position whose rushing
// matters most for fantasy had no board. Pure NFL data (Sleeper's
// free public weekly stats: rush_yd / rush_att / rush_td / pts_ppr,
// already mapped in the usage response), no league needed, so guests
// get the full board like the /targets, /red-zone, /air-yards,
// /deep-plays, /catch-rate, /yac, /ypr, /ypc, /scrimmage,
// /touchdowns, /passing, and /rush-share pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const QB_RUSHING_MIN_GAMES = 2;
/** Leaders kept. */
export const MAX_QB_RUSHING_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;
/** Shares are stored to 3 decimals so 0.571 reads exactly as 0.571. */
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export interface QbRushingLeader {
  player: PoolPlayer;
  /** Rushing yards per game over the recent window. */
  rushYardsPerGame: number;
  /** Rushing yards in the window. */
  rushYards: number;
  /** Rushing attempts per game over the recent window. */
  rushAttPerGame: number;
  /** Rushing touchdowns in the window. */
  rushTd: number;
  /** Share of the QB's full-PPR points in the window that came from
   *  rushing (rush yards/10 + rush TDs x 6, over pts_ppr) — the
   *  Konami-code read: how much of his score is the ground game. */
  rushPtsShare: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface QbRushingLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * QB rushing leaders over the last 3 completed weeks (week <
 * currentWeek, week >= currentWeek - 3), min 2 games, ranked by
 * rushing yards per game descending (ties broken by total rushing
 * yards, then rushing TDs), top 15. QBs with no rushing yards never
 * lead the board. Returns the leaders array (empty when none).
 */
export function buildQbRushingLeaders(
  input: QbRushingLeadersInput,
): QbRushingLeader[] {
  const rows: QbRushingLeader[] = [];
  for (const p of input.poolPlayers) {
    if (p.pos.toUpperCase() !== 'QB') continue;
    const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
      .map(([w, line]) => ({ week: Number(w), line }))
      .filter(
        e =>
          Number.isFinite(e.week) &&
          e.week < input.currentWeek &&
          e.week >= input.currentWeek - 3,
      );
    if (entries.length < QB_RUSHING_MIN_GAMES) continue;

    const rushYards = entries.reduce((s, e) => s + e.line.rushYards, 0);
    if (rushYards <= 0) continue;
    const rushAtt = entries.reduce((s, e) => s + e.line.rushAtt, 0);
    const rushTd = entries.reduce((s, e) => s + e.line.rushTd, 0);
    const totalPts = entries.reduce((s, e) => s + e.line.ptsPpr, 0);
    const rushPts = rushYards / 10 + rushTd * 6;
    rows.push({
      player: p,
      rushYardsPerGame: round1(rushYards / entries.length),
      rushYards,
      rushAttPerGame: round1(rushAtt / entries.length),
      rushTd,
      rushPtsShare: totalPts > 0 ? round3(rushPts / totalPts) : 0,
      games: entries.length,
    });
  }
  rows.sort(
    (a, b) =>
      b.rushYardsPerGame - a.rushYardsPerGame ||
      b.rushYards - a.rushYards ||
      b.rushTd - a.rushTd,
  );
  return rows.slice(0, MAX_QB_RUSHING_LEADERS);
}
