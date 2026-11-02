// Live matchup scores (backlog item 85): during a game week, each
// matchup's optimal-lineup starters get a live score line — actual fantasy
// points for players whose NFL games have started (Sleeper's weekly stats
// update as games play, so a gp > 0 entry means underway or finished) and
// TraderApe's own weekly projection for everyone else. The projected final
// is actuals + remaining projections, and the live win probability reuses
// the preview's 30-pt ≈ 91% calibration so the two can't disagree.
// Guidance only: nothing here changes any lineup.

import type { League, Player } from '@/types';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer, type PoolIndex } from '@/utils/consensusGrade';
import {
  scoreTeamLineup,
  winProbFromProjDiff,
  type MatchupPreview,
} from '@/utils/matchupPreview';
import type { ScoredPlayer } from '@/utils/rosterScoring';
import type { WeekPprStats } from '@/api/sleeperWeeklyPoints';

export interface LiveStarterRow {
  key: string;
  name: string;
  position: string;
  /** TraderApe's weekly projection for this player (1dp). */
  projection: number;
  /**
   * Actual full-PPR points from Sleeper's live week stats. Null until the
   * player's NFL game starts; partial while his game is in progress.
   */
  actual: number | null;
  /** True once Sleeper reports gp > 0 for the player this week. */
  played: boolean;
}

export interface LiveTeamScore {
  teamId: string;
  /** Sum of actuals across starters with live stats. */
  actualSoFar: number;
  /** Sum of actuals where available, else TraderApe projections. */
  projectedFinal: number;
  played: number;
  starters: number;
  rows: LiveStarterRow[];
}

export interface LiveMatchup {
  week: number;
  teamAId: string;
  teamBId: string;
  a: LiveTeamScore;
  b: LiveTeamScore;
  /** 0..100, one decimal — team A's live win probability (B's is 100 - it). */
  winProbA: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Sleeper id for a league roster player: the pool join first, then the
 *  league's own id spaces (Sleeper-platform leagues already use Sleeper
 *  ids). Team defenses have no Sleeper player id — they stay projection. */
function sleeperIdFor(player: Player, index: PoolIndex): string | undefined {
  const pool = resolvePoolPlayer(player, index);
  return pool?.sleeperId ?? player.platformId ?? player.id;
}

/** Live-score one team's optimal-lineup starters against this week's
 *  Sleeper stats. Exported for tests; previewLiveMatchups is the page
 *  entry point. */
export function liveScoreTeam(
  teamId: string,
  starters: ScoredPlayer[],
  stats: WeekPprStats,
  index: PoolIndex,
): LiveTeamScore {
  const rows: LiveStarterRow[] = starters.map(s => {
    const id = sleeperIdFor(s.player, index);
    const played = id !== undefined && stats.playedSleeperIds.has(id);
    const actual =
      played && id !== undefined && typeof stats.pointsBySleeperId[id] === 'number'
        ? round1(stats.pointsBySleeperId[id])
        : null;
    return {
      key: `${teamId}-${s.id}`,
      name: s.name,
      position: s.position,
      projection: round1(s.score),
      actual,
      played: actual !== null || played,
    };
  });
  const actualSoFar = round1(rows.reduce((sum, r) => sum + (r.actual ?? 0), 0));
  const projectedFinal = round1(
    rows.reduce((sum, r) => sum + (r.actual ?? r.projection), 0),
  );
  return {
    teamId,
    actualSoFar,
    projectedFinal,
    played: rows.filter(r => r.played).length,
    starters: rows.length,
    rows,
  };
}

/** One live-scored matchup per current-week pairing where both teams have
 *  pricing data — the same pairings and lineups as the pre-game preview,
 *  so the preview and the live board can't disagree. Returns [] when the
 *  schedule is absent, the current week is unknown, or no team prices
 *  above zero (same hide rules as previewWeeklyMatchups). */
export function previewLiveMatchups(
  league: League,
  stats: WeekPprStats,
): LiveMatchup[] {
  const { currentWeek, futureSchedule, teams } = league;
  if (
    currentWeek === undefined ||
    stats.week !== currentWeek ||
    !futureSchedule ||
    futureSchedule.length === 0
  ) {
    return [];
  }
  const index = indexPool(POOL);
  const scored = new Map<string, ScoredPlayer[]>();
  for (const team of teams) {
    const p = scoreTeamLineup(team, league);
    if (p !== null && p.preview.projectedScore > 0) scored.set(team.id, p.starters);
  }
  const out: LiveMatchup[] = [];
  for (const m of futureSchedule) {
    if (m.week !== currentWeek) continue;
    const aStarters = scored.get(m.team1Id);
    const bStarters = scored.get(m.team2Id);
    if (!aStarters || !bStarters) continue;
    const a = liveScoreTeam(m.team1Id, aStarters, stats, index);
    const b = liveScoreTeam(m.team2Id, bStarters, stats, index);
    out.push({
      week: m.week,
      teamAId: m.team1Id,
      teamBId: m.team2Id,
      a,
      b,
      winProbA: round1(winProbFromProjDiff(a.projectedFinal - b.projectedFinal) * 100),
    });
  }
  return out;
}

/** Convenience for callers that already have the pre-game preview: the
 *  live-scored version of that same pairing, or null. */
export function liveForPreview(
  league: League,
  preview: MatchupPreview,
  stats: WeekPprStats,
): LiveMatchup | null {
  const all = previewLiveMatchups(league, stats);
  return (
    all.find(m => m.teamAId === preview.teamAId && m.teamBId === preview.teamBId) ??
    null
  );
}
