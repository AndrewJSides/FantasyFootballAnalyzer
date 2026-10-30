// breakoutWatch tests: surge flags, sample floors, rostered exclusion,
// ranking order.
import { describe, it, expect } from 'vitest';
import {
  breakoutCandidates,
  BASELINE_MIN_GAMES,
  RECENT_MIN_GAMES,
  RECENT_FLOOR,
  SURGE_RATIO,
  MAX_BREAKOUTS,
  type BreakoutWatchInput,
} from './breakoutWatch';
import type { PoolPlayer } from '@/types/draft';

function player(id: string, pos = 'WR'): PoolPlayer {
  return {
    id,
    name: `Player ${id}`,
    team: 'DAL',
    pos,
    posRank: 10,
    overallRank: 60,
    tier: 2,
    bye: 7,
    baseValue: null,
    projPtsPpr: 120,
    sleeperId: id,
  } as PoolPlayer;
}

/** Weekly points helper: weeks 1-8 completed, current week 9. */
function input(
  points: Record<string, Record<number, number>>,
  overrides: Partial<BreakoutWatchInput> = {},
): BreakoutWatchInput {
  const poolPlayers = Object.keys(points).map(id => player(id));
  return { poolPlayers, weeklyPoints: points, currentWeek: 9, ...overrides };
}

// Baseline = weeks 1-5, recent = weeks 6-8.
const breakoutSeries = {
  '1': 4, '2': 5, '3': 6, '4': 5, '5': 6,   // baseline 5.2
  '6': 18, '7': 16, '8': 20,                  // recent 18.0 -> 3.5x
};

describe('breakoutCandidates', () => {
  it('flags a player surging 60%+ over his own baseline', () => {
    const out = breakoutCandidates(input({ a: breakoutSeries }));
    expect(out).toHaveLength(1);
    expect(out[0].player.id).toBe('a');
    expect(out[0].last3).toBe(18);
    expect(out[0].baseline).toBe(5.2);
    expect(out[0].surge).toBeCloseTo(3.46, 1);
    expect(out[0].last3Weeks).toBe(3);
    expect(out[0].baselineWeeks).toBe(5);
  });

  it('ignores players below the recent floor', () => {
    // 3x surge but only 4 pts/game recently — noise, not a breakout.
    const out = breakoutCandidates(
      input({
        a: { '1': 1, '2': 1, '3': 2, '4': 1, '5': 1, '6': 4, '7': 4, '8': 4 },
      }),
    );
    expect(out).toHaveLength(0);
  });

  it('ignores surges under the ratio threshold', () => {
    // 20 recent vs 14 baseline = 1.43x — hot, not a breakout.
    const out = breakoutCandidates(
      input({
        a: { '1': 14, '2': 14, '3': 14, '4': 14, '5': 14, '6': 20, '7': 20, '8': 20 },
      }),
    );
    expect(out).toHaveLength(0);
  });

  it('requires the baseline sample', () => {
    // Only 2 baseline games — too thin to judge a surge.
    const out = breakoutCandidates(
      input({ a: { '4': 5, '5': 6, '6': 18, '7': 16, '8': 20 } }),
    );
    expect(out).toHaveLength(0);
  });

  it('requires the recent sample', () => {
    // Only 1 recent game.
    const out = breakoutCandidates(
      input({
        a: { '1': 4, '2': 5, '3': 6, '4': 5, '5': 6, '8': 20 },
      }),
    );
    expect(out).toHaveLength(0);
  });

  it('excludes rostered players when ownership is known', () => {
    const p = player('a');
    const out = breakoutCandidates({
      poolPlayers: [p],
      weeklyPoints: { a: breakoutSeries },
      teamByPoolId: new Map([['a', 'Rivals']]),
      currentWeek: 9,
    });
    expect(out).toHaveLength(0);
  });

  it('resolves league-mode weekly points via platformIdByPoolId', () => {
    const p = player('pool-a');
    const out = breakoutCandidates({
      poolPlayers: [p],
      weeklyPoints: { 'yh-1': breakoutSeries },
      platformIdByPoolId: new Map([['pool-a', 'yh-1']]),
      currentWeek: 9,
    });
    expect(out).toHaveLength(1);
    expect(out[0].player.id).toBe('pool-a');
  });

  it('ranks by recent average, then surge', () => {
    const out = breakoutCandidates(
      input({
        low: { '1': 8, '2': 8, '3': 8, '4': 8, '5': 8, '6': 13, '7': 13, '8': 13 },
        high: breakoutSeries,
      }),
    );
    expect(out.map(c => c.player.id)).toEqual(['high', 'low']);
  });

  it('caps at MAX_BREAKOUTS', () => {
    const points: Record<string, Record<number, number>> = {};
    for (let i = 0; i < MAX_BREAKOUTS + 4; i++) {
      points[`p${i}`] = breakoutSeries;
    }
    const out = breakoutCandidates(input(points));
    expect(out).toHaveLength(MAX_BREAKOUTS);
  });

  it('skips K/DST and a zero baseline', () => {
    const k = player('k', 'K');
    const z = player('z');
    const out = breakoutCandidates({
      poolPlayers: [k, z],
      weeklyPoints: {
        k: breakoutSeries,
        z: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 18, '7': 16, '8': 20 },
      },
      currentWeek: 9,
    });
    expect(out).toHaveLength(0);
  });

  it('names the owning team in league mode', () => {
    const p = player('a');
    const out = breakoutCandidates({
      poolPlayers: [p, player('b')],
      weeklyPoints: { a: breakoutSeries, b: breakoutSeries },
      teamByPoolId: new Map([['b', 'Rivals']]),
      currentWeek: 9,
    });
    expect(out).toHaveLength(1);
    expect(out[0].rosteredBy).toBeNull();
    expect(out[0].reasons[0]).toContain('3.5x');
  });

  it('exposes the tuning constants for the footnote', () => {
    expect(BASELINE_MIN_GAMES).toBe(3);
    expect(RECENT_MIN_GAMES).toBe(2);
    expect(RECENT_FLOOR).toBe(12);
    expect(SURGE_RATIO).toBe(1.6);
  });
});
