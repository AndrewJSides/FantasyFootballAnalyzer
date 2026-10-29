import { describe, expect, it } from 'vitest';
import {
  remainingOpponents,
  rosMatchupStrength,
  rosShort,
  type AllowedFile,
  type ScheduleFile,
} from './rosSchedule';

const SCHEDULE: ScheduleFile = {
  season: 2026,
  weeks: {
    '8': [['DAL', 'PHI'], ['KC', 'DEN']],
    '9': [['DAL', 'NYG']],
    '10': [['PHI', 'NYG']],
  },
  generatedAt: 't',
};

const ALLOWED: AllowedFile = {
  season: 2026,
  weeks: [1, 7],
  teams: {
    PHI: { RB: { avg: 24.1, rank: 3 }, WR: { avg: 40.0, rank: 1 } },
    NYG: { RB: { avg: 12.2, rank: 28 }, WR: { avg: 20.0, rank: 25 } },
    DAL: { RB: { avg: 20.0, rank: 10 }, WR: { avg: 30.0, rank: 12 } },
  },
  generatedAt: 't',
};

describe('remainingOpponents', () => {
  it('lists games from fromWeek onward and skips bye weeks', () => {
    const games = remainingOpponents('DAL', 8, SCHEDULE);
    expect(games).toEqual([
      { week: 8, opponent: 'PHI' },
      { week: 9, opponent: 'NYG' },
    ]);
  });

  it('returns empty for a team with no games left or a null team', () => {
    expect(remainingOpponents('KC', 11, SCHEDULE)).toEqual([]);
    expect(remainingOpponents(null, 8, SCHEDULE)).toEqual([]);
  });
});

describe('rosMatchupStrength', () => {
  it('averages opponent ranks over the remaining schedule', () => {
    // DAL RB: W8 vs PHI (rank 3), W9 vs NYG (rank 28) → avg 15.5 → neutral
    const s = rosMatchupStrength('DAL', 'RB', 8, SCHEDULE, ALLOWED);
    expect(s?.avgRank).toBeCloseTo(15.5);
    expect(s?.label).toBe('neutral');
    expect(s?.games).toHaveLength(2);
  });

  it('labels a soft slate favorable', () => {
    const s = rosMatchupStrength('DAL', 'WR', 8, SCHEDULE, ALLOWED);
    // W8 vs PHI (rank 1), W9 vs NYG (rank 25) → avg 13 → still neutral...
    // so test the one-game soft slate from week 9 instead.
    expect(s?.avgRank).toBeCloseTo(13);
    const soft = rosMatchupStrength('NYG', 'WR', 10, SCHEDULE, ALLOWED);
    expect(soft?.games).toEqual([
      { week: 10, opponent: 'PHI', avgAllowed: 40.0, rank: 1 },
    ]);
    expect(soft?.label).toBe('favorable');
  });

  it('labels a hard slate tough', () => {
    const s = rosMatchupStrength('DAL', 'WR', 9, SCHEDULE, ALLOWED);
    expect(s?.avgRank).toBeCloseTo(25);
    expect(s?.label).toBe('tough');
  });

  it('returns null for K/DST, unknown positions, and teams with no data', () => {
    expect(rosMatchupStrength('DAL', 'K', 8, SCHEDULE, ALLOWED)).toBeNull();
    expect(rosMatchupStrength('DAL', 'WR', 11, SCHEDULE, ALLOWED)).toBeNull();
    expect(rosMatchupStrength('KC', 'WR', 8, SCHEDULE, ALLOWED)).toBeNull();
  });
});

describe('rosShort', () => {
  it('renders a compact verdict + average rank', () => {
    const s = rosMatchupStrength('DAL', 'RB', 8, SCHEDULE, ALLOWED);
    expect(s && rosShort(s)).toBe('Avg (15.5)');
    const soft = rosMatchupStrength('NYG', 'WR', 10, SCHEDULE, ALLOWED);
    expect(soft && rosShort(soft)).toBe('Soft (1.0)');
  });
});
