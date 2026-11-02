// Swap impact (backlog item 98): price each of the game plan's close-call
// flags on THIS week's Monte Carlo win probability — answering "if I make
// this swap, how much does my win chance move". The swapped lineup replaces
// the starter with the flag's challenger (same ScoredPlayer the game plan
// priced, so the sim can't disagree with the flag's projection numbers);
// the baseline and every swap share the same seeded sims, so the delta is
// the swap's effect, not sim noise (same convention as the win-now trade
// pricing). Guidance only: nothing here changes any lineup.

import { monteCarloWinProb } from '@/utils/weeklyWinProb';
import type { ScoredPlayer } from '@/utils/rosterScoring';
import type { SwapFlag } from '@/utils/gamePlan';

export interface SwapImpact {
  slot: string;
  starterName: string;
  challengerName: string;
  /** Focus team's win probability with the current lineup, 0..100 1dp. */
  winProbBefore: number;
  /** Focus team's win probability with the swap made, 0..100 1dp. */
  winProbAfter: number;
  /** After minus before, percentage points, 1dp. */
  gain: number;
}

export interface SwapImpactOptions {
  /** Fixed seed so the baseline and every swap share the same draws. */
  seed?: number;
  /** Monte Carlo sim count per pricing (default 2000, like the forced
   *  playoff-race runs and the win-now trade pricing). */
  simulations?: number;
}

type LineupStarter = ScoredPlayer & { teamId: string };

/** Same seeded-sim convention as the win-now trade pricing. */
export const SWAP_IMPACT_SEED = 20261101;
export const SWAP_IMPACT_SIMS = 2000;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Price the win-probability impact of making each close-call swap for the
 * focus team against this week's opponent. focusStarters/oppStarters are
 * the matchup preview's priced optimal lineups (focus team's first).
 * Flags whose starter isn't in the focus lineup are skipped.
 */
export function priceSwapImpacts(
  focusStarters: LineupStarter[],
  oppStarters: LineupStarter[],
  flags: SwapFlag[],
  opts: SwapImpactOptions = {},
): SwapImpact[] {
  const seed = opts.seed ?? SWAP_IMPACT_SEED;
  const simulations = opts.simulations ?? SWAP_IMPACT_SIMS;
  if (focusStarters.length === 0 || oppStarters.length === 0) return [];

  const winProbBefore = monteCarloWinProb(focusStarters, oppStarters, {
    seed,
    simulations,
  }).winProbA;

  const out: SwapImpact[] = [];
  for (const flag of flags) {
    const starter = focusStarters.find(s => s.id === flag.starterId);
    if (!starter) continue;
    const swapped = focusStarters.map(s =>
      s.id === flag.starterId
        ? { ...flag.challenger, teamId: starter.teamId }
        : s,
    );
    const winProbAfter = monteCarloWinProb(swapped, oppStarters, {
      seed,
      simulations,
    }).winProbA;
    out.push({
      slot: flag.slot,
      starterName: flag.starterName,
      challengerName: flag.challengerName,
      winProbBefore: round1(winProbBefore),
      winProbAfter: round1(winProbAfter),
      gain: round1(winProbAfter - winProbBefore),
    });
  }
  return out;
}
