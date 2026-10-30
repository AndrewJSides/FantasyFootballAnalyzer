// Consistency ratings engine (backlog item 20).
import { describe, it, expect } from 'vitest';
import { boomBustBars, consistencySummary } from './consistency';

describe('boomBustBars', () => {
  it('uses TraderApe-own per-position bars', () => {
    expect(boomBustBars('QB')).toEqual({ boomBar: 25, bustBar: 13 });
    expect(boomBustBars('RB')).toEqual({ boomBar: 20, bustBar: 7 });
    expect(boomBustBars('WR')).toEqual({ boomBar: 20, bustBar: 7 });
    expect(boomBustBars('TE')).toEqual({ boomBar: 15, bustBar: 5 });
  });

  it('falls back for unknown positions', () => {
    expect(boomBustBars(undefined)).toEqual({ boomBar: 20, bustBar: 7 });
    expect(boomBustBars('K')).toEqual({ boomBar: 20, bustBar: 7 });
  });
});

describe('consistencySummary', () => {
  it('returns null without enough games', () => {
    expect(consistencySummary(undefined, 'RB')).toBeNull();
    expect(consistencySummary({ 1: 10, 2: 12 }, 'RB')).toBeNull();
  });

  it('computes nearest-rank floor/median/ceiling on played weeks', () => {
    // 8 played weeks: sorted 4,6,8,10,12,14,16,18
    const weekly = { 1: 12, 2: 4, 3: 18, 4: 6, 5: 14, 6: 8, 7: 16, 8: 10 };
    const s = consistencySummary(weekly, 'RB');
    expect(s).not.toBeNull();
    expect(s!.games).toBe(8);
    expect(s!.floor).toBe(6); // ceil(0.25*8)=2 -> index 1
    expect(s!.median).toBe(10); // ceil(0.5*8)=4 -> index 3
    expect(s!.ceiling).toBe(14); // ceil(0.75*8)=6 -> index 5
  });

  it('counts boom and bust weeks against the position bars', () => {
    const weekly = { 1: 24, 2: 5, 3: 12, 4: 21, 5: 3, 6: 10 };
    const s = consistencySummary(weekly, 'RB');
    expect(s!.boomWeeks).toBe(2); // 24, 21 >= 20
    expect(s!.bustWeeks).toBe(2); // 5, 3 <= 7
  });

  it('calls a metronome Steady and a rollercoaster Volatile', () => {
    const steady = consistencySummary(
      { 1: 12, 2: 13, 3: 12, 4: 14, 5: 13, 6: 12 },
      'WR',
    );
    expect(steady!.verdict).toBe('Steady');
    const wild = consistencySummary(
      { 1: 2, 2: 25, 3: 5, 4: 30, 5: 4, 6: 28 },
      'WR',
    );
    expect(wild!.verdict).toBe('Volatile');
  });

  it('treats missing/bye weeks as unplayed, not busts', () => {
    // Bye week 3 is simply absent from the map; DNPs recorded as null are
    // filtered the same way the chart treats them.
    const weekly = { 1: 20, 2: 22, 4: 21 } as Record<number, number>;
    const s = consistencySummary(weekly, 'RB');
    expect(s!.games).toBe(3);
    expect(s!.bustWeeks).toBe(0);
  });
});
