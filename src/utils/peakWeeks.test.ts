// Peak Weeks util (backlog item 106): per-position best single weeks
// across completed weeks only, with repeat appearances per player,
// deterministic tie-breaking, and opponent resolution passthrough.

import { describe, expect, it } from 'vitest';
import { buildPeakWeeks, MAX_PEAK_WEEKS } from './peakWeeks';
import type { PoolPlayer } from '@/types/draft';

function player(id: string, name: string, pos: string, team = 'DAL'): PoolPlayer {
  return {
    id,
    name,
    team,
    pos,
    posRank: 10,
    overallRank: 50,
    tier: 2,
    bye: 7,
    baseValue: null,
    projPtsPpr: 120,
    sleeperId: id,
  } as PoolPlayer;
}

const players = [
  player('alpha', 'Alpha Passer', 'QB'),
  player('beta', 'Beta Passer', 'QB'),
  player('gamma', 'Gamma Back', 'RB'),
];

describe('buildPeakWeeks', () => {
  it('ranks single weeks by points, same player twice', () => {
    const peaks = buildPeakWeeks({
      poolPlayers: players,
      pointsBySleeperId: {
        alpha: { 5: 30, 6: 42.4, 7: 18 },
        beta: { 5: 38, 6: 20 },
        gamma: { 5: 25 },
      },
      currentWeek: 8,
    });
    const qb = peaks.get('QB')!;
    expect(qb.map(r => [r.player.name, r.week, r.points])).toEqual([
      ['Alpha Passer', 6, 42.4],
      ['Beta Passer', 5, 38],
      ['Alpha Passer', 5, 30],
      ['Beta Passer', 6, 20],
      ['Alpha Passer', 7, 18],
    ]);
    expect(peaks.get('RB')!.map(r => r.points)).toEqual([25]);
    expect(peaks.has('WR')).toBe(false);
  });

  it('excludes the in-progress week and later weeks', () => {
    const peaks = buildPeakWeeks({
      poolPlayers: players,
      pointsBySleeperId: {
        alpha: { 7: 20, 8: 99, 9: 99 },
      },
      currentWeek: 8,
    });
    expect(peaks.get('QB')!.map(r => [r.week, r.points])).toEqual([[7, 20]]);
  });

  it('breaks points ties by earlier week, then name', () => {
    const peaks = buildPeakWeeks({
      poolPlayers: players,
      pointsBySleeperId: {
        alpha: { 6: 30 },
        beta: { 5: 30 },
      },
      currentWeek: 8,
    });
    expect(peaks.get('QB')!.map(r => r.player.name)).toEqual([
      'Beta Passer',
      'Alpha Passer',
    ]);
  });

  it('caps at MAX_PEAK_WEEKS per position', () => {
    const weeks: Record<number, number> = {};
    for (let w = 1; w <= 20; w++) weeks[w] = 40 - w;
    const peaks = buildPeakWeeks({
      poolPlayers: [player('alpha', 'Alpha Passer', 'QB')],
      pointsBySleeperId: { alpha: weeks },
      currentWeek: 21,
    });
    expect(peaks.get('QB')).toHaveLength(MAX_PEAK_WEEKS);
    expect(peaks.get('QB')![0].points).toBe(39);
  });

  it('passes the opponent resolver through, null without one', () => {
    const peaks = buildPeakWeeks({
      poolPlayers: players,
      pointsBySleeperId: { alpha: { 5: 30 } },
      currentWeek: 8,
      opponentFor: (team, week) => `${team}-vs-W${week}`,
    });
    expect(peaks.get('QB')![0].opponent).toBe('DAL-vs-W5');
    const noOpp = buildPeakWeeks({
      poolPlayers: players,
      pointsBySleeperId: { alpha: { 5: 30 } },
      currentWeek: 8,
    });
    expect(noOpp.get('QB')![0].opponent).toBeNull();
  });

  it('ignores non-QB/RB/WR/TE positions and players without points', () => {
    const peaks = buildPeakWeeks({
      poolPlayers: [
        ...players,
        player('kick', 'Kicky', 'K'),
        player('ghost', 'Ghost', 'WR'),
      ],
      pointsBySleeperId: { alpha: { 5: 30 } },
      currentWeek: 8,
    });
    expect(peaks.has('K' as never)).toBe(false);
    expect(peaks.has('WR')).toBe(false);
  });
});
