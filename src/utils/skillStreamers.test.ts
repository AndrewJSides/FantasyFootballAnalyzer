import { describe, expect, it } from 'vitest';
import type { DraftPoolFile } from '@/types/draft';
import {
  getSkillMatchup,
  rankSkillStreamers,
  skillMatchupWeeksRange,
  startingSkillPlayers,
} from './skillStreamers';

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
} as unknown as Parameters<typeof getSkillMatchup>[3];

const allowed = {
  season: 2026,
  weeks: [1, 7] as [number, number],
  teams: {
    AAA: { QB: { avg: 20, rank: 5 }, TE: { avg: 10, rank: 20 } },
    BBB: { QB: { avg: 10, rank: 30 }, TE: { avg: 16, rank: 8 } },
    CCC: { QB: { avg: 18, rank: 12 }, TE: { avg: 8, rank: 28 } },
    DDD: { QB: { avg: 22, rank: 2 }, TE: { avg: 19, rank: 3 } },
  },
  generatedAt: '',
} as unknown as Parameters<typeof getSkillMatchup>[4];

function poolPlayer(over: Record<string, unknown> = {}) {
  return {
    id: 'x',
    name: 'X Player',
    team: 'AAA',
    pos: 'QB',
    posRank: 12,
    overallRank: 100,
    tier: 3,
    bye: 9,
    baseValue: 5,
    depthChartOrder: 1,
    projPtsPpr: 289,
    ...over,
  };
}

const pool = {
  season: 2026,
  generatedAt: '',
  players: [
    poolPlayer({ id: 'qa', name: 'Ann QB', team: 'AAA' }),
    poolPlayer({ id: 'qb', name: 'Bob QB', team: 'BBB' }),
    poolPlayer({ id: 'qc', name: 'Cat QB', team: 'CCC' }),
    // DDD's QB1 is hurt: still listed, with the status surfaced.
    poolPlayer({ id: 'qd', name: 'Dan QB', team: 'DDD', injuryStatus: 'Q' }),
    // Backup QB on AAA is not a starter candidate.
    poolPlayer({ id: 'qa2', name: 'Ann Backup', team: 'AAA', depthChartOrder: 2 }),
    poolPlayer({ id: 'ta', name: 'Ann TE', team: 'AAA', pos: 'TE' }),
    poolPlayer({ id: 'tb', name: 'Bob TE', team: 'BBB', pos: 'TE' }),
  ],
} as unknown as DraftPoolFile;

const starters = startingSkillPlayers('QB', pool);

describe('startingSkillPlayers', () => {
  it('keeps the depth-chart-1 player per team at the position', () => {
    expect(starters.get('AAA')?.id).toBe('qa');
    expect(starters.get('DDD')?.id).toBe('qd');
    expect(starters.has('ZZZ')).toBe(false);
  });

  it('is position-scoped', () => {
    const tes = startingSkillPlayers('TE', pool);
    expect(tes.get('AAA')?.id).toBe('ta');
    expect(tes.has('CCC')).toBe(false);
  });
});

describe('getSkillMatchup', () => {
  it('returns the starter plus the opponent generosity rating', () => {
    const m = getSkillMatchup('AAA', 8, 'QB', schedule, allowed, starters);
    expect(m).toMatchObject({
      playerId: 'qa',
      name: 'Ann QB',
      team: 'AAA',
      position: 'QB',
      opponent: 'BBB',
      avgAllowed: 10,
      rank: 30,
      label: 'tough',
    });
    expect(m?.ownWeeklyProj).toBeCloseTo(289 / 17, 5);
  });

  it('labels top-10 generosity as favorable', () => {
    const m = getSkillMatchup('CCC', 8, 'QB', schedule, allowed, starters);
    expect(m?.opponent).toBe('DDD');
    expect(m?.rank).toBe(2);
    expect(m?.label).toBe('favorable');
  });

  it('reads the position column, not the QB column, for TEs', () => {
    const m = getSkillMatchup('AAA', 8, 'TE', schedule, allowed, startingSkillPlayers('TE', pool));
    expect(m?.opponent).toBe('BBB');
    expect(m?.avgAllowed).toBe(16);
    expect(m?.rank).toBe(8);
    expect(m?.label).toBe('favorable');
  });

  it('surfaces the starter injury status', () => {
    const m = getSkillMatchup('DDD', 8, 'QB', schedule, allowed, starters);
    expect(m?.injuryStatus).toBe('Q');
  });

  it('returns null on a bye week, unknown team, or missing data', () => {
    // BBB has no game in week 9 (bye).
    expect(getSkillMatchup('BBB', 9, 'QB', schedule, allowed, starters)).toBeNull();
    expect(getSkillMatchup('AAA', 99, 'QB', schedule, allowed, starters)).toBeNull();
    expect(getSkillMatchup('ZZZ', 8, 'QB', schedule, allowed, starters)).toBeNull();
    expect(getSkillMatchup('AAA', 8, 'QB', schedule, allowed, new Map())).toBeNull();
  });
});

describe('rankSkillStreamers', () => {
  it('orders by opponent generosity, best target first', () => {
    const ranked = rankSkillStreamers(8, 'QB', new Set(), 5, schedule, allowed, starters);
    expect(ranked.map(r => r.team)).toEqual(['CCC', 'BBB', 'DDD', 'AAA']);
  });

  it('excludes rostered players by pool id', () => {
    const ranked = rankSkillStreamers(8, 'QB', new Set(['qc']), 5, schedule, allowed, starters);
    expect(ranked.map(r => r.team)).toEqual(['BBB', 'DDD', 'AAA']);
  });

  it('breaks generosity ties by own projected weekly points', () => {
    const tied = {
      ...allowed,
      teams: {
        ...allowed.teams,
        BBB: { QB: { avg: 22, rank: 2 }, TE: { avg: 16, rank: 8 } },
      },
    } as unknown as Parameters<typeof getSkillMatchup>[4];
    // AAA (vs BBB) and CCC (vs DDD) both face rank-2 generosity. Boost CCC's
    // starter projection so the tie-break puts CCC first.
    const boosted = new Map(starters);
    boosted.set('CCC', poolPlayer({ id: 'qc', name: 'Cat QB', team: 'CCC', projPtsPpr: 340 }));
    const ranked = rankSkillStreamers(8, 'QB', new Set(), 5, schedule, tied, boosted);
    expect(ranked[0].team).toBe('CCC');
    expect(ranked[1].team).toBe('AAA');
    expect(ranked).toHaveLength(4);
  });

  it('returns an empty list without a week', () => {
    expect(rankSkillStreamers(undefined, 'QB', new Set())).toEqual([]);
  });
});

describe('skillMatchupWeeksRange', () => {
  it('reports the completed weeks behind the ratings', () => {
    expect(skillMatchupWeeksRange()).toEqual([1, 7]);
  });
});
