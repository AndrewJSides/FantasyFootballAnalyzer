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

  it('attaches a consistency verdict from completed weeks', () => {
    const pool = {
      players: [player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'RB' })],
      season: SEASON,
    } as DraftPoolFile;
    const wk = weekly(
      { 's-a': { 1: 4, 2: 5, 3: 22, 4: 3 } },
      { 's-a': [1, 2, 3, 4] },
    );
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5 });
    const c = rows[0].consistency;
    expect(c).not.toBeNull();
    // High week-to-week variance: cv well above 0.5 → Volatile.
    expect(c!.verdict).toBe('Volatile');
    expect(c!.games).toBe(4);
    // RB bars are boom ≥ 20 / bust ≤ 7: one boom week (22), three busts.
    expect(c!.boomWeeks).toBe(1);
    expect(c!.bustWeeks).toBe(3);
    expect(c!.floor).toBe(3);
    expect(c!.ceiling).toBe(5);
  });

  it('attaches null consistency under 3 completed games', () => {
    const pool = {
      players: [player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'RB' })],
      season: SEASON,
    } as DraftPoolFile;
    const wk = weekly({ 's-a': { 3: 12, 4: 14 } }, { 's-a': [3, 4] });
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5 });
    expect(rows[0].consistency).toBeNull();
  });

  it('excludes players ruled Out this week even with the best projection', () => {
    const pool = {
      players: [
        player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'RB' }),
        player({
          id: 'b',
          name: 'Beta',
          sleeperId: 's-b',
          pos: 'RB',
          injuryStatus: 'Out',
          injuryBodyPart: 'Knee',
        }),
      ],
      season: SEASON,
    } as DraftPoolFile;
    // Beta outscores Alpha every completed week, but a ruled-out player
    // scores 0 — he must not rank on the frozen projection.
    const wk = weekly(
      {
        's-a': { 1: 8, 2: 8, 3: 8, 4: 8 },
        's-b': { 1: 20, 2: 20, 3: 20, 4: 20 },
      },
      { 's-a': [1, 2, 3, 4], 's-b': [1, 2, 3, 4] },
    );
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5 });
    expect(rows.map(r => r.player.id)).toEqual(['a']);
  });

  it('keeps Questionable players: no invented discount without a practice feed', () => {
    const pool = {
      players: [
        player({
          id: 'a',
          name: 'Alpha',
          sleeperId: 's-a',
          pos: 'RB',
          injuryStatus: 'Questionable',
          injuryBodyPart: 'Hamstring',
        }),
      ],
      season: SEASON,
    } as DraftPoolFile;
    const wk = weekly({ 's-a': { 1: 8, 2: 8, 3: 8, 4: 8 } }, { 's-a': [1, 2, 3, 4] });
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5 });
    expect(rows.map(r => r.player.id)).toEqual(['a']);
    expect(rows[0].projection).toBeCloseTo(8, 0);
  });

  it('excludes IR players ruled out this week', () => {
    const pool = {
      players: [
        player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'RB' }),
        player({
          id: 'b',
          name: 'Beta',
          sleeperId: 's-b',
          pos: 'RB',
          injuryStatus: 'IR',
          injuryBodyPart: 'Knee - ACL',
        }),
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
    expect(rows.map(r => r.player.id)).toEqual(['a']);
  });

  it('folds the sole-back upside into the ranked projection (item 137)', () => {
    const pool = {
      players: [
        player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'RB', team: 'TEN' }),
        player({
          id: 'b',
          name: 'Beta',
          sleeperId: 's-b',
          pos: 'RB',
          team: 'TEN',
          injuryStatus: 'Out',
        }),
      ],
      season: SEASON,
    } as DraftPoolFile;
    const wk = {
      ...weekly(
        { 's-a': { 1: 8, 2: 16, 3: 8, 4: 16 }, 's-b': { 1: 5, 2: 5, 3: 5, 4: 5 } },
        { 's-a': [1, 2, 3, 4], 's-b': [1, 2, 3, 4] },
      ),
      usageBySleeperId: {
        's-a': { 1: 10, 2: 20, 3: 10, 4: 20 },
        's-b': { 1: 6, 2: 6, 3: 6, 4: 6 },
      },
    } as WeeklyPprPoints;
    // Control: Beta healthy, so no vacancy — Alpha's base projection.
    const healthyPool = {
      players: pool.players.map(p =>
        p.id === 'b' ? player({ ...p, injuryStatus: undefined }) : p,
      ),
      season: SEASON,
    } as DraftPoolFile;
    const base = buildWeeklyRankings({ pool: healthyPool, weekly: wk, currentWeek: 5 }).find(
      r => r.player.id === 'a',
    )!;
    // Ruled-out Beta is excluded; Alpha carries the vacancy, and the
    // ranked projection prices it in (base + 4.8).
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5 });
    expect(rows.map(r => r.player.id)).toEqual(['a']);
    expect(rows[0].soleBack).toEqual({ mates: ['Beta'], upside: 4.8 });
    expect(rows[0].projection).toBe(
      Math.round((base.projection! + 4.8) * 10) / 10,
    );
  });

  it('ranks on the folded projection, so a sole back can outrank a higher base (item 137)', () => {
    const pool = {
      players: [
        player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'RB', team: 'TEN' }),
        player({
          id: 'b',
          name: 'Beta',
          sleeperId: 's-b',
          pos: 'RB',
          team: 'TEN',
          injuryStatus: 'Out',
        }),
        // Gamma scores ~1 pt/week more than Alpha on base form, on a team
        // with no vacancy — so he leads on base, and trails once the
        // +4.8 sole-back term is priced in.
        player({ id: 'g', name: 'Gamma', sleeperId: 's-g', pos: 'RB', team: 'KC' }),
      ],
      season: SEASON,
    } as DraftPoolFile;
    const wk = {
      ...weekly(
        {
          's-a': { 1: 8, 2: 16, 3: 8, 4: 16 },
          's-b': { 1: 5, 2: 5, 3: 5, 4: 5 },
          's-g': { 1: 9, 2: 17, 3: 9, 4: 17 },
        },
        { 's-a': [1, 2, 3, 4], 's-b': [1, 2, 3, 4], 's-g': [1, 2, 3, 4] },
      ),
      usageBySleeperId: {
        's-a': { 1: 10, 2: 20, 3: 10, 4: 20 },
        's-b': { 1: 6, 2: 6, 3: 6, 4: 6 },
      },
    } as WeeklyPprPoints;
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5 });
    expect(rows.map(r => r.player.id)).toEqual(['a', 'g']);
    expect(rows[0].posRank).toBe(1);
    expect(rows[0].projection).toBeGreaterThan(rows[1].projection!);
  });

  it('folds the -25% weather downgrade into the ranked projection for a flagged passing game (item 138)', () => {
    const pool = {
      players: [
        player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'WR', team: 'TB' }),
        // Same-team RB in the same flagged game: wet weather favors the
        // run, so his projection is untouched.
        player({ id: 'r', name: 'Runner', sleeperId: 's-r', pos: 'RB', team: 'TB' }),
      ],
      season: SEASON,
    } as DraftPoolFile;
    const wk = weekly(
      { 's-a': { 1: 12, 2: 12, 3: 12, 4: 12 }, 's-r': { 1: 12, 2: 12, 3: 12, 4: 12 } },
      { 's-a': [1, 2, 3, 4], 's-r': [1, 2, 3, 4] },
    );
    const risk = new Map([
      ['TB', { windy: true, wet: true, windMph: 10, gustsMph: 27, precipProb: 88, tempF: 75 }],
    ]);
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5, weatherRisk: risk });
    const wr = rows.find(r => r.player.id === 'a')!;
    expect(wr.projection).toBe(9);
    expect(wr.weatherAdjustment).toBe(-3);
    const rb = rows.find(r => r.player.id === 'r')!;
    expect(rb.projection).toBe(12);
    expect(rb.weatherAdjustment).toBeNull();
  });

  it('leaves the projection unfolded without a weather risk map (item 138)', () => {
    const pool = {
      players: [player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'WR', team: 'TB' })],
      season: SEASON,
    } as DraftPoolFile;
    const wk = weekly(
      { 's-a': { 1: 12, 2: 12, 3: 12, 4: 12 } },
      { 's-a': [1, 2, 3, 4] },
    );
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5 });
    expect(rows[0].projection).toBe(12);
    expect(rows[0].weatherAdjustment).toBeNull();
  });

  it('ranks on the folded projection, so a clear-weather player can outrank a higher base in a flagged game (item 138)', () => {
    const pool = {
      players: [
        // Alpha scores 16/week on base form in the flagged game; Gamma
        // scores 13/week in clear weather — Alpha leads on base, and
        // trails once the -25% term is priced in (12.0 vs 13.0).
        player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'WR', team: 'TB' }),
        player({ id: 'g', name: 'Gamma', sleeperId: 's-g', pos: 'WR', team: 'KC' }),
      ],
      season: SEASON,
    } as DraftPoolFile;
    const wk = weekly(
      { 's-a': { 1: 16, 2: 16, 3: 16, 4: 16 }, 's-g': { 1: 13, 2: 13, 3: 13, 4: 13 } },
      { 's-a': [1, 2, 3, 4], 's-g': [1, 2, 3, 4] },
    );
    const risk = new Map([
      ['TB', { windy: true, wet: true, windMph: 10, gustsMph: 27, precipProb: 88, tempF: 75 }],
    ]);
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5, weatherRisk: risk });
    expect(rows.map(r => r.player.id)).toEqual(['g', 'a']);
    expect(rows[0].posRank).toBe(1);
    expect(rows[1].projection).toBe(12);
    expect(rows[1].weatherAdjustment).toBe(-4);
  });

  it('excludes the in-progress week from the consistency verdict', () => {
    const pool = {
      players: [player({ id: 'a', name: 'Alpha', sleeperId: 's-a', pos: 'RB' })],
      season: SEASON,
    } as DraftPoolFile;
    // Week 5 is in progress (currentWeek 5): the 40-point line there must
    // not turn four steady weeks into a volatile verdict.
    const wk = weekly(
      { 's-a': { 1: 10, 2: 11, 3: 9, 4: 10, 5: 40 } },
      { 's-a': [1, 2, 3, 4, 5] },
    );
    const rows = buildWeeklyRankings({ pool, weekly: wk, currentWeek: 5 });
    const c = rows[0].consistency;
    expect(c).not.toBeNull();
    expect(c!.games).toBe(4);
    expect(c!.verdict).toBe('Steady');
  });
});
