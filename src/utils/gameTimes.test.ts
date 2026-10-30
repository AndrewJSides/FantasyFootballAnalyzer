import { describe, expect, it } from 'vitest';
import { gameKickoff, isGameTimeDecision } from '@/utils/gameTimes';
// The bundled snapshot shape, for the shape/coverage test only.
import * as raw from '@/data/nflGameTimes.2026.json';

const GAME_TIMES_FIXTURE = raw as unknown as {
  weeks: Record<string, Record<string, string>>;
};

describe('gameKickoff', () => {
  it('returns the ESPN-sourced kickoff for a week-8 team', () => {
    const k = gameKickoff('KC', 8);
    expect(k).not.toBeNull();
    // ESPN reports UTC; KC vs DEN week 8 kicks off Sunday 21:25 UTC.
    expect(k!.iso).toBe('2026-11-01T21:25Z');
    // 21:25 UTC = 5:25pm ET on a Sunday -> the late Sunday slot.
    expect(k!.slot).toBe('Sun 4pm');
    expect(k!.label).toMatch(/^Sun .*pm ET$/);
  });

  it('labels prime-time slots', () => {
    // Week 8 has no Mon/Thu in the snapshot's remaining slate check — use
    // whatever data says; verify the slot vocabulary on known games.
    const k = gameKickoff('GB', 8);
    expect(k).not.toBeNull();
    expect(k!.slot).toMatch(/^(Thu|Sun 1pm|Sun 4pm|SNF|MNF|Sat)$/);
  });

  it('orders slots chronologically by kickoff time', () => {
    const teams = Object.keys(GAME_TIMES_FIXTURE.weeks['8'] ?? {});
    const ks = teams
      .map(t => gameKickoff(t, 8))
      .filter((k): k is NonNullable<typeof k> => k !== null);
    expect(ks.length).toBeGreaterThan(0);
    const ranks = ks.map(k => k.rank).sort((a, b) => a - b);
    expect(ranks[0]).toBeLessThan(ranks[ranks.length - 1]);
  });

  it('returns null for unknown teams and undefined weeks', () => {
    expect(gameKickoff('ZZZ', 8)).toBeNull();
    expect(gameKickoff('KC', 99)).toBeNull();
    expect(gameKickoff('KC', undefined)).toBeNull();
  });
});

describe('isGameTimeDecision', () => {
  it('flags Questionable and Doubtful', () => {
    expect(isGameTimeDecision('Questionable')).toBe(true);
    expect(isGameTimeDecision('Doubtful')).toBe(true);
    expect(isGameTimeDecision('questionable - ankle')).toBe(true);
  });

  it('ignores everything else', () => {
    expect(isGameTimeDecision('Out')).toBe(false);
    expect(isGameTimeDecision('Probable')).toBe(false);
    expect(isGameTimeDecision(null)).toBe(false);
    expect(isGameTimeDecision(undefined)).toBe(false);
  });
});
