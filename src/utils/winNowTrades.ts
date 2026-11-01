// Win-now trade targets (backlog item 75): the Trade Finder's 1-for-1
// candidates between the two teams of a weekly matchup, re-priced on THIS
// week's Monte Carlo win probability — answering "which of these trades
// raises my chance of winning this week". The swap pricing reuses each
// team's real scored roster: the swapped players keep their own weekly
// history and volatility, lineups are re-optimized (same discipline as
// the preview: byes and injury-outs never start), and the baseline and
// every scenario run the same seeded Monte Carlo so the delta is the
// trade's effect, not sim noise. Guidance only: nothing here moves a
// player.

import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import { DEFAULT_ROSTER_SLOTS } from '@/utils/draftDefaults';
import {
  findTradeCandidates,
  type TradeCandidate,
} from '@/utils/tradeFinder';
import { optimalLineup } from '@/utils/optimalLineup';
import {
  scoreRosterPlayers,
  type ScoredPlayer,
} from '@/utils/rosterScoring';
import {
  monteCarloWinProb,
} from '@/utils/weeklyWinProb';
import type { League } from '@/types';
import type { PoolPlayer } from '@/types/draft';

export interface WinNowTrade {
  candidate: TradeCandidate;
  /** The focus team gives these, gets the others. */
  focusGives: PoolPlayer[];
  focusGets: PoolPlayer[];
  /** Focus team's win probability, 0..100 one decimal. */
  winProbBefore: number;
  winProbAfter: number;
  /** winProbAfter - winProbBefore, percentage points, one decimal. */
  gain: number;
  projBefore: number;
  projAfter: number;
}

export interface WinNowTradesResult {
  week: number | undefined;
  focusTeamId: string;
  opponentTeamId: string;
  winProbBefore: number;
  projBefore: number;
  trades: WinNowTrade[];
}

export interface WinNowTradesOptions {
  /** Fixed seed so the baseline and every scenario share the same draws. */
  seed?: number;
  /** Monte Carlo sim count per pricing (default 2000, like the forced
   *  playoff-race runs — enough for a stable few-point delta). */
  simulations?: number;
  /** Minimum win-probability gain in percentage points (default 2). */
  minGainPp?: number;
  /** Max trades returned (default 3). */
  maxTrades?: number;
}

type LineupStarter = ScoredPlayer & { teamId: string };

const DEFAULT_SEED = 20261101;
const DEFAULT_SIMS = 2000;
const DEFAULT_MIN_GAIN_PP = 2;
const DEFAULT_MAX_TRADES = 3;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Optimal weekly lineup for one team's scored roster, same discipline
 *  as the Matchup preview: byes and injury-outs never start. */
function scoredLineup(
  scored: ScoredPlayer[],
  teamId: string,
  slots: League['rosterSlots'],
): { total: number; starters: LineupStarter[] } {
  const lineup = optimalLineup(
    scored.filter(s => !s.onBye && !s.injuredOut),
    slots ?? DEFAULT_ROSTER_SLOTS,
  );
  const starters = lineup.starters
    .map(s => s.player)
    .filter((p): p is ScoredPlayer => p !== null)
    .map(p => ({ ...p, teamId }));
  return { total: lineup.totalScore, starters };
}

/**
 * Price this week's win probability for the focus team against the
 * opponent after swapping one player each way, given both teams' scored
 * rosters. Pure helper — the swap is by pool id, so either team's real
 * roster player matches.
 */
export function priceSwapWinProb(
  focusScored: ScoredPlayer[],
  oppScored: ScoredPlayer[],
  focusTeamId: string,
  givePoolId: string,
  getPoolId: string,
  league: Pick<League, 'rosterSlots'>,
  opts: { seed?: number; simulations?: number } = {},
): { winProbA: number; projA: number; projB: number } | null {
  const index = indexPool(POOL);
  const poolIdOf = (s: ScoredPlayer): string | undefined =>
    resolvePoolPlayer(s.player, index)?.id;
  const giveFromFocus = focusScored.find(s => poolIdOf(s) === givePoolId);
  const getFromOpp = oppScored.find(s => poolIdOf(s) === getPoolId);
  if (!giveFromFocus || !getFromOpp) return null;
  const focusSwapped = [
    ...focusScored.filter(s => s !== giveFromFocus),
    getFromOpp,
  ];
  const oppSwapped = [...oppScored.filter(s => s !== getFromOpp), giveFromFocus];
  const a = scoredLineup(focusSwapped, focusTeamId, league.rosterSlots);
  const b = scoredLineup(oppSwapped, 'opp', league.rosterSlots);
  const mc = monteCarloWinProb(a.starters, b.starters, {
    seed: opts.seed ?? DEFAULT_SEED,
    simulations: opts.simulations ?? DEFAULT_SIMS,
  });
  return { winProbA: mc.winProbA, projA: a.total, projB: b.total };
}

