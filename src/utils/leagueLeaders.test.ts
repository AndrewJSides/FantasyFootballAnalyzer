// leagueLeaders util: per-position totals rank on completed weeks only,
// owners resolve, top boom finds the max single week, empty data hides.
import { describe, it, expect } from 'vitest';
import { buildLeagueLeaders } from './leagueLeaders';
import type { WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

function player(id: string, name: string, pos: string): PoolPlayer {
  return {
    id,
    name,
    team: 'FA',
    pos,
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: null,
    baseValue: null,
    sleeperId: `sid-${id}`,
  } as PoolPlayer;
}

function poolOf(players: PoolPlayer[]): DraftPoolFile {
  return {
    season: 2026,
    generatedAt: 't',
    baseline: { budget: 200, teams: 10, rounds: 16 },
    players,
  };
}

function weeklyOf(
  entries: Record<string, Record<number, number>>,
): WeeklyPprPoints {
  const gamesBySleeperId: Record<string, number[]> = {};
  for (const [sid, weeks] of Object.entries(entries)) {
    gamesBySleeperId[sid] = Object.keys(weeks).map(Number);
  }
  return { season: 2026, weeks: [1, 2, 3], pointsBySleeperId: entries, gamesBySleeperId };
}

describe('buildLeagueLeaders', () => {
  it('ranks by total over completed weeks, excluding the current week', () => {
    const a = player('a', 'Alpha', 'RB');
    const b = player('b', 'Beta', 'RB');
    const weekly = weeklyOf({
      'sid-a': { 1: 10, 2: 12, 3: 100 }, // week 3 is current, ignored
      'sid-b': { 1: 20, 2: 25 },
    });
    const out = buildLeagueLeaders({ pool: poolOf([a, b]), weekly, currentWeek: 3 });
    const rb = out!.find(l => l.position === 'RB')!;
    expect(rb.rows.map(r => r.player.id)).toEqual(['b', 'a']);
    expect(rb.rows[0].total).toBe(45);
    expect(rb.rows[0].ppg).toBe(22.5);
    expect(rb.rows[0].games).toBe(2);
    expect(rb.rows[1].total).toBe(22);
  });

  it('records the best single week and the position top boom', () => {
    const a = player('a', 'Alpha', 'WR');
    const b = player('b', 'Beta', 'WR');
    const weekly = weeklyOf({
      'sid-a': { 1: 5, 2: 31 },
      'sid-b': { 1: 12, 2: 14 },
    });
    const out = buildLeagueLeaders({ pool: poolOf([a, b]), weekly, currentWeek: 3 });
    const wr = out!.find(l => l.position === 'WR')!;
    expect(wr.topBoom).toMatchObject({ player: a, week: 2, pts: 31 });
    expect(wr.rows[0].bestWeek).toBe(2);
    expect(wr.rows[0].bestWeekPts).toBe(31);
  });

  it('resolves owners in league mode and omits them in guest mode', () => {
    const a = player('a', 'Alpha', 'QB');
    const weekly = weeklyOf({ 'sid-a': { 1: 25, 2: 27 } });
    const owners = new Map([['a', 'Rivals']]);
    const league = buildLeagueLeaders({
      pool: poolOf([a]),
      weekly,
      currentWeek: 3,
      ownerByPoolId: owners,
    });
    expect(league!.find(l => l.position === 'QB')!.rows[0].owner).toBe('Rivals');

    const unowned = buildLeagueLeaders({
      pool: poolOf([a]),
      weekly,
      currentWeek: 3,
      ownerByPoolId: new Map(),
    });
    expect(unowned!.find(l => l.position === 'QB')!.rows[0].owner).toBeNull();

    const guest = buildLeagueLeaders({ pool: poolOf([a]), weekly, currentWeek: 3 });
    expect(guest!.find(l => l.position === 'QB')!.rows[0].owner).toBeNull();
  });

  it('keeps only perPosition rows per position', () => {
    const players = Array.from({ length: 15 }, (_, i) =>
      player(`t${i}`, `TE${i}`, 'TE'),
    );
    const entries: Record<string, Record<number, number>> = {};
    players.forEach((p, i) => {
      entries[p.sleeperId!] = { 1: 100 - i };
    });
    const out = buildLeagueLeaders({
      pool: poolOf(players),
      weekly: weeklyOf(entries),
      currentWeek: 3,
      perPosition: 10,
    });
    expect(out!.find(l => l.position === 'TE')!.rows).toHaveLength(10);
  });

  it('skips players with no scored weeks and zero totals', () => {
    const a = player('a', 'Alpha', 'RB');
    const b = player('b', 'Beta', 'RB');
    const weekly = weeklyOf({ 'sid-a': { 1: 0, 2: 0 }, 'sid-b': { 1: 8 } });
    const out = buildLeagueLeaders({ pool: poolOf([a, b]), weekly, currentWeek: 3 });
    expect(out!.find(l => l.position === 'RB')!.rows.map(r => r.player.id)).toEqual(['b']);
  });

  it('returns null without weekly data', () => {
    const a = player('a', 'Alpha', 'RB');
    expect(
      buildLeagueLeaders({ pool: poolOf([a]), weekly: undefined, currentWeek: 3 }),
    ).toBeNull();
    expect(
      buildLeagueLeaders({
        pool: poolOf([a]),
        weekly: weeklyOf({}),
        currentWeek: 3,
      }),
    ).toBeNull();
  });
});
