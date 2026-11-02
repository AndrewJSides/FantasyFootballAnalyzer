import { describe, expect, it } from 'vitest';
import type { Team } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import type { TradeCandidate } from './tradeFinder';
import { partnerDealLine, rankTradePartners } from './tradePartners';

function poolPlayer(id: string, pos: string): PoolPlayer {
  return { id, name: id, pos } as PoolPlayer;
}

function candidate(
  teamAId: string,
  teamBId: string,
  score: number,
  aGives: string[] = [],
  bGives: string[] = [],
): TradeCandidate {
  const team = (id: string) => ({ id, name: id }) as Team;
  return {
    teamA: team(teamAId),
    teamB: team(teamBId),
    aGives: aGives.map(id => poolPlayer(id, 'RB')),
    bGives: bGives.map(id => poolPlayer(id, 'WR')),
    analysis: {},
    reasons: [],
    score,
  } as unknown as TradeCandidate;
}

describe('rankTradePartners', () => {
  it('ranks partners by candidate count, then total score', () => {
    const candidates = [
      candidate('me', 'b', 5),
      candidate('me', 'b', 4),
      candidate('me', 'c', 8),
    ];
    const rows = rankTradePartners(candidates, 'me');
    expect(rows.map(r => r.team.id)).toEqual(['b', 'c']);
    expect(rows[0].candidateCount).toBe(2);
    expect(rows[0].totalScore).toBe(9);
    // Best is the highest-score candidate with the focus team.
    expect(rows[0].best.score).toBe(5);
  });

  it('ignores candidates not involving the focus team', () => {
    const candidates = [candidate('b', 'c', 10)];
    expect(rankTradePartners(candidates, 'me')).toEqual([]);
  });

  it('returns an empty list for an unknown team', () => {
    expect(rankTradePartners([candidate('me', 'b', 5)], 'nobody')).toEqual(
      [],
    );
  });

  it('keeps both directions of a pairing under one partner row', () => {
    const candidates = [candidate('me', 'b', 5), candidate('b', 'me', 7)];
    const rows = rankTradePartners(candidates, 'me');
    expect(rows).toHaveLength(1);
    expect(rows[0].candidateCount).toBe(2);
    expect(rows[0].best.score).toBe(7);
  });
});

describe('partnerDealLine', () => {
  it('frames give/get from the focus team perspective when focus is team A', () => {
    const c = candidate('me', 'b', 5, ['RB1'], ['WR1']);
    expect(partnerDealLine(c, 'me')).toEqual({ give: ['RB1'], get: ['WR1'] });
  });

  it('frames give/get from the focus team perspective when focus is team B', () => {
    const c = candidate('me', 'b', 5, ['RB1'], ['WR1']);
    expect(partnerDealLine(c, 'b')).toEqual({ give: ['WR1'], get: ['RB1'] });
  });
});
