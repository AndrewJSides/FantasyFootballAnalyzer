// Air Yards Share Leaders board (backlog item 194).
//
// Per-position (RB/WR/TE) leaders in share of their own NFL team's air
// yards over the last 3 completed weeks — the "who does this passing
// game run through downfield" read. Distinct from Air Yards (item 146),
// which ranks by raw air yards and carries the share only as a side
// column: a receiver on a low-volume passing team can own half his
// team's downfield work and still sit mid-table there. Completes the
// volume/share pair for air yards exactly as Target Share (item 107)
// did for targets. The target-share column comes from the same window
// (teamTargetsByWeek), and a "30/30" flag marks players at 30%+ target
// share AND 30%+ air-yards share — the analyst frame for a passing
// game that runs through one player at every depth. Pure NFL data
// (Sleeper's free public weekly stats), no league needed, so guests get
// the full board like the /air-yards and /targets pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import { teamAirYardsByWeek } from './airYardsLeaders';
import { teamTargetsByWeek } from './opportunityWatch';

export const AIR_SHARE_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type AirSharePosition = (typeof AIR_SHARE_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const AIR_SHARE_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_AIR_SHARE_LEADERS = 15;
/** The 30/30 club: 30%+ target share AND 30%+ air-yards share. */
export const THIRTY_THIRTY_THRESHOLD = 0.3;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface AirShareLeader {
  player: PoolPlayer;
  /** Share of the player's NFL team's air yards (0..1). */
  airShare: number;
  /** Share of the player's NFL team's targets (0..1); null without team targets. */
  targetShare: number | null;
  /** Air yards (rec_air_yd) in the window. */
  airYards: number;
  /** Air yards per game over the recent window. */
  airYardsPerGame: number;
  /** Average depth of target (air yards per target); null with no targets. */
  aDot: number | null;
  /** 30%+ target share AND 30%+ air-yards share. */
  isThirtyThirty: boolean;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface AirShareLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position air-yards-share leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games, ranked
 * by air-yards share descending (ties broken by air yards per game,
 * then total air yards), top 15 per position. Players without a team
 * (or whose team recorded no positive air yards in the window) can't
 * be priced and are skipped; a player with zero or negative total air
 * yards never leads a board. Returns a Map keyed by position;
 * positions with no leaders are absent.
 */
export function buildAirShareLeaders(
  input: AirShareLeadersInput,
): Map<AirSharePosition, AirShareLeader[]> {
  const airByWeek = teamAirYardsByWeek(input.poolPlayers, input.usageBySleeperId);
  const targetsByWeek = teamTargetsByWeek(input.poolPlayers, input.usageBySleeperId);

  const out = new Map<AirSharePosition, AirShareLeader[]>();
  for (const pos of AIR_SHARE_POSITIONS) {
    const rows: AirShareLeader[] = [];
    for (const p of input.poolPlayers) {
      if (p.pos.toUpperCase() !== pos) continue;
      if (!p.team) continue;
      const teamWeeks = airByWeek.get(p.team.toUpperCase());
      if (!teamWeeks) continue;
      const teamTargetWeeks = targetsByWeek.get(p.team.toUpperCase());
      const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
        .map(([w, line]) => ({ week: Number(w), line }))
        .filter(
          e =>
            Number.isFinite(e.week) &&
            e.week < input.currentWeek &&
            e.week >= input.currentWeek - 3,
        );
      if (entries.length < AIR_SHARE_MIN_GAMES) continue;

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
      const teamTargets = entries.reduce(
        (s, e) => s + (teamTargetWeeks?.get(e.week) ?? 0),
        0,
      );
      const airShare = round1((airYards / teamAirYards) * 100) / 100;
      const targetShare =
        teamTargets > 0 ? round1((targets / teamTargets) * 100) / 100 : null;
      rows.push({
        player: p,
        airShare,
        targetShare,
        airYards,
        airYardsPerGame: round1(airYards / entries.length),
        aDot: targets > 0 ? round1(airYards / targets) : null,
        isThirtyThirty:
          airShare >= THIRTY_THIRTY_THRESHOLD &&
          targetShare !== null &&
          targetShare >= THIRTY_THIRTY_THRESHOLD,
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.airShare - a.airShare ||
        b.airYardsPerGame - a.airYardsPerGame ||
        b.airYards - a.airYards,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_AIR_SHARE_LEADERS));
  }
  return out;
}
