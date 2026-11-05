// Air Yards Leaders board (backlog item 146).
//
// Per-position (RB/WR/TE) air-yards leaders over the last 3 completed
// weeks — the season-long "who is earning downfield targets" reference
// board, and the leading indicator behind every breakout before the box
// score catches up. Air yards are the yards a pass travels in the air
// on a target (Sleeper's rec_air_yd, which can go negative on screens
// thrown behind the line), and the share is the player's air yards over
// his own NFL team's air yards in the same weeks. Distinct from Target
// Share (item 107), which prices target counts, and from Efficiency
// (item 105), which prices what each touch is worth: this board prices
// how far downfield the targets go. Pure NFL data (Sleeper's free
// public weekly stats), no league needed, so guests get the full board
// like the /targets and /red-zone pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const AIR_YARDS_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type AirYardsPosition = (typeof AIR_YARDS_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const AIR_YARDS_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_AIR_YARDS_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface AirYardsLeader {
  player: PoolPlayer;
  /** Air yards (rec_air_yd) in the window. */
  airYards: number;
  /** Air yards per game over the recent window. */
  airYardsPerGame: number;
  /** Share of the player's NFL team's air yards (0..1); null without team data. */
  airShare: number | null;
  /** Average depth of target (air yards per target); null with no targets. */
  aDot: number | null;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface AirYardsLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-team air yards by week, summed over every pool player on the
 * team with a usage line — the denominator for the team-share column.
 * Same shape as teamRzOppsByWeek in redZoneLeaders.ts.
 */
export function teamAirYardsByWeek(
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
      weeks.set(week, (weeks.get(week) ?? 0) + line.airYards);
    }
  }
  return out;
}

/**
 * Per-position air-yards leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games, ranked
 * by air yards per game descending (ties broken by total air yards),
 * top 15 per position. Players without a team (or whose team recorded
 * no positive air yards in the window) can't be priced and are skipped;
 * a player with zero or negative total air yards never leads a board.
 * Returns a Map keyed by position; positions with no leaders are absent.
 */
export function buildAirYardsLeaders(
  input: AirYardsLeadersInput,
): Map<AirYardsPosition, AirYardsLeader[]> {
  const airByWeek = teamAirYardsByWeek(input.poolPlayers, input.usageBySleeperId);

  const out = new Map<AirYardsPosition, AirYardsLeader[]>();
  for (const pos of AIR_YARDS_POSITIONS) {
    const rows: AirYardsLeader[] = [];
    for (const p of input.poolPlayers) {
      if (p.pos.toUpperCase() !== pos) continue;
      if (!p.team) continue;
      const teamWeeks = airByWeek.get(p.team.toUpperCase());
      if (!teamWeeks) continue;
      const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
        .map(([w, line]) => ({ week: Number(w), line }))
        .filter(
          e =>
            Number.isFinite(e.week) &&
            e.week < input.currentWeek &&
            e.week >= input.currentWeek - 3,
        );
      if (entries.length < AIR_YARDS_MIN_GAMES) continue;

      const airYards = entries.reduce((s, e) => s + e.line.airYards, 0);
      // A leaders board has no room for a player with no downfield work
      // (screen-only weeks can total zero or negative).
      if (airYards <= 0) continue;
      const teamAirYards = entries.reduce(
        (s, e) => s + (teamWeeks.get(e.week) ?? 0),
        0,
      );
      if (teamAirYards <= 0) continue;
      const targets = entries.reduce((s, e) => s + e.line.targets, 0);
      rows.push({
        player: p,
        airYards,
        airYardsPerGame: round1(airYards / entries.length),
        airShare: round1((airYards / teamAirYards) * 100) / 100,
        aDot: targets > 0 ? round1(airYards / targets) : null,
        games: entries.length,
      });
    }
    rows.sort((a, b) => b.airYardsPerGame - a.airYardsPerGame || b.airYards - a.airYards);
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_AIR_YARDS_LEADERS));
  }
  return out;
}
