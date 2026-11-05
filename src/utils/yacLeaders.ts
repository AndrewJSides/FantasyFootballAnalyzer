// YAC Leaders board (backlog item 149).
//
// Per-position (RB/WR/TE) yards-after-catch leaders over the last 3
// completed weeks — the season-long "who is creating his own yards
// after the catch" reference board. YAC is Sleeper's rec_yar, and the
// share is the player's YAC over his own NFL team's YAC in the same
// weeks. Distinct from Air Yards (item 146), which prices the
// downfield opportunity, and from Deep Plays (item 147), which prices
// the converted big play: this board prices what happens after the
// catch, and YAC per reception is the earliest warning that a
// breakout's box score is about to regress. Pure NFL data (Sleeper's
// free public weekly stats), no league needed, so guests get the full
// board like the /targets, /red-zone, /air-yards, /deep-plays, and
// /catch-rate pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const YAC_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type YacPosition = (typeof YAC_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const YAC_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_YAC_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface YacLeader {
  player: PoolPlayer;
  /** Yards after the catch in the window. */
  yac: number;
  /** Yards after the catch per game over the recent window. */
  yacPerGame: number;
  /** Yards after the catch per reception; null with no receptions. */
  yacPerRec: number | null;
  /** Share of the player's NFL team's YAC (0..1); null without team data. */
  yacShare: number | null;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface YacLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-team YAC by week, summed over every pool player on the team
 * with a usage line — the denominator for the team-share column. Same
 * shape as teamDeepRecByWeek in deepPlayLeaders.ts.
 */
export function teamYacByWeek(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): Map<string, Map<number, number>> {
  const sleeperTeam = new Map<string, string>();
  for (const p of poolPlayers) {
    if (p.sleeperId && p.team) sleeperTeam.set(p.sleeperId, p.team.toUpperCase());
  }
  const out = new Map<string, Map<number, number>>();
  for (const [id, byWeek] of Object.entries(usageBySleeperId)) {
    const team = sleeperTeam.get(id);
    if (!team) continue;
    let weeks = out.get(team);
    if (!weeks) out.set(team, (weeks = new Map()));
    for (const [w, line] of Object.entries(byWeek)) {
      const week = Number(w);
      if (!Number.isFinite(week)) continue;
      weeks.set(week, (weeks.get(week) ?? 0) + line.yac);
    }
  }
  return out;
}

/**
 * Per-position YAC leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games, ranked
 * by YAC per game descending (ties broken by total YAC), top 15 per
 * position. Players without a team (or whose team recorded no YAC in
 * the window) can't be priced and are skipped; a player with zero YAC
 * never leads a board. Returns a Map keyed by position; positions
 * with no leaders are absent.
 */
export function buildYacLeaders(input: YacLeadersInput): Map<YacPosition, YacLeader[]> {
  const yacByWeek = teamYacByWeek(input.poolPlayers, input.usageBySleeperId);

  const out = new Map<YacPosition, YacLeader[]>();
  for (const pos of YAC_POSITIONS) {
    const rows: YacLeader[] = [];
    for (const p of input.poolPlayers) {
      if (p.pos.toUpperCase() !== pos) continue;
      if (!p.team) continue;
      const teamWeeks = yacByWeek.get(p.team.toUpperCase());
      if (!teamWeeks) continue;
      const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
        .map(([w, line]) => ({ week: Number(w), line }))
        .filter(
          e =>
            Number.isFinite(e.week) &&
            e.week < input.currentWeek &&
            e.week >= input.currentWeek - 3,
        );
      if (entries.length < YAC_MIN_GAMES) continue;

      const yac = entries.reduce((s, e) => s + e.line.yac, 0);
      // A leaders board has no room for a player with no YAC.
      if (yac <= 0) continue;
      const teamYac = entries.reduce((s, e) => s + (teamWeeks.get(e.week) ?? 0), 0);
      if (teamYac <= 0) continue;
      const receptions = entries.reduce((s, e) => s + e.line.receptions, 0);
      rows.push({
        player: p,
        yac,
        yacPerGame: round1(yac / entries.length),
        yacPerRec: receptions > 0 ? round1(yac / receptions) : null,
        yacShare: round1((yac / teamYac) * 100) / 100,
        games: entries.length,
      });
    }
    rows.sort((a, b) => b.yacPerGame - a.yacPerGame || b.yac - a.yac);
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_YAC_LEADERS));
  }
  return out;
}
