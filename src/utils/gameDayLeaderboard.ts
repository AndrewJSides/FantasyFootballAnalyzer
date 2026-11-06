// Game Day Live Leaderboard (backlog item 171): the league-wide live
// view FantasyPros builds its Game Day product around — every team
// ranked by live actual fantasy points, plus the week's top live
// individual scorers. Built on the existing live-matchup engine
// (previewLiveMatchups, item 85), so the leaderboard and the Matchup
// page's per-matchup live scores can't disagree: same optimal lineups,
// same Sleeper live weekly stats, same actuals + remaining-projections
// math. Guests get the top-scorers half from the same Sleeper feed
// (pure NFL data, no league needed).

import type { League } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import type { WeekPprStats } from '@/api/sleeperWeeklyPoints';
import { previewLiveMatchups } from './liveMatchup';

export interface GameDayTeamRow {
  rank: number;
  teamId: string;
  teamName: string;
  opponentName: string;
  /** Sum of actual points across starters whose games have started. */
  actualSoFar: number;
  /** Actuals where available, else TraderApe's weekly projection. */
  projectedFinal: number;
  /** Starters with a live stat line (game underway or finished). */
  played: number;
  starters: number;
  /** 0..100, one decimal — live win probability vs this week's opponent. */
  winProb: number;
}

export interface GameDayScorer {
  name: string;
  position: string;
  /** NFL team (guest board); null in league mode, where the fantasy
   *  team is the useful owner tag instead. */
  nflTeam: string | null;
  /** Fantasy owner team (league board); null in guest mode. */
  fantasyTeam: string | null;
  points: number;
}

export interface GameDayBoard {
  week: number;
  /** True once any starter anywhere has a live stat line. Before
   *  kickoff the board ranks by projected final instead. */
  anyPlayed: boolean;
  teams: GameDayTeamRow[];
  topScorers: GameDayScorer[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** League-wide live board for the league's current week, or null when
 *  the live-matchup engine has nothing to score (no schedule, unknown
 *  week, stats for another week, or no team prices above zero — the
 *  same hide rules as previewLiveMatchups). */
export function buildGameDayBoard(
  league: League,
  stats: WeekPprStats,
  topScorersLimit = 10,
): GameDayBoard | null {
  const matchups = previewLiveMatchups(league, stats);
  if (matchups.length === 0) return null;
  const names = new Map(league.teams.map(t => [t.id, t.name]));
  const rows: Omit<GameDayTeamRow, 'rank'>[] = [];
  const scorers: GameDayScorer[] = [];
  for (const m of matchups) {
    rows.push({
      teamId: m.teamAId,
      teamName: names.get(m.teamAId) ?? m.teamAId,
      opponentName: names.get(m.teamBId) ?? m.teamBId,
      actualSoFar: m.a.actualSoFar,
      projectedFinal: m.a.projectedFinal,
      played: m.a.played,
      starters: m.a.starters,
      winProb: m.winProbA,
    });
    rows.push({
      teamId: m.teamBId,
      teamName: names.get(m.teamBId) ?? m.teamBId,
      opponentName: names.get(m.teamAId) ?? m.teamAId,
      actualSoFar: m.b.actualSoFar,
      projectedFinal: m.b.projectedFinal,
      played: m.b.played,
      starters: m.b.starters,
      winProb: round1(100 - m.winProbA),
    });
    for (const [side, teamName] of [
      [m.a, names.get(m.teamAId) ?? m.teamAId],
      [m.b, names.get(m.teamBId) ?? m.teamBId],
    ] as const) {
      for (const r of side.rows) {
        if (r.actual === null) continue;
        scorers.push({
          name: r.name,
          position: r.position,
          nflTeam: null,
          fantasyTeam: teamName,
          points: r.actual,
        });
      }
    }
  }
  const anyPlayed = rows.some(r => r.played > 0);
  // Live board: rank on banked points. Pre-kickoff every actual is 0,
  // so rank on the projected final instead of a meaningless tie.
  rows.sort((x, y) =>
    anyPlayed
      ? y.actualSoFar - x.actualSoFar ||
        y.projectedFinal - x.projectedFinal ||
        x.teamName.localeCompare(y.teamName)
      : y.projectedFinal - x.projectedFinal ||
        x.teamName.localeCompare(y.teamName),
  );
  scorers.sort(
    (a, b) => b.points - a.points || a.name.localeCompare(b.name),
  );
  return {
    week: matchups[0].week,
    anyPlayed,
    teams: rows.map((r, i) => ({ ...r, rank: i + 1 })),
    topScorers: scorers.slice(0, topScorersLimit),
  };
}

/** Top live scorers across the whole pool for guests (and any
 *  league-free read): pool players whose NFL game has started, by
 *  Sleeper's live full-PPR points this week. */
export function topLiveScorersFromStats(
  stats: WeekPprStats,
  poolPlayers: PoolPlayer[],
  topN = 15,
): GameDayScorer[] {
  const out: GameDayScorer[] = [];
  for (const p of poolPlayers) {
    if (!p.sleeperId || !stats.playedSleeperIds.has(p.sleeperId)) continue;
    const points = stats.pointsBySleeperId[p.sleeperId];
    if (typeof points !== 'number' || !Number.isFinite(points)) continue;
    out.push({
      name: p.name,
      position: p.pos,
      nflTeam: p.team,
      fantasyTeam: null,
      points: round1(points),
    });
  }
  out.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return out.slice(0, topN);
}
