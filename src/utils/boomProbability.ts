// Boom probability (backlog item 100) — TraderApe's own take on the per-player
// upside question the FantasyPros "Boom, Bust, and Everything In Between"
// series poses (public feature description only, researched Nov 2, 2026): the
// chance this week's score clears the position's boom bar. Priced from this
// week's TraderApe projection as the normal mean and the player's own
// week-to-week volatility as the standard deviation — the same distribution
// the weekly win-probability Monte Carlo draws from, and the same fallback
// convention the lineup modes use when the player has too little history.
// The bar is TraderApe's own boomBustBars (item 20), not any competitor's
// published cutoffs. No copied content.

import { boomBustBars } from '@/utils/consistency';

/**
 * Standard normal CDF via the Abramowitz–Stegun 7.1.26 rational
 * approximation (|error| < 7.5e-8 — plenty for a displayed probability).
 */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t) *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * P(this week's score exceeds boomBar) as a 0–1 fraction, pricing the week
 * as Normal(projected, stdDev). Returns null when there is no finite
 * projection or stdDev to price on. A zero stdDev collapses to the
 * degenerate answer (1 when the projection clears the bar, else 0).
 */
export function boomProbability(
  projected: number | null | undefined,
  stdDev: number | null | undefined,
  boomBar: number,
): number | null {
  if (projected == null || !Number.isFinite(projected)) return null;
  if (stdDev == null || !Number.isFinite(stdDev)) return null;
  if (!Number.isFinite(boomBar)) return null;
  if (stdDev <= 0) return projected > boomBar ? 1 : 0;
  return 1 - normalCdf((boomBar - projected) / stdDev);
}

/**
 * Convenience: the chance of clearing this position's own TraderApe boom
 * bar (QB 25 / RB-WR 20 / TE 15 full-PPR points).
 */
export function boomChance(
  projected: number | null | undefined,
  stdDev: number | null | undefined,
  position: string | undefined,
): { probability: number | null; boomBar: number } {
  const boomBar = boomBustBars(position).boomBar;
  return { probability: boomProbability(projected, stdDev, boomBar), boomBar };
}
