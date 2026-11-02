// gameOdds (backlog item 97): implied totals, environment flags, and the
// card summary line from ESPN's free public odds feed.

import { describe, expect, it } from 'vitest';
import {
  impliedTotals,
  oddsFlags,
  summarizeOdds,
  SHOOTOUT_TOTAL,
  BLOWOUT_SPREAD,
} from './gameOdds';

describe('impliedTotals', () => {
  it('splits the total around the home-relative spread', () => {
    // Verified live example: SEA home, spread -3, O/U 46.5 -> SEA 24.75,
    // CHI 21.75.
    expect(impliedTotals(46.5, -3)).toEqual({ home: 24.8, away: 21.8 });
  });

  it('handles a home underdog (positive spread)', () => {
    expect(impliedTotals(44, 7)).toEqual({ home: 18.5, away: 25.5 });
  });

  it('rounds to one decimal', () => {
    expect(impliedTotals(47.5, -2.5)).toEqual({ home: 25, away: 22.5 });
  });

  it('returns null without both inputs', () => {
    expect(impliedTotals(null, -3)).toBeNull();
    expect(impliedTotals(46.5, null)).toBeNull();
    expect(impliedTotals(undefined, undefined)).toBeNull();
    expect(impliedTotals(NaN, -3)).toBeNull();
  });
});

describe('oddsFlags', () => {
  it('flags shootouts at the total threshold', () => {
    expect(oddsFlags(SHOOTOUT_TOTAL, 0)).toEqual(['shootout']);
    expect(oddsFlags(SHOOTOUT_TOTAL - 0.5, 0)).toEqual([]);
  });

  it('flags blowout scripts at the spread threshold', () => {
    expect(oddsFlags(40, BLOWOUT_SPREAD)).toEqual(['blowout']);
    expect(oddsFlags(40, -BLOWOUT_SPREAD)).toEqual(['blowout']);
    expect(oddsFlags(40, 6.5)).toEqual([]);
  });

  it('can flag both on one game', () => {
    expect(oddsFlags(52, -10)).toEqual(['shootout', 'blowout']);
  });

  it('returns no flags without a total, even with a spread', () => {
    expect(oddsFlags(null, -10)).toEqual([]);
  });
});

describe('summarizeOdds', () => {
  it('builds the visible line with flags and the accessible version with implied totals', () => {
    const summary = summarizeOdds(
      { details: 'SEA -3', overUnder: 52, spread: -10 },
      'CHI',
      'SEA',
    );
    expect(summary).not.toBeNull();
    expect(summary!.text).toBe('SEA -3 · O/U 52 · Shootout · Blowout script');
    expect(summary!.aria).toContain('implied totals: SEA 31, CHI 21');
    expect(summary!.aria).toContain('shootout conditions');
    expect(summary!.aria).toContain('blowout game script');
  });

  it('works without flags or spread', () => {
    const summary = summarizeOdds(
      { details: 'KC -1.5', overUnder: 44, spread: null },
      'KC',
      'BUF',
    );
    expect(summary!.text).toBe('KC -1.5 · O/U 44');
    expect(summary!.aria).not.toContain('implied totals');
  });

  it('returns null with no showable fields', () => {
    expect(summarizeOdds(null, 'KC', 'BUF')).toBeNull();
    expect(
      summarizeOdds({ details: null, overUnder: null, spread: null }, 'KC', 'BUF'),
    ).toBeNull();
    expect(
      summarizeOdds({ details: null, overUnder: null, spread: -3 }, 'KC', 'BUF'),
    ).toBeNull();
  });
});
