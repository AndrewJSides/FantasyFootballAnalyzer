// Red Zone Leaders board (backlog item 145).
//
// Per-position (RB/WR/TE) red-zone opportunity leaders over the last 3
// completed weeks — the season-long "who gets the ball inside the 20"
// reference board, and the TD-probability read behind every waiver add,
// trade target, and start/sit tiebreak. A red-zone opportunity is a rush
// attempt or a target on a play starting inside the opponent's 20
// (Sleeper's rush_rz_att + rec_rz_tgt), and the share is the player's
// red-zone opps over his own NFL team's red-zone opps in the same weeks.
// Distinct from Snap Leaders (item 104), which ranks by snap share, and
// from Opportunity Share (item 108), which prices every touch: this board
// prices only the highest-leverage touches. Pure NFL data (Sleeper's free
// public weekly stats), no league needed, so guests get the full board
// like the /targets and /opportunity pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const RED_ZONE_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type RedZonePosition = (typeof RED_ZONE_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const RED_ZONE_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_RED_ZONE_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface RedZoneLeader {
  player: PoolPlayer;
  /** Red-zone opps (rush attempts + targets inside the 20) in the window. */
  rzOpps: number;
  /** Red-zone opps per game over the recent window. */
  rzOppsPerGame: number;
  /** Share of the player's NFL team's red-zone opps (0..1); null without team data. */
  rzShare: number | null;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface RedZoneLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-team red-zone opps by week, summed over every pool player on the
 * team with a usage line — the denominator for the team-share column.
 * Same shape as teamTouchesByWeek in opportunityWatch.ts.
 */
export function teamRzOppsByWeek(
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
      weeks.set(week, (weeks.get(week) ?? 0) + line.rzOpps);
    }
  }
  return out;
}

/**
 * Per-position red-zone opportunity leaders over the last 3 completed
 * weeks (week < currentWeek, week >= currentWeek - 3), min 2 games,
 * ranked by red-zone opps per game descending (ties broken by total
 * red-zone opps), top 15 per position. Players without a team (or whose
 * team recorded no red-zone opps in the window) can't be priced and are
 * skipped. Returns a Map keyed by position; positions with no leaders
 * are absent.
 */
export function buildRedZoneLeaders(
  input: RedZoneLeadersInput,
): Map<RedZonePosition, RedZoneLeader[]> {
  const rzByWeek = teamRzOppsByWeek(input.poolPlayers, input.usageBySleeperId);

  const out = new Map<RedZonePosition, RedZoneLeader[]>();
  for (const pos of RED_ZONE_POSITIONS) {
    const rows: RedZoneLeader[] = [];
    for (const p of input.poolPlayers) {
      if (p.pos.toUpperCase() !== pos) continue;
      if (!p.team) continue;
      const teamWeeks = rzByWeek.get(p.team.toUpperCase());
      if (!teamWeeks) continue;
      const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
        .map(([w, line]) => ({ week: Number(w), line }))
        .filter(
          e =>
            Number.isFinite(e.week) &&
            e.week < input.currentWeek &&
            e.week >= input.currentWeek - 3,
        );
      if (entries.length < RED_ZONE_MIN_GAMES) continue;

      const rzOpps = entries.reduce((s, e) => s + e.line.rzOpps, 0);
      // A leaders board has no room for a player with no red-zone work.
      if (rzOpps <= 0) continue;
      const teamRzOpps = entries.reduce(
        (s, e) => s + (teamWeeks.get(e.week) ?? 0),
        0,
      );
      if (teamRzOpps <= 0) continue;
      rows.push({
        player: p,
        rzOpps,
        rzOppsPerGame: round1(rzOpps / entries.length),
        rzShare: round1((rzOpps / teamRzOpps) * 100) / 100,
        games: entries.length,
      });
    }
    rows.sort((a, b) => b.rzOppsPerGame - a.rzOppsPerGame || b.rzOpps - a.rzOpps);
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_RED_ZONE_LEADERS));
  }
  return out;
}
