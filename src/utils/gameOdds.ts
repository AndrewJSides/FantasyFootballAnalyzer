// Vegas game-environment flags for the Scores page (backlog item 97).
// The odds line answers the weekly streaming/lineup tiebreak questions:
// high totals flag shootout conditions (stream pass-catchers, expect
// scoring), big spreads flag blowout game scripts (favor the favorite's
// RBs, fade fringe receivers). Everything is TraderApe's own math on
// ESPN's free public odds feed — market context, never betting advice.

import type { GameOdds } from '@/api/espnScoreboard';

/** O/U at or above this flags shootout conditions. */
export const SHOOTOUT_TOTAL = 48;
/** A spread this large flags a blowout game script. */
export const BLOWOUT_SPREAD = 7;

export type OddsFlag = 'shootout' | 'blowout';

/** Standard implied-total split: the spread is home-team-relative
 *  (negative = home favored), so home gets (total − spread)/2. Values are
 *  rounded to one decimal. Null unless both inputs are finite. */
export function impliedTotals(
  overUnder: number | null | undefined,
  spread: number | null | undefined,
): { home: number; away: number } | null {
  if (
    typeof overUnder !== 'number' ||
    !Number.isFinite(overUnder) ||
    typeof spread !== 'number' ||
    !Number.isFinite(spread)
  ) {
    return null;
  }
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return { home: round1((overUnder - spread) / 2), away: round1((overUnder + spread) / 2) };
}

/** Environment flags for a game: shootout (high total), blowout script
 *  (large spread). Both can fire on one game; returns [] with no total. */
export function oddsFlags(
  overUnder: number | null | undefined,
  spread: number | null | undefined,
): OddsFlag[] {
  if (typeof overUnder !== 'number' || !Number.isFinite(overUnder)) return [];
  const flags: OddsFlag[] = [];
  if (overUnder >= SHOOTOUT_TOTAL) flags.push('shootout');
  if (typeof spread === 'number' && Number.isFinite(spread) && Math.abs(spread) >= BLOWOUT_SPREAD) {
    flags.push('blowout');
  }
  return flags;
}

export interface OddsSummary {
  /** Compact visible line, e.g. "SEA -3 · O/U 46.5 · Shootout". */
  text: string;
  /** Plain-language accessible version with implied totals and impact. */
  aria: string;
}

const FLAG_COPY: Record<OddsFlag, { chip: string; detail: string }> = {
  shootout: {
    chip: 'Shootout',
    detail: 'shootout conditions — expect a high-scoring game',
  },
  blowout: {
    chip: 'Blowout script',
    detail: 'blowout game script expected — the favorite may lean on the run',
  },
};

/** Summarize one game's odds for the card. Null when there is nothing to
 *  show (no details and no total). The caller decides which game states
 *  get the line — completed games never carry odds in the feed. */
export function summarizeOdds(
  odds: GameOdds | null | undefined,
  awayAbbr: string,
  homeAbbr: string,
): OddsSummary | null {
  if (!odds) return null;
  const parts: string[] = [];
  const ariaParts: string[] = [];
  if (odds.details) {
    parts.push(odds.details);
    ariaParts.push(`the line is ${odds.details}`);
  }
  if (odds.overUnder !== null) {
    parts.push(`O/U ${odds.overUnder}`);
    ariaParts.push(`the over/under is ${odds.overUnder}`);
  }
  if (parts.length === 0) return null;

  const flags = oddsFlags(odds.overUnder, odds.spread);
  for (const flag of flags) {
    parts.push(FLAG_COPY[flag].chip);
    ariaParts.push(FLAG_COPY[flag].detail);
  }

  const implied = impliedTotals(odds.overUnder, odds.spread);
  if (implied) {
    ariaParts.push(
      `implied totals: ${homeAbbr} ${implied.home}, ${awayAbbr} ${implied.away}`,
    );
  }
  return {
    text: parts.join(' · '),
    aria: `Odds: ${ariaParts.join('; ')}.`,
  };
}
