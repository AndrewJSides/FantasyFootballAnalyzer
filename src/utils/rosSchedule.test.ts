import { describe, expect, it } from 'vitest';
import {
  playoffScheduleStrength,
  playoffWeeksForLeague,
  remainingOpponents,
  rosLabel,
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

// Weeks 15–17 only, for the playoff-window tests (kept separate so the
// weeks 8–10 mocks above stay exact for the ROS window tests).
const PLAYOFF_SCHEDULE: ScheduleFile = {
  season: 2026,
  weeks: {
    '15': [['DAL', 'PHI']],
    '16': [['DAL', 'NYG']],
    '17': [['DAL', 'PHI']],
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

describe('playoffWeeksForLeague', () => {
  it('defaults to weeks 15-17 without a playoff start week', () => {
    expect(playoffWeeksForLeague()).toEqual([15, 16, 17]);
    expect(playoffWeeksForLeague(null)).toEqual([15, 16, 17]);
  });

  it('shifts to the league playoff start week and clips at week 18', () => {
    expect(playoffWeeksForLeague(14)).toEqual([14, 15, 16]);
    expect(playoffWeeksForLeague(17)).toEqual([17, 18]);
  });
});

describe('playoffScheduleStrength', () => {
  it('averages opponent ranks over the playoff weeks only', () => {
    // DAL RB: W15 vs PHI (rank 3), W16 vs NYG (rank 28), W17 vs PHI (rank 3)
    // → avg 34/3 ≈ 11.33 → neutral
    const s = playoffScheduleStrength('DAL', 'RB', [15, 16, 17], PLAYOFF_SCHEDULE, ALLOWED);
    expect(s?.games).toEqual([
      { week: 15, opponent: 'PHI', avgAllowed: 24.1, rank: 3 },
      { week: 16, opponent: 'NYG', avgAllowed: 12.2, rank: 28 },
      { week: 17, opponent: 'PHI', avgAllowed: 24.1, rank: 3 },
    ]);
    expect(s?.avgRank).toBeCloseTo(11.333, 3);
    expect(s?.label).toBe('neutral');
  });

  it('returns null for empty weeks, K/DST, and teams with no playoff data', () => {
    expect(playoffScheduleStrength('DAL', 'RB', [], SCHEDULE, ALLOWED)).toBeNull();
    expect(playoffScheduleStrength('DAL', 'RB', null, PLAYOFF_SCHEDULE, ALLOWED)).toBeNull();
    expect(playoffScheduleStrength('DAL', 'K', [15, 16, 17], PLAYOFF_SCHEDULE, ALLOWED)).toBeNull();
    expect(playoffScheduleStrength('KC', 'RB', [15, 16, 17], PLAYOFF_SCHEDULE, ALLOWED)).toBeNull();
  });
});

describe('rosLabel playoff variant', () => {
  it('names the playoff window instead of the rest of season', () => {
    const s = playoffScheduleStrength('DAL', 'RB', [15, 16, 17], PLAYOFF_SCHEDULE, ALLOWED);
    expect(s && rosLabel(s, 'RB', [15, 16, 17])).toContain('Fantasy playoffs (W15–W17)');
    expect(s && rosLabel(s, 'RB', [15, 16, 17])).toContain('playoff opponents');
    expect(s && rosLabel(s, 'RB')).toContain('Rest of season');
  });
});
