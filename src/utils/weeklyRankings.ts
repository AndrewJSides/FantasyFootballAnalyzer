// Week-N Projections board engine (backlog item 30).
//
// Ranks every startable QB/RB/WR/TE by THIS week's TraderApe projection
// (recency-weighted form + season baseline + matchup blend) — the
// browsable board version of the same model the Start/Sit optimizer,
// Compare page, and Matchup view price one player at a time. Players on
// bye in the current week are excluded (there is nothing to project).
// Players with no completed-week data land behind every projected player,
// ordered by season points per game and then pool rank, so deep
// projections never outrank a real one.
import type { WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import {
  getMatchupRating,
  leagueAvgAllowed,
  type MatchupRating,
} from '@/utils/matchupRating';
import { projectWeeklyPoints, type WeekPoints } from '@/utils/weeklyProjection';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

export const WEEKLY_RANKS_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

export interface WeeklyRankRow {
  player: PoolPlayer;
  total: number | null;
  games: number | null;
  ppg: number | null;
  last3: number | null;
  /** This week's TraderApe projection; null when no completed-week data. */
  projection: number | null;
  matchup: MatchupRating | null;
  /** League mode: owning fantasy team name; null when on waivers. Absent in guest mode. */
  owner: string | null;
  /** 1-based rank within his position, priced on the same context. */
  posRank: number;
}

export interface BuildWeeklyRankingsInput {
  pool: DraftPoolFile;
  weekly: WeeklyPprPoints | undefined;
  currentWeek: number;
  ownerByPoolId?: Map<string, string>;
  /** Players kept per position after ranking; default 40. */
  perPosition?: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

interface Ranked extends WeeklyRankRow {
  sortScore: number;
  sortGroup: 0 | 1;
}

function rowFor(p: PoolPlayer, weekly: WeeklyPprPoints | undefined, currentWeek: number): Omit<Ranked, 'posRank'> {
  const sid = p.sleeperId;
  const byWeek = (sid && weekly?.pointsBySleeperId[sid]) ?? {};
  const entries: WeekPoints[] = Object.entries(byWeek)
    .map(([w, pts]) => ({ week: Number(w), pts }))
    .filter(e => Number.isFinite(e.week) && e.week < currentWeek)
    .sort((a, b) => a.week - b.week);
  const gpWeeks = sid ? weekly?.gamesBySleeperId[sid] ?? [] : [];
  const gpCompleted = gpWeeks.filter(w => w < currentWeek);

  const total = entries.length > 0 ? round1(entries.reduce((s, e) => s + e.pts, 0)) : null;
  const games =
    gpCompleted.length > 0 ? gpCompleted.length : entries.length > 0 ? entries.length : null;
  const ppg = total !== null && games !== null && games > 0 ? round1(total / games) : null;
  const last3Entries = entries.slice(-3);
  const last3 =
    last3Entries.length > 0
      ? round1(last3Entries.reduce((s, e) => s + e.pts, 0) / last3Entries.length)
      : null;

  const matchup = getMatchupRating(p.team, p.pos, currentWeek);
  const leagueAvg = leagueAvgAllowed(p.pos);
  const matchupContext =
    matchup !== null && leagueAvg !== null
      ? { avgAllowed: matchup.avgAllowed, leagueAverage: leagueAvg }
      : null;
  const projection =
    projectWeeklyPoints(entries, gpCompleted.length > 0 ? gpCompleted.length : null, matchupContext)
      ?.projection ?? null;

  return {
    player: p,
    total,
    games,
    ppg,
    last3,
    projection: projection === null ? null : round1(projection),
    matchup,
    owner: null,
    sortScore: projection ?? ppg ?? -1,
    sortGroup: projection === null ? 1 : 0,
  };
}

/**
 * Rank every startable skill-position player by this week's TraderApe
 * projection, top `perPosition` per position (default 40).
 */
export function buildWeeklyRankings({
  pool,
  weekly,
  currentWeek,
  ownerByPoolId,
  perPosition = 40,
}: BuildWeeklyRankingsInput): WeeklyRankRow[] {
  const rows: WeeklyRankRow[] = [];
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    const ranked = pool.players
      .filter(p => p.pos === pos && p.bye !== currentWeek)
      .map(p => rowFor(p, weekly, currentWeek))
      .sort(
        (a, b) =>
          a.sortGroup - b.sortGroup ||
          b.sortScore - a.sortScore ||
          (a.player.overallRank ?? 9999) - (b.player.overallRank ?? 9999),
      )
      .slice(0, perPosition);
    ranked.forEach((r, i) => {
      rows.push({
        player: r.player,
        total: r.total,
        games: r.games,
        ppg: r.ppg,
        last3: r.last3,
        projection: r.projection,
        matchup: r.matchup,
        owner: ownerByPoolId?.get(r.player.id) ?? null,
        posRank: i + 1,
      });
    });
  }
  return rows;
}
