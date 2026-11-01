import { describe, expect, it } from 'vitest';
import { upcomingMatchupChips } from './upcomingMatchups';
import type { AllowedFile, ScheduleFile } from './matchupRating';

const schedule: ScheduleFile = {
  season: 2026,
  weeks: {
    '8': [['GB', 'CAR']],
    '9': [['GB', 'DET']], // DET has no allowed entry — this week must not appear
    '10': [['GB', 'BAL']],
    '11': [['GB', 'DEN']],
    '12': [['GB', 'SF']], // SF has no allowed entry — must not appear
  },
  generatedAt: 't',
};

const allowed: AllowedFile = {
  season: 2026,
  weeks: [1, 7],
  teams: {
    CAR: { RB: { avg: 28.4, rank: 2 } },
    BAL: { RB: { avg: 16.1, rank: 31 } },
    DEN: { RB: { avg: 22.0, rank: 15 } },
  },
  generatedAt: 't',
};

describe('upcomingMatchupChips', () => {
  it('returns the next 3 rated played weeks after the current week', () => {
    const chips = upcomingMatchupChips('GB', 'RB', 8, 3, schedule, allowed);
    expect(chips.map(c => c.week)).toEqual([10, 11]);
    // Weeks 9 and 12 have no allowed entry for the opponent, so only two
    // rated weeks exist inside the window.
    expect(chips[0]).toMatchObject({
      week: 10,
      opponent: 'BAL',
      rating: { label: 'tough' },
    });
    expect(chips[1]).toMatchObject({
      week: 11,
      opponent: 'DEN',
      rating: { label: 'neutral' },
    });
  });

  it('excludes the current week itself', () => {
    const chips = upcomingMatchupChips('GB', 'RB', 8, 1, schedule, allowed);
    expect(chips.map(c => c.week)).toEqual([10]);
  });

  it('skips bye weeks and returns an exact count when enough games exist', () => {
    const byeSchedule: ScheduleFile = {
      season: 2026,
      weeks: {
        // GB has no game in week 9 (its bye): a null-rated entry the filter skips.
        '10': [['GB', 'BAL']],
        '11': [['GB', 'DEN']],
        '12': [['GB', 'CAR']],
      },
      generatedAt: 't',
    };
    const chips = upcomingMatchupChips('GB', 'RB', 8, 3, byeSchedule, allowed);
    expect(chips.map(c => c.week)).toEqual([10, 11, 12]);
  });

  it('returns nothing for unknown teams or positions the rating ignores', () => {
    expect(upcomingMatchupChips(null, 'RB', 8, 3, schedule, allowed)).toEqual([]);
    expect(upcomingMatchupChips('GB', 'K', 8, 3, schedule, allowed)).toEqual([]);
    expect(upcomingMatchupChips('GB', 'RB', NaN, 3, schedule, allowed)).toEqual([]);
  });
});
