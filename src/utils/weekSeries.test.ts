// weekSeries (backlog item 8): pure series-shaping logic behind the player
// value-over-time chart.

import { describe, it, expect } from 'vitest';
import { buildWeekSeries, summarizeWeekSeries } from './weekSeries';

describe('buildWeekSeries', () => {
  it('fills gaps with null and stops at the max recorded week', () => {
    const s = buildWeekSeries({ 1: 12.5, 3: 20, 5: 8 });
    expect(s.map(w => w.week)).toEqual([1, 2, 3, 4, 5]);
    expect(s[1].points).toBeNull();
    expect(s[2].points).toBe(20);
  });

  it('ignores non-numeric entries', () => {
    const s = buildWeekSeries({ 1: 10, 2: Number.NaN });
    expect(s[1].points).toBeNull();
  });

  it('returns empty for no data', () => {
    expect(buildWeekSeries({})).toEqual([]);
  });
});

describe('summarizeWeekSeries', () => {
  it('counts games, finds the best week, and averages', () => {
    const st = summarizeWeekSeries([
      { week: 1, points: 10 },
      { week: 2, points: null },
      { week: 3, points: 30 },
    ]);
    expect(st.games).toBe(2);
    expect(st.bestWeek).toBe(3);
    expect(st.bestPoints).toBe(30);
    expect(st.average).toBeCloseTo(20);
  });
});
