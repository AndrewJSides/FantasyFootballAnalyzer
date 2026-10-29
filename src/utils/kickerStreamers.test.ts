import { describe, expect, it } from 'vitest';
import {
  getKickerMatchup,
  kickerGenerosityWeeksRange,
  rankKickerStreamers,
  startingKickers,
} from './kickerStreamers';

const schedule = {
  season: 2026,
  weeks: {
    '8': [
      ['AAA', 'BBB'],
      ['CCC', 'DDD'],
    ],
    '9': [['AAA', 'CCC']],
  },
  generatedAt: '',
} as unknown as Parameters<typeof getKickerMatchup>[2];

const generosity = {
  season: 2026,
  weeks: [1, 7] as [number, number],
  scoring: 'test',
  teams: {
    AAA: { generosityAvg: 20, generosityRank: 5, ownAvg: 8 },
    BBB: { generosityAvg: 10, generosityRank: 30, ownAvg: 12 },
    CCC: { generosityAvg: 18, generosityRank: 12, ownAvg: 9 },
    DDD: { generosityAvg: 22, generosityRank: 2, ownAvg: 7 },
  },
  generatedAt: '',
} as unknown as Parameters<typeof getKickerMatchup>[3];

const kickers = new Map([
  ['AAA', { id: 'a', name: 'Ann Kicker', team: 'AAA' }],
  ['BBB', { id: 'b', name: 'Bob Kicker', team: 'BBB' }],
  ['CCC', { id: 'c', name: 'Cat Kicker', team: 'CCC' }],
  ['DDD', { id: 'd', name: 'Dan Kicker', team: 'DDD' }],
]);

describe('getKickerMatchup', () => {
  it('returns the kicker plus the opponent defense generosity rating', () => {
    const m = getKickerMatchup('AAA', 8, schedule, generosity, kickers);
    expect(m).toMatchObject({
      kickerId: 'a',
      name: 'Ann Kicker',
      team: 'AAA',
      opponent: 'BBB',
      avgAllowed: 10,
      rank: 30,
      label: 'tough',
      ownAvg: 8,
    });
  });

  it('labels rank <= 10 favorable and >= 23 tough', () => {
    // Rating is about the OPPONENT's generosity: CCC faces DDD (rank 2),
    // DDD faces CCC (rank 12), AAA faces BBB (rank 30).
    expect(getKickerMatchup('CCC', 8, schedule, generosity, kickers)?.label).toBe('favorable');
    expect(getKickerMatchup('DDD', 8, schedule, generosity, kickers)?.label).toBe('neutral');
    expect(getKickerMatchup('AAA', 8, schedule, generosity, kickers)?.label).toBe('tough');
  });

  it('returns null for a bye week, missing team, missing kicker, or missing week', () => {
    expect(getKickerMatchup('AAA', 10, schedule, generosity, kickers)).toBeNull();
    expect(getKickerMatchup(null, 8, schedule, generosity, kickers)).toBeNull();
    expect(getKickerMatchup('AAA', undefined, schedule, generosity, kickers)).toBeNull();
    expect(getKickerMatchup('AAA', 8, schedule, generosity, new Map())).toBeNull();
  });
});

describe('rankKickerStreamers', () => {
  it('ranks by opponent generosity, excluding rostered teams', () => {
    const ranked = rankKickerStreamers(8, new Set(['DDD']), 5, schedule, generosity, kickers);
    // DDD is rostered; remaining by generosity rank: AAA faces BBB (30),
    // CCC faces DDD (2), BBB faces AAA (5).
    expect(ranked.map(r => r.team)).toEqual(['CCC', 'BBB', 'AAA']);
    expect(ranked[0].name).toBe('Cat Kicker');
  });

  it('breaks generosity ties on the kicker own average', () => {
    const tied = {
      ...generosity,
      teams: {
        AAA: { generosityAvg: 20, generosityRank: 5, ownAvg: 8 },
        BBB: { generosityAvg: 20, generosityRank: 5, ownAvg: 12 },
        CCC: { generosityAvg: 18, generosityRank: 12, ownAvg: 9 },
        DDD: { generosityAvg: 22, generosityRank: 2, ownAvg: 7 },
      },
    } as unknown as Parameters<typeof getKickerMatchup>[3];
    const ranked = rankKickerStreamers(8, new Set(), 5, schedule, tied, kickers);
    // AAA and BBB both face rank-5 generosity; BBB's own avg (12) wins.
    const order = ranked.map(r => r.team);
    expect(order.indexOf('BBB')).toBeLessThan(order.indexOf('AAA'));
  });

  it('returns an empty list when the week is undefined', () => {
    expect(rankKickerStreamers(undefined, new Set(), 5, schedule, generosity, kickers)).toEqual([]);
  });

  it('kickerGenerosityWeeksRange reads the bundled range', () => {
    expect(kickerGenerosityWeeksRange()).toEqual([1, 7]);
  });

  it('startingKickers maps every NFL team to its bundled depth-chart kicker', () => {
    const byTeam = startingKickers();
    expect(byTeam.size).toBe(32);
    expect(byTeam.get('DAL')?.name).toBe('Brandon Aubrey');
  });
});
