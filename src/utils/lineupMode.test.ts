// lineupMode: floor/ceiling lineup modes for the Start/Sit optimizer.

import { describe, it, expect } from 'vitest';
import type { Player } from '@/types';
import type { ScoredPlayer } from '@/utils/rosterScoring';
import {
  modeScore,
  modeScoreUnit,
  modeSlotVerb,
  modeStdDev,
  modeTotalUnit,
} from './lineupMode';

function scored(partial: Partial<ScoredPlayer>): ScoredPlayer {
  return {
    id: 'p1',
    name: 'P1',
    position: 'WR',
    score: 0,
    player: { id: 'p1', name: 'P1' } as Player,
    nflTeam: 'KC',
    ppg: null,
    last3: null,
    projection: null,
    stdDev: null,
    bye: null,
    onBye: false,
    matchup: null,
    ...partial,
  } as ScoredPlayer;
}

describe('modeScore', () => {
  it('balanced mode scores on the projection, unchanged', () => {
    const s = scored({ projection: { projection: 14.2 } as ScoredPlayer['projection'] });
    expect(modeScore(s, 'balanced')).toBe(14.2);
  });

  it('balanced mode falls back to ppg without a projection', () => {
    expect(modeScore(scored({ ppg: 9.5 }), 'balanced')).toBe(9.5);
  });

  it('ceiling adds 0.6745σ from the player\u2019s own std dev', () => {
    const s = scored({
      projection: { projection: 12 } as ScoredPlayer['projection'],
      stdDev: 8,
    });
    // 12 + 0.6745 * 8 = 17.396 → 17.4
    expect(modeScore(s, 'ceiling')).toBe(17.4);
  });

  it('floor subtracts 0.6745σ, symmetric around the projection', () => {
    const s = scored({
      projection: { projection: 12 } as ScoredPlayer['projection'],
      stdDev: 8,
    });
    // 12 − 0.6745 * 8 = 6.604 → 6.6
    expect(modeScore(s, 'floor')).toBe(6.6);
  });

  it('volatile players outrank steady ones in ceiling mode and lose in floor mode', () => {
    const steady = scored({
      projection: { projection: 10 } as ScoredPlayer['projection'],
      stdDev: 1,
    });
    const boomBust = scored({
      projection: { projection: 10 } as ScoredPlayer['projection'],
      stdDev: 9,
    });
    expect(modeScore(boomBust, 'ceiling')).toBeGreaterThan(modeScore(steady, 'ceiling'));
    expect(modeScore(boomBust, 'floor')).toBeLessThan(modeScore(steady, 'floor'));
  });

  it('uses the 45%-of-mean fallback when std dev is missing', () => {
    const s = scored({ projection: { projection: 20 } as ScoredPlayer['projection'] });
    // fallback = max(3, 0.45 * 20) = 9; 20 + 0.6745 * 9 = 26.0705 → 26.1
    expect(modeScore(s, 'ceiling')).toBe(26.1);
  });

  it('modeStdDev floors the fallback at 3 for low-mean players', () => {
    const s = scored({ stdDev: null });
    expect(modeStdDev(s, 2)).toBe(3);
  });
});

describe('mode labels', () => {
  it('units name the mode-adjusted basis', () => {
    expect(modeScoreUnit('ceiling', true)).toBe('ceiling pts');
    expect(modeScoreUnit('floor', true)).toBe('floor pts');
    expect(modeScoreUnit('balanced', true)).toBe('projected pts');
    expect(modeScoreUnit('balanced', false)).toBe('pts/game');
  });

  it('slot verbs and total units read correctly', () => {
    expect(modeSlotVerb('ceiling')).toBe('ceiling');
    expect(modeSlotVerb('floor')).toBe('floor');
    expect(modeTotalUnit('ceiling')).toBe('P75 ceiling points');
    expect(modeTotalUnit('floor')).toBe('P25 floor points');
    expect(modeTotalUnit('balanced')).toBe('projected points');
  });
});
