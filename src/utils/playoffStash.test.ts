import { describe, expect, it } from 'vitest';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { AllowedFile, ScheduleFile } from './matchupRating';
import { rankPlayoffStash } from './playoffStash';

const SCHEDULE: ScheduleFile = {
  season: 2026,
  weeks: {
    '15': [
      ['DAL', 'PHI'],
      ['KC', 'NYG'],
    ],
    '16': [
      ['DAL', 'NYG'],
      ['KC', 'PHI'],
    ],
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
  },
  generatedAt: 't',
};

function player(
  overrides: Partial<PoolPlayer> & { id: string; name: string },
): PoolPlayer {
  return {
    team: 'DAL',
    pos: 'RB',
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: null,
    baseValue: null,
    ...overrides,
  } as PoolPlayer;
}

const POOL: DraftPoolFile = {
  players: [
    player({ id: 'dal-rb', name: 'Dal Back' }),
    player({ id: 'kc-rb', name: 'Kc Back', team: 'KC' }),
    player({ id: 'dal-wr', name: 'Dal Wide', pos: 'WR' }),
    player({ id: 'dal-k', name: 'Dal Kicker', pos: 'K' }),
  ],
} as DraftPoolFile;

describe('rankPlayoffStash', () => {
  it('ranks softest playoff slate first (DAL WR faces PHI/NYG/PHI: avg rank 9.0)', () => {
    const rows = rankPlayoffStash(POOL, new Set(), [15, 16, 17], 10, SCHEDULE, ALLOWED);
    expect(rows.map(r => r.player.id)).toEqual(['dal-wr', 'dal-rb', 'kc-rb']);
    expect(rows[0].strength.avgRank).toBeCloseTo((1 + 25 + 1) / 3);
    expect(rows[0].strength.games).toHaveLength(3);
  });

  it('excludes rostered players and K/DST', () => {
    const rows = rankPlayoffStash(
      POOL,
      new Set(['dal-rb']),
      [15, 16, 17],
      10,
      SCHEDULE,
      ALLOWED,
    );
    expect(rows.map(r => r.player.id)).toEqual(['dal-wr', 'kc-rb']);
    expect(rows[0].player.id).toBe('dal-wr');
  });

  it('respects the limit and drops players with no playoff-week allowed data', () => {
    const pool = {
      players: [player({ id: 'no-data', name: 'No Data', team: 'BUF' })],
    } as DraftPoolFile;
    expect(rankPlayoffStash(pool, new Set(), [15, 16, 17], 10, SCHEDULE, ALLOWED)).toEqual(
      [],
    );
    const rows = rankPlayoffStash(POOL, new Set(), [15, 16, 17], 1, SCHEDULE, ALLOWED);
    expect(rows).toHaveLength(1);
    expect(rows[0].player.id).toBe('dal-wr');
  });

  it('returns empty for an empty playoff window', () => {
    expect(rankPlayoffStash(POOL, new Set(), [], 10, SCHEDULE, ALLOWED)).toEqual([]);
  });
});
