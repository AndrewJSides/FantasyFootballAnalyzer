// teamPlayoffSOS: per-team fantasy-playoff schedule softness.

import { describe, expect, it } from 'vitest';
import type { League, Player, Team } from '@/types';
import type { AllowedFile, ScheduleFile } from './matchupRating';
import { buildTeamPlayoffSOS } from './teamPlayoffSOS';

const PLAYOFF_SCHEDULE: ScheduleFile = {
  season: 2026,
  weeks: {
    // KC and DAL draw the soft PHI slate all three weeks; SF draws tough NYG.
    '15': [['KC', 'PHI'], ['SF', 'NYG'], ['DAL', 'PHI']],
    '16': [['KC', 'PHI'], ['SF', 'NYG'], ['DAL', 'PHI']],
    '17': [['KC', 'PHI'], ['SF', 'NYG'], ['DAL', 'PHI']],
  },
  generatedAt: 't',
};

// Same shape as the full window but W16 flips to the opposite slate, so the
// weeks override is observable.
const W16_FLIPPED: ScheduleFile = {
  season: 2026,
  weeks: {
    '15': [['KC', 'PHI'], ['SF', 'NYG'], ['DAL', 'PHI']],
    '16': [['KC', 'NYG'], ['SF', 'PHI'], ['DAL', 'NYG']],
    '17': [['KC', 'PHI'], ['SF', 'NYG'], ['DAL', 'PHI']],
  },
  generatedAt: 't',
};

const ALLOWED: AllowedFile = {
  season: 2026,
  weeks: [1, 7],
  teams: {
    PHI: {
      QB: { avg: 21.0, rank: 2 },
      RB: { avg: 24.0, rank: 3 },
      WR: { avg: 40.0, rank: 1 },
      TE: { avg: 18.0, rank: 2 },
    },
    NYG: {
      QB: { avg: 12.0, rank: 30 },
      RB: { avg: 12.5, rank: 28 },
      WR: { avg: 20.0, rank: 25 },
      TE: { avg: 10.0, rank: 30 },
    },
  },
  generatedAt: 't',
};

function player(id: string, name: string, position: string, nflTeam: string): Player {
  return { id, platformId: id, name, position, team: nflTeam } as Player;
}

function steady(pts: number): Record<number, number> {
  const w: Record<number, number> = {};
  for (let week = 1; week <= 7; week++) w[week] = pts;
  return w;
}

// Team A: soft playoff slate (KC QB + DAL RB vs PHI). Team B: tough slate
// (SF QB + SF RB vs NYG). Team C: empty roster, omitted. K/DST ride along
// on team A to prove they're excluded from the average.
function league(overrides: Partial<League> = {}): League {
  const aRoster = [
    player('a-qb', 'A Quarterback', 'QB', 'KC'),
    player('a-rb', 'A Runner', 'RB', 'DAL'),
    player('a-k', 'A Kicker', 'K', 'KC'),
    player('a-dst', 'A Defense', 'D/ST', 'KC'),
  ];
  const bRoster = [
    player('b-qb', 'B Quarterback', 'QB', 'SF'),
    player('b-rb', 'B Runner', 'RB', 'SF'),
  ];
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    season: 2026,
    scoringType: 'ppr',
    totalTeams: 3,
    isLoaded: true,
    status: 'live',
    currentWeek: 8,
    teams: [
      { id: 'A', name: 'Alpha', roster: aRoster } as Team,
      { id: 'B', name: 'Beta', roster: bRoster } as Team,
      { id: 'C', name: 'Gamma', roster: [] } as Team,
    ],
    playerWeeklyPoints: {
      'a-qb': steady(20),
      'a-rb': steady(12),
      'a-k': steady(8),
      'a-dst': steady(7),
      'b-qb': steady(20),
      'b-rb': steady(12),
    },
    ...overrides,
  } as League;
}

describe('buildTeamPlayoffSOS', () => {
  it('ranks the softest playoff schedule first with the right averages and labels', () => {
    const rows = buildTeamPlayoffSOS({
      league: league(),
      schedule: PLAYOFF_SCHEDULE,
      allowed: ALLOWED,
    });
    expect(rows).toHaveLength(2);
    const [a, b] = rows!;
    // Team A: KC QB vs PHI (rank 2 x3), DAL RB vs PHI (rank 3 x3) → 2.5.
    expect(a.teamId).toBe('A');
    expect(a.avgRank).toBeCloseTo(2.5);
    expect(a.label).toBe('favorable');
    expect(a.rank).toBe(1);
    expect(a.starters).toBe(2);
    // Team B: SF QB vs NYG (rank 30 x3), SF RB vs NYG (rank 28 x3) → 29.
    expect(b.teamId).toBe('B');
    expect(b.avgRank).toBeCloseTo(29);
    expect(b.label).toBe('tough');
    expect(b.rank).toBe(2);
    expect(b.starters).toBe(2);
  });

  it('excludes K and D/ST starters from the average', () => {
    const rows = buildTeamPlayoffSOS({
      league: league(),
      schedule: PLAYOFF_SCHEDULE,
      allowed: ALLOWED,
    });
    // Team A starts a K and a D/ST too, but only the QB+RB price the row.
    expect(rows![0].starters).toBe(2);
    expect(rows![0].avgRank).toBeCloseTo(2.5);
  });

  it('omits teams with no pricable starters and returns undefined when none qualify', () => {
    // Team C's empty roster is already omitted above.
    const rows = buildTeamPlayoffSOS({
      league: league(),
      schedule: PLAYOFF_SCHEDULE,
      allowed: ALLOWED,
    });
    expect(rows!.map(r => r.teamId)).toEqual(['A', 'B']);
    // A kickers-only roster prices no starter either.
    const kickersOnly = league({
      teams: [{ id: 'K', name: 'Kickers', roster: [player('k1', 'K One', 'K', 'KC')] } as Team],
      playerWeeklyPoints: { k1: steady(8) },
    });
    expect(
      buildTeamPlayoffSOS({ league: kickersOnly, schedule: PLAYOFF_SCHEDULE, allowed: ALLOWED }),
    ).toBeUndefined();
  });

  it('returns undefined for non-live leagues and missing current week', () => {
    expect(
      buildTeamPlayoffSOS({
        league: league({ status: 'archived' }),
        schedule: PLAYOFF_SCHEDULE,
        allowed: ALLOWED,
      }),
    ).toBeUndefined();
    expect(
      buildTeamPlayoffSOS({
        league: league({ currentWeek: undefined }),
        schedule: PLAYOFF_SCHEDULE,
        allowed: ALLOWED,
      }),
    ).toBeUndefined();
  });

  it('honors an explicit weeks override', () => {
    // W16 flipped: KC QB draws NYG (30) and DAL RB draws NYG (28) → 29.
    const rows = buildTeamPlayoffSOS({
      league: league(),
      weeks: [16],
      schedule: W16_FLIPPED,
      allowed: ALLOWED,
    });
    const a = rows!.find(r => r.teamId === 'A')!;
    expect(a.avgRank).toBeCloseTo(29);
    expect(a.label).toBe('tough');
  });
});
