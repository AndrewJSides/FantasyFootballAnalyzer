// Weekly matchup preview (backlog item 12): this week's projected score for
// every team, priced on the same projection engine as the Start/Sit optimizer
// (recency-weighted form blended with the season baseline, nudged by this
// week's matchup difficulty, completed weeks only), plus a per-matchup win
// probability. Since backlog item 24 the probability is Monte Carlo: each
// optimal-lineup starter's score is drawn from his TraderApe projection ±
// his own week-to-week volatility, and the preview names the swing players
// who carry the most of the matchup's variance. The section hides when the
// sync didn't fetch a future schedule (old snapshots, guest mode) or no
// team has pricing data.

import type { League, Team } from '@/types';
import { DEFAULT_ROSTER_SLOTS } from '@/utils/draftDefaults';
import { optimalLineup } from '@/utils/optimalLineup';
import { scoreRosterPlayers, type ScoredPlayer } from '@/utils/rosterScoring';
import { monteCarloWinProb, type ScoreDistribution, type SwingPlayer } from '@/utils/weeklyWinProb';

/** A 30-pt projected-score gap ≈ 91% win probability — the same calibration
 *  as the playoff-race elo scale, fitted to typical full-PPR weekly spreads. */
const PROJ_DIFF_SCALE = 30;

export interface TeamScorePreview {
  teamId: string;
  /** Optimal-lineup projected points, 2dp like the rest of the app. */
  projectedScore: number;
  starters: number;
}

export interface MatchupPreview {
  week: number;
  teamAId: string;
  teamBId: string;
  projA: number;
  projB: number;
  /** 0..100, one decimal — team A's win probability (team B's is 100 - it). */
  winProbA: number;
  /** Starters who carry the most of the matchup's variance (item 24). */
  swingPlayers: SwingPlayer[];
  /** P10/median/P90 of each team's simulated scores, from the same sim run. */
  distA: ScoreDistribution;
  distB: ScoreDistribution;
}

/** Scored starters for one team's optimal lineup, with their team id for
 *  the Monte Carlo engine. */
interface ScoredLineup {
  preview: TeamScorePreview;
  starters: (ScoredPlayer & { teamId: string })[];
}

export function winProbFromProjDiff(diff: number): number {
  return 1 / (1 + Math.pow(10, -diff / PROJ_DIFF_SCALE));
}

export function scoreTeamLineup(
  team: Team,
  league: Pick<
    League,
    'rosterSlots' | 'currentWeek' | 'season' | 'playerWeeklyPoints' | 'gamesPlayed'
  >,
): ScoredLineup | null {
  const roster = team.roster;
  if (!roster || roster.length === 0) return null;
  const scored = scoreRosterPlayers({
    roster,
    weeklyPoints: league.playerWeeklyPoints,
    gamesBySleeperId: league.gamesPlayed?.bySleeperId,
    gamesSeason: league.gamesPlayed?.season,
    season: league.season,
    currentWeek: league.currentWeek,
  });
  // Players on bye score zero this week and never start — same treatment as
  // the Start/Sit page, so the two projections can't disagree.
  const lineup = optimalLineup(
    scored.filter(s => !s.onBye),
    league.rosterSlots ?? DEFAULT_ROSTER_SLOTS,
  );
  return {
    preview: {
      teamId: team.id,
      projectedScore: lineup.totalScore,
      starters: lineup.starters.filter(s => s.player !== null).length,
    },
    starters: lineup.starters
      .map(s => s.player)
      .filter((p): p is ScoredPlayer => p !== null)
      .map(p => ({ ...p, teamId: team.id })),
  };
}

export function projectTeamScore(
  team: Team,
  league: Pick<
    League,
    'rosterSlots' | 'currentWeek' | 'season' | 'playerWeeklyPoints' | 'gamesPlayed'
  >,
): TeamScorePreview | null {
  return scoreTeamLineup(team, league)?.preview ?? null;
}

export interface PreviewMatchupOptions {
  /** Simulation seed — tests pass one for stable results. */
  seed?: number;
  /** Simulation count override (tests). */
  simulations?: number;
}

/** One preview per current-week matchup where both teams have pricing data.
 *  The win probability is Monte Carlo: each optimal-lineup starter's score
 *  is drawn from his TraderApe projection ± his own week-to-week volatility
 *  (backlog item 24). Returns [] (caller hides the section) when the
 *  schedule is absent, the current week is unknown, or no team prices above
 *  zero. */
export function previewWeeklyMatchups(
  league: League,
  opts: PreviewMatchupOptions = {},
): MatchupPreview[] {
  const { currentWeek, futureSchedule, teams } = league;
  if (currentWeek === undefined || !futureSchedule || futureSchedule.length === 0) {
    return [];
  }
  const scored = new Map<string, ScoredLineup>();
  for (const team of teams) {
    const p = scoreTeamLineup(team, league);
    // A zero projection means no weekly or season data for anyone on the
    // roster — a preview against it would be noise, so skip the team.
    if (p !== null && p.preview.projectedScore > 0) scored.set(team.id, p);
  }
  const out: MatchupPreview[] = [];
  for (const m of futureSchedule) {
    if (m.week !== currentWeek) continue;
    const a = scored.get(m.team1Id);
    const b = scored.get(m.team2Id);
    if (!a || !b) continue;
    const mc = monteCarloWinProb(a.starters, b.starters, opts);
    out.push({
      week: m.week,
      teamAId: m.team1Id,
      teamBId: m.team2Id,
      projA: a.preview.projectedScore,
      projB: b.preview.projectedScore,
      winProbA: mc.winProbA,
      swingPlayers: mc.swingPlayers,
      distA: mc.distA,
      distB: mc.distB,
    });
  }
  return out;
}
