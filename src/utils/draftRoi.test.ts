import { describe, expect, it } from 'vitest';
import type { DraftPick, League, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { buildDraftRoi } from './draftRoi';

function poolPlayer(over: Partial<PoolPlayer>): PoolPlayer {
  return {
    id: 'p1',
    name: 'Test Player',
    team: 'KC',
    pos: 'RB',
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: 8,
    baseValue: null,
    ...over,
  };
}

const POOL: DraftPoolFile = {
  season: 2026,
  generatedAt: '2026-10-31',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    poolPlayer({ id: 'rb1', name: 'Lead Back', pos: 'RB', overallRank: 10, projPtsPpr: 260 }),
    poolPlayer({ id: 'rb2', name: 'Backup Back', pos: 'RB', overallRank: 20, projPtsPpr: 220 }),
    poolPlayer({ id: 'wr1', name: 'Top Wideout', pos: 'WR', overallRank: 8, projPtsPpr: 270 }),
    poolPlayer({ id: 'wr2', name: 'Second Wideout', pos: 'WR', overallRank: 18, projPtsPpr: 230 }),
    poolPlayer({ id: 'te1', name: 'Top Tight End', pos: 'TE', overallRank: 40, projPtsPpr: 170 }),
  ],
};

function player(id: string, pos: string, name: string): Player {
  return { id, platformId: id, name, position: pos, team: 'KC' };
}

function pick(id: string, pos: string, name: string, auctionValue: number, teamId: string): DraftPick {
  return {
    pickNumber: 1,
    round: 1,
    player: player(id, pos, name),
    teamId,
    teamName: '',
    auctionValue,
    seasonPoints: 0,
  };
}

const SLOTS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1 };

function league(teams: Array<{ id: string; name: string; draftPicks: DraftPick[] }>): League {
  return {
    id: 'L1',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    status: 'live',
    currentWeek: 9,
    scoringType: 'ppr',
    totalTeams: teams.length,
    rosterSlots: SLOTS,
    teams: teams.map(t => ({
      id: t.id,
      name: t.name,
      roster: [],
      draftPicks: t.draftPicks,
    })),
  } as unknown as League;
}

describe('buildDraftRoi', () => {
  it('ranks the efficient spender first and names best/worst buys', () => {
    const l = league([
      {
        id: 't1',
        name: 'Alpha',
        draftPicks: [
          pick('rb1', 'RB', 'Lead Back', 50, 't1'), // 260+ proj -> ~5.2 pts/$
          pick('wr2', 'WR', 'Second Wideout', 20, 't1'), // 230 proj -> 11.5 pts/$
        ],
      },
      {
        id: 't2',
        name: 'Beta',
        draftPicks: [
          pick('te1', 'TE', 'Top Tight End', 40, 't2'), // 170 proj -> 4.25 pts/$
          pick('rb2', 'RB', 'Backup Back', 50, 't2'), // 220 proj -> 4.4 pts/$
        ],
      },
    ]);
    const roi = buildDraftRoi({ league: l, pool: POOL, slots: SLOTS })!;
    expect(roi).toHaveLength(2);
    // Alpha: $70 for ~490 proj; Beta: $90 for ~390 proj -> Alpha cheaper per pt
    expect(roi[0].teamName).toBe('Alpha');
    expect(roi[0].rank).toBe(1);
    expect(roi[1].rank).toBe(2);
    expect(roi[0].spent).toBe(70);
    expect(roi[0].costPerPoint).toBeCloseTo(70 / roi[0].projectedPoints, 5);
    expect(roi[0].bestBuy?.playerName).toBe('Second Wideout');
    expect(roi[0].worstBuy?.playerName).toBe('Lead Back');
    expect(roi[1].bestBuy?.playerName).toBe('Backup Back');
    expect(roi[1].worstBuy?.playerName).toBe('Top Tight End');
  });

  it('returns undefined for a non-auction league (no auctionValue)', () => {
    const l = league([
      { id: 't1', name: 'Alpha', draftPicks: [pick('rb1', 'RB', 'Lead Back', 0, 't1')] },
    ]);
    expect(buildDraftRoi({ league: l, pool: POOL, slots: SLOTS })).toBeUndefined();
  });

  it('returns undefined when the league is not live', () => {
    const l = league([
      { id: 't1', name: 'Alpha', draftPicks: [pick('rb1', 'RB', 'Lead Back', 50, 't1')] },
    ]);
    l.status = 'offseason';
    expect(buildDraftRoi({ league: l, pool: POOL, slots: SLOTS })).toBeUndefined();
  });

  it('ignores $1 fliers for best/worst buys but counts their spend', () => {
    const l = league([
      {
        id: 't1',
        name: 'Alpha',
        draftPicks: [
          pick('rb1', 'RB', 'Lead Back', 50, 't1'),
          pick('te1', 'TE', 'Top Tight End', 1, 't1'),
        ],
      },
    ]);
    const roi = buildDraftRoi({ league: l, pool: POOL, slots: SLOTS })!;
    expect(roi).toHaveLength(1);
    expect(roi[0].spent).toBe(51);
    expect(roi[0].bestBuy?.playerName).toBe('Lead Back');
    expect(roi[0].worstBuy?.playerName).toBe('Lead Back');
  });

  it('skips picks with no outlook but keeps the rest of the team', () => {
    const l = league([
      {
        id: 't1',
        name: 'Alpha',
        draftPicks: [
          pick('rb1', 'RB', 'Lead Back', 50, 't1'),
          pick('xx9', 'WR', 'Ghost Player', 30, 't1'), // not in pool
        ],
      },
    ]);
    const roi = buildDraftRoi({ league: l, pool: POOL, slots: SLOTS })!;
    expect(roi).toHaveLength(1);
    expect(roi[0].spent).toBe(50);
  });
});
