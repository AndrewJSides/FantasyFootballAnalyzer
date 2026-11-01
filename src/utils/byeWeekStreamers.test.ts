import { describe, expect, it } from 'vitest';
import {
  holeStreamerPicks,
  streamableHoles,
  EMPTY_STREAMER_EXCLUSIONS,
  type ByeWeekStreamerFixtures,
} from './byeWeekStreamers';
import { getDstMatchup } from './dstStreamers';
import { getKickerMatchup } from './kickerStreamers';
import { getSkillMatchup, startingSkillPlayers } from './skillStreamers';
import type { DraftPoolFile } from '@/types/draft';

// Tiny shared fixtures (same pattern as the streamer util tests).
const schedule = {
  season: 2026,
  weeks: {
    '8': [
      ['AAA', 'BBB'],
      ['CCC', 'DDD'],
    ],
  },
  generatedAt: '',
} as unknown as Parameters<typeof getDstMatchup>[2];

const dstGenerosity = {
  season: 2026,
  weeks: [1, 7] as [number, number],
  scoring: 'test',
  teams: {
    // Rank 1 = most generous to opposing defenses. AAA plays BBB (rank 2,
    // the best streaming target); DDD plays CCC (rank 5).
    AAA: { generosityAvg: 5, generosityRank: 30, ownAvg: 8 },
    BBB: { generosityAvg: 20, generosityRank: 2, ownAvg: 7 },
    CCC: { generosityAvg: 12, generosityRank: 5, ownAvg: 9 },
    DDD: { generosityAvg: 8, generosityRank: 12, ownAvg: 10 },
  },
  generatedAt: '',
} as unknown as Parameters<typeof getDstMatchup>[3];

const kickerGenerosity = {
  season: 2026,
  weeks: [1, 7] as [number, number],
  scoring: 'test',
  teams: {
    AAA: { generosityAvg: 5, generosityRank: 30, ownAvg: 8 },
    BBB: { generosityAvg: 20, generosityRank: 2, ownAvg: 7 },
    CCC: { generosityAvg: 12, generosityRank: 5, ownAvg: 9 },
    DDD: { generosityAvg: 8, generosityRank: 12, ownAvg: 10 },
  },
  generatedAt: '',
} as unknown as Parameters<typeof getKickerMatchup>[3];

const kickerMap = new Map([
  ['AAA', { id: 'ka', name: 'Ann Kicker', team: 'AAA' }],
  ['BBB', { id: 'kb', name: 'Bob Kicker', team: 'BBB' }],
  ['CCC', { id: 'kc', name: 'Cat Kicker', team: 'CCC' }],
  ['DDD', { id: 'kd', name: 'Dan Kicker', team: 'DDD' }],
]);

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
    poolPlayer({ id: 'qd', name: 'Dan QB', team: 'DDD' }),
    poolPlayer({ id: 'ta', name: 'Ann TE', team: 'AAA', pos: 'TE' }),
    poolPlayer({ id: 'tb', name: 'Bob TE', team: 'BBB', pos: 'TE' }),
  ],
} as unknown as DraftPoolFile;

const fixtures: ByeWeekStreamerFixtures = {
  schedule,
  dstGenerosity,
  kickerGenerosity,
  kickerMap,
  allowed,
  skillStarters: startingSkillPlayers('QB', pool),
};

const teFixtures: ByeWeekStreamerFixtures = {
  ...fixtures,
  skillStarters: startingSkillPlayers('TE', pool),
};

function hole(
  name: string,
  position: string,
  nflTeam = 'ATL',
  cause: 'bye' | 'injury' = 'bye',
  injuryLabel: string | null = null,
) {
  return { name, position, nflTeam, cause, injuryLabel };
}

