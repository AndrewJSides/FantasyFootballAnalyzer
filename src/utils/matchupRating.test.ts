import { describe, expect, it } from 'vitest';
import {
  getMatchupRating,
  leagueAvgAllowed,
  matchupLabel,
  matchupShort,
  type AllowedFile,
  type ScheduleFile,
} from './matchupRating';

const schedule: ScheduleFile = {
  season: 2026,
  weeks: {
    '8': [
      ['GB', 'CAR'],
      ['BUF', 'BAL'],
    ],
    '9': [['KC', 'DEN']],
  },
  generatedAt: 't',
};

const allowed: AllowedFile = {
  season: 2026,
  weeks: [1, 7],
  teams: {
    CAR: { RB: { avg: 28.4, rank: 2 }, WR: { avg: 30.0, rank: 8 } },
    BAL: { RB: { avg: 16.1, rank: 31 }, QB: { avg: 12.0, rank: 24 } },
    DEN: { TE: { avg: 22.0, rank: 15 } },
  },
  generatedAt: 't',
};

describe('getMatchupRating', () => {
  it('finds the opponent and the allowed-vs-position entry', () => {
    const r = getMatchupRating('GB', 'RB', 8, schedule, allowed);
    expect(r).toMatchObject({ opponent: 'CAR', avgAllowed: 28.4, rank: 2, label: 'favorable' });
  });

  it('returns null when the opponent has no entry', () => {
    // CAR's week-8 opponent GB has no allowed entry in the fixture.
    expect(getMatchupRating('CAR', 'WR', 8, schedule, allowed)).toBeNull();
  });

  it('labels a stingy defense tough', () => {
    const r = getMatchupRating('BUF', 'RB', 8, schedule, allowed);
    expect(r).toMatchObject({ opponent: 'BAL', label: 'tough', rank: 31 });
  });

  it('labels a mid-pack defense neutral', () => {
    const r = getMatchupRating('KC', 'TE', 9, schedule, allowed);
    expect(r).toMatchObject({ opponent: 'DEN', label: 'neutral', rank: 15 });
  });

  it('returns null for kickers, defenses, and missing data', () => {
    expect(getMatchupRating('GB', 'K', 8, schedule, allowed)).toBeNull();
    expect(getMatchupRating('GB', 'DEF', 8, schedule, allowed)).toBeNull();
    // BAL has no WR entry in the fixture.
    expect(getMatchupRating('BUF', 'WR', 8, schedule, allowed)).toBeNull();
    // No week-10 schedule in the fixture.
    expect(getMatchupRating('GB', 'RB', 10, schedule, allowed)).toBeNull();
    expect(getMatchupRating(null, 'RB', 8, schedule, allowed)).toBeNull();
    expect(getMatchupRating('GB', 'RB', undefined, schedule, allowed)).toBeNull();
  });
});

describe('labels', () => {
  it('renders the full accessible label', () => {
    const r = getMatchupRating('GB', 'RB', 8, schedule, allowed)!;
    expect(matchupLabel(r, 'RB')).toBe(
      'vs CAR · Favorable — CAR allows 28.4 pts/game to RBs (2nd-most points)',
    );
  });

  it('renders rank 1 as "the most"', () => {
    expect(
      matchupLabel({ opponent: 'X', avgAllowed: 30, rank: 1, label: 'favorable' }, 'QB'),
    ).toContain('(the most points)');
  });

  it('renders the compact cell text', () => {
    const r = getMatchupRating('BUF', 'QB', 8, schedule, allowed)!;
    expect(matchupShort(r)).toBe('vs BAL · Tough');
  });
});

describe('leagueAvgAllowed', () => {
  it('returns a finite league average for each skill position', () => {
    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
      const avg = leagueAvgAllowed(pos);
      expect(avg).toBeGreaterThan(0);
      expect(Number.isFinite(avg)).toBe(true);
    }
  });

  it('returns null for non-skill or missing positions', () => {
    expect(leagueAvgAllowed('K')).toBeNull();
    expect(leagueAvgAllowed(null)).toBeNull();
    expect(leagueAvgAllowed(undefined)).toBeNull();
  });
});
