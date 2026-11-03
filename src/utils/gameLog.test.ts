// Game log (backlog item 112): opponent + points per completed week.

import { describe, expect, it } from 'vitest';
import type { ScheduleFile } from './matchupRating';
import { buildGameLog } from './gameLog';

function schedule(weeks: Record<string, Array<[string, string]>>): ScheduleFile {
  return { season: 2026, weeks, generatedAt: 'test' };
}

const SCHEDULE = schedule({
  '1': [['SEA', 'NE']],
  '2': [['LAR', 'SF']],
  '3': [['SEA', 'LAR']],
});

describe('buildGameLog', () => {
  it('resolves the opponent home and away, and passes points through', () => {
    const rows = buildGameLog('SEA', { 1: 24.5, 3: 12 }, 3, SCHEDULE);
    expect(rows).toEqual([
      { week: 1, opponent: 'NE', points: 24.5 },
      { week: 2, opponent: null, points: null },
      { week: 3, opponent: 'LAR', points: 12 },
    ]);
  });

  it('marks a bye week (no game) with a null opponent', () => {
    const rows = buildGameLog('NE', { 1: 18 }, 2, SCHEDULE);
    expect(rows[1]).toEqual({ week: 2, opponent: null, points: null });
  });

  it('marks a played week with no recorded points as null, not zero', () => {
    const rows = buildGameLog('SEA', { 1: 24.5 }, 3, SCHEDULE);
    // Week 3 has a game (vs LAR) but no entry in the weekly series.
    expect(rows[2]).toEqual({ week: 3, opponent: 'LAR', points: null });
  });

  it('returns [] without a team, a series, or a positive week range', () => {
    expect(buildGameLog(null, { 1: 10 }, 1, SCHEDULE)).toEqual([]);
    expect(buildGameLog('SEA', undefined, 1, SCHEDULE)).toEqual([]);
    expect(buildGameLog('SEA', { 1: 10 }, 0, SCHEDULE)).toEqual([]);
  });
});