describe('streamableHoles', () => {
  it('keeps QB/TE/K/DST and drops RB/WR', () => {
    const holes = [
      hole('A', 'QB'),
      hole('B', 'TE'),
      hole('C', 'K'),
      hole('D', 'DST'),
      hole('E', 'DEF'),
      hole('F', 'RB'),
      hole('G', 'WR'),
    ];
    const kept = streamableHoles(holes);
    expect(kept.map(h => h.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(kept.find(h => h.name === 'E')?.position).toBe('DST');
  });
});

describe('holeStreamerPicks', () => {
  it('returns nothing for no holes or non-streamable positions', () => {
    expect(holeStreamerPicks(8, [], EMPTY_STREAMER_EXCLUSIONS, fixtures)).toEqual([]);
    expect(
      holeStreamerPicks(8, [hole('X', 'RB')], EMPTY_STREAMER_EXCLUSIONS, fixtures),
    ).toEqual([]);
  });

  it('picks the most generous defense for a D/ST hole', () => {
    const [pick] = holeStreamerPicks(
      8,
      [hole('My Defense', 'DST', 'NYG')],
      EMPTY_STREAMER_EXCLUSIONS,
      fixtures,
    );
    // AAA plays BBB, the rank-2 (most generous) offense.
    expect(pick).toMatchObject({
      holeName: 'My Defense',
      position: 'DST',
      pickName: 'AAA',
      opponent: 'BBB',
      label: 'favorable',
    });
  });

  it('respects rostered defenses and hands out distinct picks for multiple holes', () => {
    const holes = [hole('D1', 'DST'), hole('D2', 'DST')];
    const [first, second] = holeStreamerPicks(
      8,
      holes,
      { ...EMPTY_STREAMER_EXCLUSIONS, rosteredDefenses: new Set(['AAA']) },
      fixtures,
    );
    // AAA is rostered: the best available is DDD (vs CCC, rank 5),
    // then CCC (vs DDD, rank 12).
    expect(first).toMatchObject({ pickName: 'DDD', opponent: 'CCC', label: 'favorable' });
    expect(second).toMatchObject({ pickName: 'CCC', opponent: 'DDD', label: 'neutral' });
    expect(first.holeName).toBe('D1');
    expect(second.holeName).toBe('D2');
  });

  it('picks the best kicker for a K hole', () => {
    const [pick] = holeStreamerPicks(
      8,
      [hole('My Kicker', 'K', 'NYG')],
      EMPTY_STREAMER_EXCLUSIONS,
      fixtures,
    );
    // AAA's kicker faces BBB (rank 2 to opposing kickers).
    expect(pick).toMatchObject({
      holeName: 'My Kicker',
      position: 'K',
      pickName: 'Ann Kicker',
      opponent: 'BBB',
      label: 'favorable',
    });
  });

  it('picks the best QB for a QB hole', () => {
    const [pick] = holeStreamerPicks(
      8,
      [hole('My QB', 'QB', 'NYG')],
      EMPTY_STREAMER_EXCLUSIONS,
      fixtures,
    );
    // Cat QB (CCC) faces DDD (QB rank 2 = most generous to QBs).
    expect(pick).toMatchObject({
      holeName: 'My QB',
      position: 'QB',
      pickName: 'Cat QB',
      opponent: 'DDD',
      label: 'favorable',
    });
  });

  it('excludes rostered QBs and picks the next best', () => {
    const [pick] = holeStreamerPicks(
      8,
      [hole('My QB', 'QB', 'NYG')],
      { ...EMPTY_STREAMER_EXCLUSIONS, rosteredSkillIds: new Set(['qc']) },
      fixtures,
    );
    // Cat QB is rostered: Bob QB (BBB) faces AAA (QB rank 5, favorable).
    expect(pick).toMatchObject({ pickName: 'Bob QB', opponent: 'AAA', label: 'favorable' });
  });

  it('picks the best TE for a TE hole', () => {
    const [pick] = holeStreamerPicks(
      8,
      [hole('My TE', 'TE', 'NYG')],
      EMPTY_STREAMER_EXCLUSIONS,
      teFixtures,
    );
    // Ann TE (AAA) faces BBB (TE rank 8, favorable); Bob TE (BBB) faces
    // AAA (TE rank 20, neutral). CCC/DDD have no TE starter in the pool.
    expect(pick).toMatchObject({
      position: 'TE',
      pickName: 'Ann TE',
      opponent: 'BBB',
      label: 'favorable',
    });
  });

  it('covers several positions in one week', () => {
    const picks = holeStreamerPicks(
      8,
      [hole('My QB', 'QB'), hole('My Kicker', 'K')],
      EMPTY_STREAMER_EXCLUSIONS,
      fixtures,
    );
    expect(picks.map(p => p.position).sort()).toEqual(['K', 'QB']);
  });

  it('returns nothing when the week has no games', () => {
    expect(
      holeStreamerPicks(9, [hole('My QB', 'QB')], EMPTY_STREAMER_EXCLUSIONS, fixtures),
    ).toEqual([]);
  });

  it('carries the injury cause and label through to the pick', () => {
    const [pick] = holeStreamerPicks(
      8,
      [hole('Hurt QB', 'QB', 'ATL', 'injury', 'Out (Knee)')],
      EMPTY_STREAMER_EXCLUSIONS,
      fixtures,
    );
    expect(pick).toMatchObject({
      holeName: 'Hurt QB',
      cause: 'injury',
      injuryLabel: 'Out (Knee)',
      position: 'QB',
    });
  });
});
