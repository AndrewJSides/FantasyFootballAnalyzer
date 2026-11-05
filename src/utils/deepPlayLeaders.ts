// Deep Play Leaders board (backlog item 147).
//
// Per-position (RB/WR/TE) deep-reception leaders over the last 3
// completed weeks — the season-long "who is actually converting
// downfield work into big plays" reference board. A deep reception is
// a catch of 20+ yards (Sleeper's rec_20_29 + rec_30_39 + rec_40p),
// and the share is the player's deep receptions over his own NFL
// team's deep receptions in the same weeks. Distinct from Air Yards
// (item 146), which prices the downfield opportunity: this board
// prices the conversion, and the longest catch is the ceiling read
// behind every start/sit tiebreak. Pure NFL data (Sleeper's free
// public weekly stats), no league needed, so guests get the full board
// like the /targets, /red-zone, and /air-yards pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const DEEP_PLAY_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type DeepPlayPosition = (typeof DEEP_PLAY_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const DEEP_PLAY_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_DEEP_PLAY_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface DeepPlayLeader {
  player: PoolPlayer;
  /** Deep receptions (20+ yard catches) in the window. */
  deepRec: number;
  /** Deep receptions per game over the recent window. */
  deepRecPerGame: number;
  /** Share of the player's NFL team's deep receptions (0..1); null without team data. */
  deepShare: number | null;
  /** Longest reception in the window. */
  longRec: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface DeepPlayLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-team deep receptions by week, summed over every pool player on
 * the team with a usage line — the denominator for the team-share
 * column. Same shape as teamAirYardsByWeek in airYardsLeaders.ts.
 */
export function teamDeepRecByWeek(
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
      weeks.set(week, (weeks.get(week) ?? 0) + line.deepRec);
    }
  }
  return out;
}

/**
 * Per-position deep-play leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games, ranked
 * by deep receptions per game descending (ties broken by total deep
 * receptions), top 15 per position. Players without a team (or whose
 * team recorded no deep receptions in the window) can't be priced and
 * are skipped; a player with zero deep receptions never leads a board.
 * Returns a Map keyed by position; positions with no leaders are absent.
 */
export function buildDeepPlayLeaders(
  input: DeepPlayLeadersInput,
): Map<DeepPlayPosition, DeepPlayLeader[]> {
  const deepByWeek = teamDeepRecByWeek(input.poolPlayers, input.usageBySleeperId);

  const out = new Map<DeepPlayPosition, DeepPlayLeader[]>();
  for (const pos of DEEP_PLAY_POSITIONS) {
    const rows: DeepPlayLeader[] = [];
    for (const p of input.poolPlayers) {
      if (p.pos.toUpperCase() !== pos) continue;
      if (!p.team) continue;
      const teamWeeks = deepByWeek.get(p.team.toUpperCase());
      if (!teamWeeks) continue;
      const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
        .map(([w, line]) => ({ week: Number(w), line }))
        .filter(
          e =>
            Number.isFinite(e.week) &&
            e.week < input.currentWeek &&
            e.week >= input.currentWeek - 3,
        );
      if (entries.length < DEEP_PLAY_MIN_GAMES) continue;

      const deepRec = entries.reduce((s, e) => s + e.line.deepRec, 0);
      // A leaders board has no room for a player with no big plays.
      if (deepRec <= 0) continue;
      const teamDeepRec = entries.reduce(
        (s, e) => s + (teamWeeks.get(e.week) ?? 0),
        0,
      );
      if (teamDeepRec <= 0) continue;
      rows.push({
        player: p,
        deepRec,
        deepRecPerGame: round1(deepRec / entries.length),
        deepShare: round1((deepRec / teamDeepRec) * 100) / 100,
        longRec: Math.max(...entries.map(e => e.line.longRec)),
        games: entries.length,
      });
    }
    rows.sort((a, b) => b.deepRecPerGame - a.deepRecPerGame || b.deepRec - a.deepRec);
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_DEEP_PLAY_LEADERS));
  }
  return out;
}
