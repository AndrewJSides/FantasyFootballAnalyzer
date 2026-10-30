// Weekly win probability via Monte Carlo (backlog item 24): instead of the
// closed-form elo calibration on the projected-score gap, this samples each
// optimal-lineup starter's weekly score from a Normal distribution priced on
// TraderApe's own projection (mean) ± the player's own week-to-week
// volatility (std dev of his completed weeks), then counts how often each
// side wins. It also reports the 2-3 "swing players" — the starters whose
// variance contributes most to the matchup's uncertainty, i.e. who is most
// likely to decide it. Pure data logic — the page owns the rendering.

import { mulberry32 } from '@/utils/playoffOdds';
import type { ScoredPlayer } from '@/utils/rosterScoring';

/** Default simulation count — matches the playoff-race Monte Carlo. */
export const WEEKLY_WIN_PROB_SIMS = 10000;

/** How many swing players to name per matchup (the backlog item says 2-3). */
export const SWING_PLAYER_COUNT = 3;

export interface SwingPlayer {
  name: string;
  teamId: string;
  /** The player's own weekly std dev used in the simulation, 1dp. */
  std: number;
  /** Share of the matchup's total score-gap variance, 0..100 1dp. */
  swingShare: number;
}

export interface MonteCarloWinProb {
  /** 0..100, one decimal — team A's win probability. */
  winProbA: number;
  /** Top swing players across both starting lineups. */
  swingPlayers: SwingPlayer[];
}

export interface WeeklyWinProbOptions {
  simulations?: number;
  /** Seed for deterministic runs (tests). Default: random. */
  seed?: number;
}

/** Box-Muller: one Normal(0,1) draw from the given PRNG. */
function randn(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Resolve a starter's (mean, std) for the simulation. The mean is the
 * TraderApe weekly projection (already lineup-scored); the std is the
 * player's own completed-week volatility, falling back to a 45%-of-mean
 * estimate when the player has fewer than 2 games (roughly the league's
 * median coefficient of variation across positions).
 */
export function playerScoreDistribution(player: ScoredPlayer): {
  mean: number;
  std: number;
} {
  const mean = player.score;
  const std =
    player.stdDev !== null && player.stdDev !== undefined
      ? player.stdDev
      : Math.max(3, 0.45 * Math.max(0, mean));
  return { mean, std };
}

/**
 * Monte Carlo a head-to-head week between two optimal lineups. Returns
 * team A's win probability plus the starters who carry the most of the
 * matchup's variance (the swing players). Teams' starters are independent —
 * weekly player scores are treated as independent draws, so the score gap's
 * variance is the sum of each starter's variance, and each starter's swing
 * share is his variance over that total.
 */
export function monteCarloWinProb(
  teamAStarters: (ScoredPlayer & { teamId: string })[],
  teamBStarters: (ScoredPlayer & { teamId: string })[],
  opts: WeeklyWinProbOptions = {},
): MonteCarloWinProb {
  const sims = opts.simulations ?? WEEKLY_WIN_PROB_SIMS;
  const rand = opts.seed === undefined ? Math.random : mulberry32(opts.seed);
  const aDist = teamAStarters.map(playerScoreDistribution);
  const bDist = teamBStarters.map(playerScoreDistribution);

  let aWins = 0;
  for (let s = 0; s < sims; s++) {
    let scoreA = 0;
    for (let i = 0; i < aDist.length; i++) {
      scoreA += aDist[i].mean + aDist[i].std * randn(rand);
    }
    let scoreB = 0;
    for (let i = 0; i < bDist.length; i++) {
      scoreB += bDist[i].mean + bDist[i].std * randn(rand);
    }
    if (scoreA > scoreB) aWins += 1;
    else if (scoreA === scoreB) aWins += 0.5;
  }

  // Swing players: share of the score-gap variance per starter. With
  // independent draws the gap variance is the sum of the starter variances,
  // so each starter's share is directly his contribution to the matchup's
  // uncertainty. Sort both teams' starters together, keep the top N.
  const all = [
    ...teamAStarters.map((p, i) => ({ p, teamId: p.teamId, std: aDist[i].std })),
    ...teamBStarters.map((p, i) => ({ p, teamId: p.teamId, std: bDist[i].std })),
  ];
  const totalVar = all.reduce((s, e) => s + e.std * e.std, 0);
  const swingPlayers: SwingPlayer[] =
    totalVar > 0
      ? all
          .map(e => ({
            name: e.p.name,
            teamId: e.teamId,
            std: Math.round(e.std * 10) / 10,
            swingShare: Math.round(((e.std * e.std) / totalVar) * 1000) / 10,
          }))
          .sort((x, y) => y.swingShare - x.swingShare)
          .slice(0, SWING_PLAYER_COUNT)
      : [];

  return {
    winProbA: Math.round((aWins / sims) * 1000) / 10,
    swingPlayers,
  };
}
