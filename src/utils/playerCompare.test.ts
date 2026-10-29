import { describe, expect, it } from 'vitest';
import type { WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import type { PoolPlayer } from '@/types/draft';
import { comparePlayers, type CompareContext } from './playerCompare';
import { valueLeagueFor } from './tradeAnalysis';
import { vorConfigFor } from './projectionValues';
import { DEFAULT_MANUAL_SHAPE } from './tradeAnalysis';

const player = (id: string, name: string, team: string, pos = 'QB'): PoolPlayer =>
  ({
    id,
    name,
    team,
    pos,
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: null,
    baseValue: null,
    sleeperId: id,
  }) as PoolPlayer;

const weeklyFor = (entries: Array<[string, Array<[number, number]>]>): WeeklyPprPoints => {
  const pointsBySleeperId: Record<string, Record<number, number>> = {};
  const gamesBySleeperId: Record<string, number[]> = {};
  for (const [sid, weeks] of entries) {
    pointsBySleeperId[sid] = {};
    gamesBySleeperId[sid] = [];
    for (const [w, pts] of weeks) {
      pointsBySleeperId[sid][w] = pts;
      gamesBySleeperId[sid].push(w);
    }
  }
  return {
    season: 2026,
    weeks: [1, 2, 3, 4],
    pointsBySleeperId,
    gamesBySleeperId,
  };
};

const valueLeague = valueLeagueFor(null, 'ppr');
const vorCfg = vorConfigFor({});

const ctxFor = (currentWeek = 5): CompareContext => ({
  currentWeek,
  scoring: 'ppr',
  slots: DEFAULT_MANUAL_SHAPE,
  teamCount: 10,
  season: 2026,
  valueLeague,
  vorCfg,
});

const allen = () => player('allen-sid', 'Josh Allen', 'BUF');
const daniels = () => player('daniels-sid', 'Jayden Daniels', 'WAS');

describe('comparePlayers', () => {
  it('scores the better player ahead on stats rows and names the winner', () => {
    const weekly = weeklyFor([
      ['allen-sid', [[1, 25], [2, 28], [3, 22], [4, 30]]],
      ['daniels-sid', [[1, 15], [2, 18], [3, 12], [4, 20]]],
    ]);
    const r = comparePlayers(allen(), daniels(), weekly, ctxFor());
    const byKey = new Map(r.rows.map(x => [x.key, x]));
    expect(byKey.get('ppg')!.winner).toBe('A');
    expect(byKey.get('total')!.winner).toBe('A');
    expect(byKey.get('last3')!.winner).toBe('A');
    expect(byKey.get('projection')!.winner).toBe('A');
    expect(byKey.get('ros')!.winner).toBe('A');
    expect(r.winsA).toBeGreaterThan(r.winsB);
    expect(r.verdict).toContain('Josh Allen takes the comparison');
    expect(r.verdict).toContain('Jayden Daniels');
    expect(r.metricsA.total).toBe(105);
    expect(r.metricsA.ppg).toBe(26.3);
    expect(r.metricsB.ppg).toBe(16.3);
  });

  it('produces the seven expected rows with accessible text', () => {
    const weekly = weeklyFor([
      ['allen-sid', [[1, 20], [2, 20], [3, 20], [4, 20]]],
      ['daniels-sid', [[1, 20], [2, 20], [3, 20], [4, 20]]],
    ]);
    const r = comparePlayers(allen(), daniels(), weekly, ctxFor());
    expect(r.rows.map(x => x.key)).toEqual([
      'projection',
      'matchup',
      'ppg',
      'last3',
      'total',
      'ros',
      'vor',
    ]);
    // Identical stat lines tie on the stats rows.
    for (const k of ['ppg', 'last3', 'total']) {
      expect(r.rows.find(x => x.key === k)!.winner).toBe('tie');
    }
  });

  it('handles a player with no weekly data without crashing', () => {
    const weekly = weeklyFor([['allen-sid', [[1, 25], [2, 28], [3, 22], [4, 30]]]]);
    const unknown = player('nope-sid', 'Unknown Player', 'KC');
    const r = comparePlayers(allen(), unknown, weekly, ctxFor());
    expect(r.metricsB.total).toBeNull();
    expect(r.metricsB.ppg).toBeNull();
    expect(r.metricsB.projection).toBeNull();
    const byKey = new Map(r.rows.map(x => [x.key, x]));
    expect(byKey.get('ppg')!.winner).toBe('A');
    expect(byKey.get('total')!.winner).toBe('A');
    // ROS still resolves (pool-season projection basis), VOR is 0 for a fake id.
    expect(r.metricsB.rosProjected).not.toBeNull();
    expect(r.metricsB.vor).toBe(0);
    expect(r.verdict).toContain('Josh Allen');
  });

  it('reports matchup text when the schedule covers the week', () => {
    const weekly = weeklyFor([
      ['allen-sid', [[1, 20], [2, 20], [3, 20], [4, 20]]],
      ['daniels-sid', [[1, 20], [2, 20], [3, 20], [4, 20]]],
    ]);
    const r = comparePlayers(allen(), daniels(), weekly, ctxFor());
    const row = r.rows.find(x => x.key === 'matchup')!;
    // Week 5 of the 2026 schedule: text renders when a game exists, dashes otherwise.
    expect(['A', 'B', 'tie', null]).toContain(row.winner);
    for (const side of ['a', 'b'] as const) {
      const text = row[side];
      expect(text === null || text.startsWith('vs ')).toBe(true);
    }
  });
});
