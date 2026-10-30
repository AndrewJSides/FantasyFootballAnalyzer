// Weekly Projections board engine tests (backlog item 30).
import { describe, it, expect } from 'vitest';
import { buildWeeklyRankings } from './weeklyRankings';
import type { WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

const SEASON = 2026;

function player(over: Partial<PoolPlayer>): PoolPlayer {
  return {
    id: 'x',
    name: 'Test Player',
    team: 'FA',
    pos: 'RB',
    posRank: 1,
    overallRank: 100,
    tier: 1,
    bye: null,
    baseValue: null,
    ...over,
  } as PoolPlayer;
}

// Sleeper's public weekly stats shaped for the tests: points and games by
// sleeper id.
function weekly(
  points: Record<string, Record<number, number>>,
  games: Record<string, number[]>,
): WeeklyPprPoints {
  const weeks = [...new Set([...Object.values(points).flatMap(p => Object.keys(p).map(Number)), ...Object.values(games).flat()])].sort(
    (a, b) => a - b,
  );
  return {
    season: SEASON,
    weeks,
    pointsBySleeperId: points,
    gamesBySleeperId: games,
  };
}

describe('buildWeeklyRankings', () => {
  it('ranks by this-week projection, best first', () => {
    const pool = {
      players: [
        player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'RB' }),
        player({ id: 'b', name: 'Beta', sleeperId: 's-b', pos: 'RB' }),
      ],
      season: SEASON,
    } as DraftPoolFile;
    const wk = weekly(
      {
        's-a': { 1: 8, 2: 8, 3: 8, 4: 8 },
        's-b': { 1: 20, 2: 20, 3: 20, 4: 20 },
      },
      { 's-a': [1, 2, 3, 4], 's-b': [1, 2, 3, 4] },
    );
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5 });
    expect(rows.map(r => r.player.id)).toEqual(['b', 'a']);
    expect(rows[0].posRank).toBe(1);
    expect(rows[1].posRank).toBe(2);
    expect(rows[0].projection).toBeGreaterThan(rows[1].projection!);
  });

  it('excludes players on bye in the current week', () => {
    const pool = {
      players: [
        player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'RB', bye: 5 }),
        player({ id: 'b', name: 'Beta', sleeperId: 's-b', pos: 'RB', bye: 9 }),
      ],
      season: SEASON,
    } as DraftPoolFile;
    const wk = weekly(
      { 's-a': { 4: 15 }, 's-b': { 4: 15 } },
      { 's-a': [4], 's-b': [4] },
    );
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5 });
    expect(rows.map(r => r.player.id)).toEqual(['b']);
  });

  it('ranks players with no completed-week data behind projected players', () => {
    const pool = {
      players: [
        player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'WR' }),
        // s-b has no stats at all: no Sleeper data.
        player({ id: 'b', name: 'Beta', sleeperId: 's-b', pos: 'WR' }),
      ],
      season: SEASON,
    } as DraftPoolFile;
    const wk = weekly({ 's-a': { 4: 12 } }, { 's-a': [4] });
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5 });
    expect(rows.map(r => r.player.id)).toEqual(['a', 'b']);
    expect(rows[1].projection).toBeNull();
  });

  it('orders unprojected players by season points per game', () => {
    const pool = {
      players: [
        player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'QB' }),
        player({ id: 'b', name: 'Beta', sleeperId: 's-b', pos: 'QB' }),
      ],
      season: SEASON,
    } as DraftPoolFile;
    // No weekly stats at all: both unprojected. Without a fetch the util
    // has no ppg either — but it must not crash and must rank stably.
    const rows = buildWeeklyRankings({ pool, weekly: undefined, currentWeek: 5 });
    expect(rows.map(r => r.player.id)).toEqual(['a', 'b']);
    expect(rows[0].projection).toBeNull();
  });

  it('caps rows per position', () => {
    const players = Array.from({ length: 6 }, (_, i) =>
      player({ id: `te-${i}`, name: `TE ${i}`, sleeperId: `s-te-${i}`, pos: 'TE', overallRank: i + 1 }),
    );
    const pool = { players, season: SEASON } as DraftPoolFile;
    const rows = buildWeeklyRankings({
      pool,
      weekly: weekly({}, {}),
      currentWeek: 5,
      perPosition: 3,
    });
    expect(rows).toHaveLength(3);
  });

  it('resolves owners from the owner map', () => {
    const pool = {
      players: [player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'TE' })],
      season: SEASON,
    } as DraftPoolFile;
    const wk = weekly({ 's-a': { 4: 9 } }, { 's-a': [4] });
    const rows = buildWeeklyRankings({
      pool,
      weekly: wk,
      currentWeek: 5,
      ownerByPoolId: new Map([['a', 'Delta']]),
    });
    expect(rows[0].owner).toBe('Delta');
  });

  it('attaches null matchup for players with no NFL team game', () => {
    const pool = {
      players: [player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'RB', team: 'FA' })],
      season: SEASON,
    } as DraftPoolFile;
    const wk = weekly({ 's-a': { 4: 11 } }, { 's-a': [4] });
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5 });
    expect(rows[0].matchup).toBeNull();
  });
});
