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

  it('produces the nine expected rows with accessible text', () => {
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
      'consistency',
      'boom',
    ]);
    // Identical stat lines tie on the stats rows.
    for (const k of ['ppg', 'last3', 'total', 'consistency', 'boom']) {
      expect(r.rows.find(x => x.key === k)!.winner).toBe('tie');
    }
  });

  it('ranks the steady player ahead on consistency and the volatile one ahead on boom %', () => {
    const weekly = weeklyFor([
      ['allen-sid', [[1, 20], [2, 21], [3, 20], [4, 21]]],
      ['daniels-sid', [[1, 5], [2, 30], [3, 5], [4, 30]]],
    ]);
    const r = comparePlayers(allen(), daniels(), weekly, ctxFor());
    expect(r.metricsA.consistency?.verdict).toBe('Steady');
    expect(r.metricsB.consistency?.verdict).toBe('Volatile');
    const byKey = new Map(r.rows.map(x => [x.key, x]));
    expect(byKey.get('consistency')!.winner).toBe('A');
    expect(byKey.get('consistency')!.a).toContain('Steady');
    // Both projections sit below the QB 25-pt boom bar, so the volatile
    // player's wide distribution carries the higher boom chance.
    expect(r.metricsA.boomPct).not.toBeNull();
    expect(r.metricsB.boomPct).not.toBeNull();
    expect(r.metricsB.boomPct!).toBeGreaterThan(r.metricsA.boomPct!);
    expect(byKey.get('boom')!.winner).toBe('B');
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
    // No series means no consistency verdict and no boom chance either.
    expect(r.metricsB.consistency).toBeNull();
    expect(r.metricsB.boomPct).toBeNull();
    expect(byKey.get('consistency')!.winner).toBe('A');
    expect(byKey.get('boom')!.winner).toBe('A');
    // ROS still resolves (pool-season projection basis), VOR is 0 for a fake id.
    expect(r.metricsB.rosProjected).not.toBeNull();
    expect(r.metricsB.vor).toBe(0);
    expect(r.verdict).toContain('Josh Allen');
  });

  // Item-136 remainder: a ruled-out player prices at 0 for the week, not
  // his frozen full projection (the A.J. Brown week-8 miss class).
  it('zeroes a ruled-out player week projection and names it in the verdict', () => {
    const weekly = weeklyFor([
      ['allen-sid', [[1, 25], [2, 28], [3, 22], [4, 30]]],
      ['daniels-sid', [[1, 15], [2, 18], [3, 12], [4, 20]]],
    ]);
    const hurt = { ...allen(), injuryStatus: 'Out', injuryBodyPart: 'Knee' };
    const r = comparePlayers(hurt, daniels(), weekly, ctxFor());
    expect(r.metricsA.ruledOut).toBe(true);
    expect(r.metricsA.projection).toBe(0);
    expect(r.metricsA.boomPct).toBe(0);
    const byKey = new Map(r.rows.map(x => [x.key, x]));
    expect(byKey.get('projection')!.a).toBe('0.0 pts (ruled out)');
    expect(byKey.get('projection')!.winner).toBe('B');
    expect(r.verdict).toContain('Josh Allen is ruled out this week');
    // Season numbers are untouched — only the week projection zeroes.
    expect(r.metricsA.ppg).toBe(26.3);
  });

  it('keeps a Questionable player at his full projection (no invented discount)', () => {
    const weekly = weeklyFor([
      ['allen-sid', [[1, 25], [2, 28], [3, 22], [4, 30]]],
      ['daniels-sid', [[1, 15], [2, 18], [3, 12], [4, 20]]],
    ]);
    const q = { ...allen(), injuryStatus: 'Questionable', injuryBodyPart: 'Knee' };
    const r = comparePlayers(q, daniels(), weekly, ctxFor());
    expect(r.metricsA.ruledOut).toBe(false);
    expect(r.metricsA.projection).toBeGreaterThan(0);
    expect(r.verdict).not.toContain('ruled out');
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

  // Item-173 remainder: the measured sole-back term folds into the week
  // projection, so Compare agrees with the Weekly Rankings board,
  // Start/Sit, and the Matchup game plan on the same player.
  it('folds a sole-back vacancy into the week projection and tags the row', () => {
    const lead = player('lead-sid', 'Lead Back', 'TEN', 'RB');
    const other = player('other-sid', 'Other Back', 'DAL', 'RB');
    const series: Array<[number, number]> = [[1, 10], [2, 12], [3, 11], [4, 13]];
    const weekly = weeklyFor([['lead-sid', series], ['other-sid', series]]);
    const base = comparePlayers(lead, other, weekly, ctxFor());
    // Identical series tie on the projection row with no vacancy.
    expect(base.metricsA.projection).toBe(base.metricsB.projection);
    expect(base.metricsA.soleBack).toBeNull();

    const soleBack = new Map([['lead-sid', { mates: ['Backup Mate'], upside: 4.8 }]]);
    const r = comparePlayers(lead, other, weekly, ctxFor(), soleBack);
    expect(r.metricsA.soleBack).toEqual({ mates: ['Backup Mate'], upside: 4.8 });
    expect(r.metricsA.projection).toBe(Math.round((base.metricsA.projection! + 4.8) * 10) / 10);
    const byKey = new Map(r.rows.map(x => [x.key, x]));
    expect(byKey.get('projection')!.a).toContain('Sole back +4.8');
    expect(byKey.get('projection')!.winner).toBe('A');
    expect(r.verdict).toContain('sole back in his backfield');
    // The other side is untouched.
    expect(r.metricsB.projection).toBe(base.metricsB.projection);
    expect(r.metricsB.soleBack).toBeNull();
  });

  it('never folds a sole-back vacancy into a ruled-out player', () => {
    const lead = { ...player('lead-sid', 'Lead Back', 'TEN', 'RB'), injuryStatus: 'Out' };
    const other = player('other-sid', 'Other Back', 'DAL', 'RB');
    const weekly = weeklyFor([
      ['lead-sid', [[1, 10], [2, 12], [3, 11], [4, 13]]],
      ['other-sid', [[1, 10], [2, 12], [3, 11], [4, 13]]],
    ]);
    const soleBack = new Map([['lead-sid', { mates: ['Backup Mate'], upside: 4.8 }]]);
    const r = comparePlayers(lead, other, weekly, ctxFor(), soleBack);
    expect(r.metricsA.projection).toBe(0);
    const byKey = new Map(r.rows.map(x => [x.key, x]));
    expect(byKey.get('projection')!.a).toBe('0.0 pts (ruled out)');
    expect(byKey.get('projection')!.a).not.toContain('Sole back');
  });

  // Item-138 remainder: the measured weather term folds into the week
  // projection, so Compare agrees with the Weekly Rankings board,
  // Start/Sit, and the Matchup game plan on the same player.
  const weatherRiskFor = (team: string) =>
    new Map([
      [
        team,
        {
          windy: true,
          wet: true,
          windMph: 18,
          gustsMph: 27,
          precipProb: 88,
          tempF: 55,
        },
      ],
    ]);

  it('folds the -25% weather downgrade into the week projection and tags the row', () => {
    const series: Array<[number, number]> = [[1, 25], [2, 28], [3, 22], [4, 30]];
    const weekly = weeklyFor([['allen-sid', series], ['daniels-sid', series]]);
    const base = comparePlayers(allen(), daniels(), weekly, ctxFor());
    // Identical series tie on the projection row with no flagged game.
    expect(base.metricsA.projection).toBe(base.metricsB.projection);
    expect(base.metricsA.weatherAdjustment).toBeNull();

    const r = comparePlayers(allen(), daniels(), weekly, ctxFor(), undefined, weatherRiskFor('BUF'));
    const expectedAdj = -Math.round(base.metricsA.projection! * 0.25 * 10) / 10;
    expect(r.metricsA.weatherAdjustment).toBe(expectedAdj);
    expect(r.metricsA.projection).toBe(
      Math.round((base.metricsA.projection! + expectedAdj) * 10) / 10,
    );
    const byKey = new Map(r.rows.map(x => [x.key, x]));
    expect(byKey.get('projection')!.a).toContain(`Weather ${expectedAdj.toFixed(1)}`);
    // The downgrade flips the projection row to the other side.
    expect(byKey.get('projection')!.winner).toBe('B');
    expect(r.verdict).toContain('windy or wet outdoor game');
    // The other side is untouched.
    expect(r.metricsB.projection).toBe(base.metricsB.projection);
    expect(r.metricsB.weatherAdjustment).toBeNull();
  });

  it('never downgrades an RB in a flagged game', () => {
    const lead = player('lead-sid', 'Lead Back', 'TEN', 'RB');
    const other = player('other-sid', 'Other Back', 'DAL', 'RB');
    const series: Array<[number, number]> = [[1, 10], [2, 12], [3, 11], [4, 13]];
    const weekly = weeklyFor([['lead-sid', series], ['other-sid', series]]);
    const r = comparePlayers(lead, other, weekly, ctxFor(), undefined, weatherRiskFor('TEN'));
    expect(r.metricsA.projection).toBe(r.metricsB.projection);
    expect(r.metricsA.weatherAdjustment).toBeNull();
    const byKey = new Map(r.rows.map(x => [x.key, x]));
    expect(byKey.get('projection')!.a).not.toContain('Weather');
  });

  it('never folds a weather downgrade into a ruled-out player', () => {
    const out = { ...allen(), injuryStatus: 'Out' };
    const weekly = weeklyFor([
      ['allen-sid', [[1, 25], [2, 28], [3, 22], [4, 30]]],
      ['daniels-sid', [[1, 25], [2, 28], [3, 22], [4, 30]]],
    ]);
    const r = comparePlayers(out, daniels(), weekly, ctxFor(), undefined, weatherRiskFor('BUF'));
    expect(r.metricsA.projection).toBe(0);
    expect(r.metricsA.weatherAdjustment).toBeNull();
    const byKey = new Map(r.rows.map(x => [x.key, x]));
    expect(byKey.get('projection')!.a).toBe('0.0 pts (ruled out)');
    expect(byKey.get('projection')!.a).not.toContain('Weather');
  });
});
