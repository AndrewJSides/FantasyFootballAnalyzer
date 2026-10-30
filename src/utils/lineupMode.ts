// Lineup modes for the Start/Sit optimizer (backlog item 25): rank starters
// on the projection (balanced), on each player's P75 upside (chase ceiling —
// the underdog play when a big week is the only way to win), or on the P25
// floor (protect floor — the favorite's play to avoid a bust losing the
// week). The floor/ceiling is built from the player's own week-to-week
// volatility (rosterScoring's population std dev of completed weeks, with the
// same 45%-of-mean fallback the Monte Carlo win-probability model uses), so
// it is measured from his own history, not a guess. Public strategy writing
// is unanimous on the shape: a favorite wants the steadier role, an
// underdog wants the player who could score a lot even if he might score
// little.

import type { ScoredPlayer } from './rosterScoring';

export type LineupMode = 'balanced' | 'ceiling' | 'floor';

export const LINEUP_MODES: readonly {
  id: LineupMode;
  label: string;
  hint: string;
}[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    hint: 'Rank on projected points — the best lineup in the average week.',
  },
  {
    id: 'ceiling',
    label: 'Chase ceiling',
    hint: 'Rank on P75 upside — the underdog play when you need a big week.',
  },
  {
    id: 'floor',
    label: 'Protect floor',
    hint: 'Rank on P25 floor — the favorite\u2019s play to avoid a bust.',
  },
];

// P25/P75 of a normal distribution sit ±0.6745σ from the mean.
const Z_75 = 0.6745;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Player's volatility in mode scoring; same fallback as the win-prob model. */
export function modeStdDev(player: ScoredPlayer, mean: number): number {
  return player.stdDev ?? Math.max(3, 0.45 * Math.max(0, mean));
}

// The score the lineup optimizer ranks on in each mode: the projection
// itself, or the P75 upside / P25 floor built from the player's own
// volatility. Players with no projection fall back to their season average,
// matching the balanced scorer.
export function modeScore(player: ScoredPlayer, mode: LineupMode): number {
  const mean = player.projection?.projection ?? player.ppg ?? 0;
  if (mode === 'balanced') return mean;
  const sd = modeStdDev(player, mean);
  return round1(mean + (mode === 'ceiling' ? Z_75 : -Z_75) * sd);
}

/** Unit label for a mode-adjusted gap, for the "why they sit" column. */
export function modeScoreUnit(mode: LineupMode, hasProjection: boolean): string {
  if (mode === 'ceiling') return 'ceiling pts';
  if (mode === 'floor') return 'floor pts';
  return hasProjection ? 'projected pts' : 'pts/game';
}

/** "Highest average/ceiling/floor among remaining …" wording. */
export function modeSlotVerb(mode: LineupMode): string {
  return mode === 'balanced' ? 'average' : mode === 'ceiling' ? 'ceiling' : 'floor';
}

/** Combined-lineup unit for section titles ("X projected points combined"). */
export function modeTotalUnit(mode: LineupMode): string {
  return mode === 'balanced'
    ? 'projected points'
    : mode === 'ceiling'
      ? 'P75 ceiling points'
      : 'P25 floor points';
}
