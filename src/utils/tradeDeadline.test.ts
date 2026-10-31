import { describe, expect, it } from 'vitest';

import type { League, Team } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import type { PlayoffRaceEntry } from './playoffOdds';
import type { TradeCandidate } from './tradeFinder';
import {
  deadlineStances,
  deadlineDeals,
  CONTENDER_CUTOFF,
  PRETENDER_CUTOFF,
} from './tradeDeadline';

const team = (id: string, name: string): Team => ({ id, name });

const entry = (teamId: string, playoffProb: number, playoffStatus: PlayoffRaceEntry['playoffStatus'] = 'alive'): PlayoffRaceEntry =>
  ({
    teamId,
    teamName: teamId,
    wins: 0,
    losses: 0,
    ties: 0,
    remaining: [],
    sos: 0,
    sosRank: 1,
    playoffProb,
    projectedWins: 0,
    projectedLosses: 0,
    projectedSeed: 1,
    playoffStatus,
    championProb: 0,
    roundProbs: [],
  }) as PlayoffRaceEntry;

const poolPlayer = (id: string, name: string, pos = 'RB'): PoolPlayer =>
  ({ id, name, pos }) as PoolPlayer;

const candidate = (teamA: Team, teamB: Team, aGives: PoolPlayer[], bGives: PoolPlayer[]): TradeCandidate =>
  ({
    teamA,
    teamB,
    aGives,
    bGives,
    analysis: {},
    reasons: ['reason'],
    score: 1,
  }) as TradeCandidate;

describe('deadlineStances', () => {
  const league = { teams: [team('a', 'A'), team('b', 'B'), team('c', 'C'), team('d', 'D')] } as League;

  it('classifies by the contender/pretender cutoffs', () => {
    const stances = deadlineStances(league, [
      entry('a', CONTENDER_CUTOFF),
      entry('b', CONTENDER_CUTOFF - 1),
      entry('c', PRETENDER_CUTOFF),
      entry('d', PRETENDER_CUTOFF - 1),
    ]);
    expect(stances.find(s => s.team.id === 'a')).toMatchObject({ tier: 'contender', stance: 'buy' });
    expect(stances.find(s => s.team.id === 'b')).toMatchObject({ tier: 'bubble', stance: 'hold' });
    expect(stances.find(s => s.team.id === 'c')).toMatchObject({ tier: 'bubble', stance: 'hold' });
    expect(stances.find(s => s.team.id === 'd')).toMatchObject({ tier: 'pretender', stance: 'sell' });
  });

  it('honors clinched/eliminated model verdicts over the cutoffs', () => {
    const stances = deadlineStances(league, [
      entry('a', 10, 'clinched'),
      entry('d', 30, 'eliminated'),
    ]);
    expect(stances.find(s => s.team.id === 'a')).toMatchObject({ tier: 'contender', stance: 'buy' });
    expect(stances.find(s => s.team.id === 'd')).toMatchObject({ tier: 'pretender', stance: 'sell' });
  });

  it('degrades teams with no race entry to pretender/sell at 0%', () => {
    const stances = deadlineStances(league, []);
    expect(stances).toHaveLength(4);
    expect(stances[0]).toMatchObject({ tier: 'pretender', stance: 'sell', playoffProb: 0 });
  });

  it('writes a posture rationale naming the model verdict', () => {
    const stances = deadlineStances(league, [entry('a', 75)]);
    const a = stances.find(s => s.team.id === 'a')!;
    expect(a.rationale).toContain('75%');
  });
});

describe('deadlineDeals', () => {
  const a = team('a', 'Contender');
  const b = team('b', 'Pretender');
  const c = team('c', 'Bubble');
  const p1 = poolPlayer('p1', 'Win Now');
  const p2 = poolPlayer('p2', 'Future Value');

  const stancesOf = () =>
    deadlineStances({ teams: [a, b, c] } as League, [
      entry('a', 80),
      entry('b', 5),
      entry('c', 30),
    ]);

  it('keeps only contender↔pretender pairs and names the win-now side', () => {
    const stances = stancesOf();
    const deals = deadlineDeals(
      [
        candidate(a, b, [p2], [p1]), // contender A gives p2, receives p1
        candidate(a, c, [p2], [p1]), // contender↔bubble: dropped
        candidate(b, c, [p2], [p1]), // pretender↔bubble: dropped
      ],
      stances,
    );
    expect(deals).toHaveLength(1);
    expect(deals[0].contender).toBe(a);
    expect(deals[0].pretender).toBe(b);
    expect(deals[0].contenderReceives).toEqual([p1]);
    expect(deals[0].pretenderReceives).toEqual([p2]);
    expect(deals[0].framing).toContain('Contender');
  });

  it('frames the direction when the pretender is teamA', () => {
    const stances = stancesOf();
    // Pretender b (teamA) gives p1; contender a (teamB) gives p2 and
    // receives p1 — the win-now package.
    const deals = deadlineDeals([candidate(b, a, [p1], [p2])], stances);
    expect(deals).toHaveLength(1);
    expect(deals[0].contender).toBe(a);
    expect(deals[0].contenderReceives).toEqual([p1]);
    expect(deals[0].pretenderReceives).toEqual([p2]);
  });

  it('caps at maxDeals and skips pairs with missing stances', () => {
    const stances = stancesOf();
    const many = Array.from({ length: 10 }, (_, i) =>
      candidate(a, b, [poolPlayer(`x${i}`, `X${i}`)], [poolPlayer(`y${i}`, `Y${i}`)]),
    );
    expect(deadlineDeals(many, stances, 3)).toHaveLength(3);
    expect(deadlineDeals([candidate(a, team('zz', 'Ghost'), [p1], [p2])], stances)).toHaveLength(0);
  });
});
