// Rush Share Leaders board (backlog item 184).
//
// Per-position (RB/WR/TE) rush-share leaders over the last 3 completed
// weeks — the season-long "who's actually getting the carries" reference
// board. The workhorse read behind every RB start/sit call and waiver
// pickup: a 60% share on a run-heavy team is a bell cow, a 60% share on a
// pass-heavy team is not the same workload. Distinct from the Rushing
// Attempts board (item 168), which ranks raw volume — share hides volume
// and volume hides share, the same distinction the backlog already drew
// for targets (items 107/155). Pure NFL data (Sleeper's free public
// weekly stats: rush_att against the team rush-attempt denominator
// opportunityWatch already exports), no league needed, so guests get the
// full board like the /targets, /red-zone, /air-yards, /deep-plays,
// /catch-rate, /yac, /ypr, /ypc, /scrimmage, /touchdowns, and /passing
// pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import { teamRushAttByWeek } from '@/utils/opportunityWatch';

export const RUSH_SHARE_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type RushSharePosition = (typeof RUSH_SHARE_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const RUSH_SHARE_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_RUSH_SHARE_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;
/** Shares are stored to 3 decimals so 0.571 reads exactly as 0.571. */
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export interface RushShareLeader {
  player: PoolPlayer;
  /** Rush share over the recent window (0..1). */
  rushShare: number;
  /** Rushing attempts per game over the recent window. */
  rushAttPerGame: number;
  /** Rushing yards per game over the recent window. */
  rushYardsPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface RushShareLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

/**
 * Per-position rush-share leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games, ranked by
 * rush share descending (ties broken by rushing attempts per game), top 15
 * per position. Players without a team (or whose team recorded no rushing
 * attempts in the window) can't be priced and are skipped. Returns a Map
 * keyed by position; positions with no leaders are absent.
 */
export function buildRushShareLeaders(
  input: RushShareLeadersInput,
): Map<RushSharePosition, RushShareLeader[]> {
  const rushAttByWeek = teamRushAttByWeek(
    input.poolPlayers,
    input.usageBySleeperId,
  );

  const out = new Map<RushSharePosition, RushShareLeader[]>();
  for (const pos of RUSH_SHARE_POSITIONS) {
    const rows: RushShareLeader[] = [];
    for (const p of input.poolPlayers) {
      if (p.pos.toUpperCase() !== pos) continue;
      if (!p.team) continue;
      const teamWeeks = rushAttByWeek.get(p.team.toUpperCase());
      if (!teamWeeks) continue;
      const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
        .map(([w, line]) => ({ week: Number(w), line }))
        .filter(
          e =>
            Number.isFinite(e.week) &&
            e.week < input.currentWeek &&
            e.week >= input.currentWeek - 3,
        );
      if (entries.length < RUSH_SHARE_MIN_GAMES) continue;

      const rushAtt = entries.reduce((s, e) => s + e.line.rushAtt, 0);
      const teamRushAtt = entries.reduce(
        (s, e) => s + (teamWeeks.get(e.week) ?? 0),
        0,
      );
      if (teamRushAtt <= 0) continue;
      const rushYards = entries.reduce((s, e) => s + e.line.rushYards, 0);
      rows.push({
        player: p,
        rushShare: round3(rushAtt / teamRushAtt),
        rushAttPerGame: round1(rushAtt / entries.length),
        rushYardsPerGame: round1(rushYards / entries.length),
        games: entries.length,
      });
    }
    rows.sort(
      (a, b) =>
        b.rushShare - a.rushShare || b.rushAttPerGame - a.rushAttPerGame,
    );
    if (rows.length > 0) out.set(pos, rows.slice(0, MAX_RUSH_SHARE_LEADERS));
  }
  return out;
}