/**
 * The Trade Finder's 1-for-1 candidates between the two teams, ranked by
 * how much each raises the focus team's win probability THIS week.
 * Returns null when either team has no priceable roster.
 */
export function winNowTrades(
  league: League,
  focusTeamId: string,
  opponentTeamId: string,
  opts: WinNowTradesOptions = {},
): WinNowTradesResult | null {
  const seed = opts.seed ?? DEFAULT_SEED;
  const simulations = opts.simulations ?? DEFAULT_SIMS;
  const minGainPp = opts.minGainPp ?? DEFAULT_MIN_GAIN_PP;
  const maxTrades = opts.maxTrades ?? DEFAULT_MAX_TRADES;

  const focusRoster = league.teams.find(t => t.id === focusTeamId)?.roster;
  const oppRoster = league.teams.find(t => t.id === opponentTeamId)?.roster;
  if (!focusRoster?.length || !oppRoster?.length) return null;

  const scoredByTeam = new Map<string, ScoredPlayer[]>();
  for (const [id, roster] of [
    [focusTeamId, focusRoster],
    [opponentTeamId, oppRoster],
  ] as const) {
    scoredByTeam.set(
      id,
      scoreRosterPlayers({
        roster,
        weeklyPoints: league.playerWeeklyPoints,
        gamesBySleeperId: league.gamesPlayed?.bySleeperId,
        gamesSeason: league.gamesPlayed?.season,
        season: league.season,
        currentWeek: league.currentWeek,
      }),
    );
  }
  const focusScored = scoredByTeam.get(focusTeamId)!;
  const oppScored = scoredByTeam.get(opponentTeamId)!;

  const baseA = scoredLineup(focusScored, focusTeamId, league.rosterSlots);
  const baseB = scoredLineup(oppScored, opponentTeamId, league.rosterSlots);
  if (baseA.total <= 0 || baseB.total <= 0) return null;
  const baseMc = monteCarloWinProb(baseA.starters, baseB.starters, {
    seed,
    simulations,
  });
  const winProbBefore = baseMc.winProbA;

  const candidates = findTradeCandidates(league).filter(
    c =>
      c.aGives.length === 1 &&
      c.bGives.length === 1 &&
      ((c.teamA.id === focusTeamId && c.teamB.id === opponentTeamId) ||
        (c.teamA.id === opponentTeamId && c.teamB.id === focusTeamId)),
  );

  const out: WinNowTrade[] = [];
  for (const candidate of candidates) {
    const focusIsA = candidate.teamA.id === focusTeamId;
    const focusGives = focusIsA ? candidate.aGives : candidate.bGives;
    const focusGets = focusIsA ? candidate.bGives : candidate.aGives;
    const priced = priceSwapWinProb(
      focusScored,
      oppScored,
      focusTeamId,
      focusGives[0].id,
      focusGets[0].id,
      league,
      { seed, simulations },
    );
    if (!priced) continue;
    // priceSwapWinProb always prices the focus team as team A, so
    // priced.winProbA is already the focus team's win probability.
    const winProbAfter = priced.winProbA;
    const gain = round1(winProbAfter - winProbBefore);
    if (gain < minGainPp) continue;
    out.push({
      candidate,
      focusGives,
      focusGets,
      winProbBefore,
      winProbAfter,
      gain,
      projBefore: round1(baseA.total),
      projAfter: round1(priced.projA),
    });
  }
  out.sort((a, b) => b.gain - a.gain);
  return {
    week: league.currentWeek,
    focusTeamId,
    opponentTeamId,
    winProbBefore,
    projBefore: round1(baseA.total),
    trades: out.slice(0, maxTrades),
  };
}
