// Roster scoring core shared by the Start/Sit optimizer and the weekly
// matchup preview: prices each roster player on TraderApe's weekly projection
// model (recency-weighted last-4 form blended with the season baseline,
// nudged by this week's matchup difficulty), falling back to the season
// average (or zero with no data at all) so a roster still gets a lineup
// instead of an empty one. Moved here from StartSitPage.tsx (Oct 29, 2026)
// unchanged so both consumers score identically.

import type { Player } from '@/types';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import { projectWeeklyPoints, type WeeklyProjection } from '@/utils/weeklyProjection';
import {
  getMatchupRating,
  leagueAvgAllowed,
  type MatchupRating,
} from '@/utils/matchupRating';
import type { OptimalLineupPlayer } from '@/utils/optimalLineup';

export interface ScoredPlayer extends OptimalLineupPlayer {
  player: Player;
  nflTeam: string;
  ppg: number | null;
  last3: number | null;
  projection: WeeklyProjection | null;
  bye: number | null;
  onBye: boolean;
  matchup: MatchupRating | null;
}

export interface RosterScoreInputs {
  roster: Player[];
  weeklyPoints?: Record<string, Record<string, number>>;
  gamesBySleeperId?: Record<string, number[]>;
  gamesSeason?: number;
  season?: number;
  currentWeek?: number;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Shared scoring core: league mode feeds league-loaded weekly points, guest
// mode feeds Sleeper weekly PPR fetched at runtime. Rank on the projection
// where one exists; fall back to the season average (or zero with no data at
// all) so a roster still gets a lineup instead of an empty one.
export function scoreRosterPlayers(inputs: RosterScoreInputs): ScoredPlayer[] {
  const poolIndex = indexPool(POOL);
  const { roster, weeklyPoints, gamesBySleeperId, gamesSeason, season, currentWeek } = inputs;
  return roster.map(rosterPlayer => {
    // Weekly points are keyed by platform player id; try both id spaces
    // (Sleeper ids live in one, ESPN/Yahoo in the other).
    const weekly =
      weeklyPoints?.[rosterPlayer.platformId] ?? weeklyPoints?.[rosterPlayer.id];
    const weeks = weekly
      ? Object.entries(weekly)
          .map(([w, pts]) => ({ week: Number(w), pts }))
          .filter(e => Number.isFinite(e.week))
          .sort((a, b) => a.week - b.week)
      : [];
    const completed =
      currentWeek !== undefined ? weeks.filter(e => e.week < currentWeek) : weeks;
    const usable = completed.length > 0 ? completed : weeks;
    // Games played, where the loader supplies it (Sleeper ids): the count
    // of completed weeks the player actually played. Otherwise the weekly
    // entry count stands in — a 0-point week still counts as played when
    // the platform reports it, and the weekly fallback only undercounts
    // players whose platform omits scoreless weeks.
    const gpWeeks =
      gamesSeason === season && gamesBySleeperId
        ? (gamesBySleeperId[rosterPlayer.platformId] ??
          gamesBySleeperId[rosterPlayer.id])
        : undefined;
    const gpCompleted = gpWeeks
      ? currentWeek !== undefined
        ? gpWeeks.filter(w => w < currentWeek).length
        : gpWeeks.length
      : null;
    const games = gpCompleted ?? (usable.length > 0 ? usable.length : null);
    const total =
      rosterPlayer.seasonPoints ?? (usable.length > 0 ? usable.reduce((s, e) => s + e.pts, 0) : null);
    const ppg = games !== null && games > 0 && total !== null ? round1(total / games) : null;
    const last3Entries = usable.slice(-3);
    const last3 =
      last3Entries.length > 0
        ? round1(last3Entries.reduce((s, e) => s + e.pts, 0) / last3Entries.length)
        : null;
    // Matchup context for the numeric projection blend: the opponent's
    // allowed-vs-position and the league-wide average, so the model nudges
    // the projection up for soft matchups and down for tough ones. Same
    // rating object also feeds the Matchup column, so the number and the
    // display never disagree.
    const matchup = getMatchupRating(rosterPlayer.team, rosterPlayer.position, currentWeek);
    const leagueAvg = leagueAvgAllowed(rosterPlayer.position);
    const matchupContext =
      matchup !== null && leagueAvg !== null
        ? { avgAllowed: matchup.avgAllowed, leagueAverage: leagueAvg }
        : null;
    const projection = projectWeeklyPoints(completed, gpCompleted, matchupContext);
    const bye = resolvePoolPlayer(rosterPlayer, poolIndex)?.bye ?? null;
    return {
      id: rosterPlayer.id,
      name: rosterPlayer.name,
      position: rosterPlayer.position,
      score: projection?.projection ?? ppg ?? 0,
      player: rosterPlayer,
      nflTeam: rosterPlayer.team,
      ppg,
      last3,
      projection,
      bye,
      onBye: bye !== null && currentWeek !== undefined && bye === currentWeek,
      matchup,
    };
  });
}
