// Dynasty Rankings (backlog item 177): age curve shape, dynasty-value
// pricing, and ranking order / redraft delta / owner attachment.

import { describe, it, expect } from 'vitest';
import {
  ageFactor,
  dynastyValue,
  buildDynastyRankings,
} from './dynastyValue';
import type { PoolPlayer } from '@/types/draft';

describe('ageFactor', () => {
  it('holds peak ages at full value', () => {
    expect(ageFactor('RB', 24)).toBe(1);
    expect(ageFactor('WR', 26)).toBe(1);
    expect(ageFactor('QB', 29)).toBe(1);
    expect(ageFactor('TE', 25)).toBe(1);
  });

  it('ramps the youngest players up toward the peak', () => {
    expect(ageFactor('WR', 20)).toBe(0.9);
    expect(ageFactor('WR', 22)).toBe(0.95);
  });

  it('declines past the peak window, RB fastest', () => {
    expect(ageFactor('RB', 27)).toBe(0.75);
    expect(ageFactor('RB', 29)).toBe(0.5);
    expect(ageFactor('RB', 31)).toBe(0.25);
    expect(ageFactor('WR', 30)).toBe(0.8);
    expect(ageFactor('QB', 34)).toBe(0.8);
  });

  it('floors at the oldest control point', () => {
    expect(ageFactor('RB', 40)).toBe(0.25);
    expect(ageFactor('QB', 45)).toBe(0.35);
  });

  it('prices unknown ages and unknown positions neutrally', () => {
    expect(ageFactor('RB', null)).toBe(1);
    expect(ageFactor('RB', undefined)).toBe(1);
    expect(ageFactor('K', 30)).toBe(1);
  });
});

describe('dynastyValue', () => {
  it('prices projection through the age factor', () => {
    expect(dynastyValue(300, 'RB', 24)).toBe(300);
    expect(dynastyValue(300, 'RB', 29)).toBe(150);
    expect(dynastyValue(300, 'RB', null)).toBe(300);
  });
});

function pl(
  id: string,
  name: string,
  pos: string,
  projPtsPpr: number,
  overallRank: number,
  sleeperId?: string,
  posRank = 1,
): PoolPlayer {
  return {
    id,
    name,
    team: 'DAL',
    pos,
    posRank,
    overallRank,
    tier: 1,
    bye: 7,
    baseValue: null,
    projPtsPpr,
    sleeperId,
  } as PoolPlayer;
}

const players = [
  pl('young-rb', 'Young Back', 'RB', 280, 8, 's-young', 3),
  pl('old-rb', 'Old Back', 'RB', 280, 9, 's-old', 4),
  pl('young-wr', 'Young Receiver', 'WR', 260, 15, 's-wr', 5),
  pl('kicker', 'Some Kicker', 'K', 140, 200, 's-k', 1),
  pl('no-proj', 'No Projection', 'WR', 0, 300, 's-np', 6),
  pl('no-age', 'No Age', 'WR', 250, 20, undefined, 7),
];

const ages = { 's-young': 23, 's-old': 29, 's-wr': 22, 's-k': 30, 's-np': 24 };

describe('buildDynastyRankings', () => {
  it('ranks by age-adjusted value, so the young RB beats the old RB on equal projections', () => {
    const rows = buildDynastyRankings({ poolPlayers: players, agesBySleeperId: ages });
    expect(rows.map(r => r.player.id)).toEqual([
      'young-rb',
      'no-age',
      'young-wr',
      'old-rb',
    ]);
    expect(rows[0].value).toBe(280);
    expect(rows[0].dynastyRank).toBe(1);
    expect(rows[0].rankDelta).toBe(8 - 1);
    // Unknown age prices neutrally at the raw projection.
    expect(rows[1].value).toBe(250);
    // The 22-year-old WR ramps up to the peak: 260 × 0.95.
    expect(rows[2].value).toBe(247);
    // The old RB's 280 prices down to 140 at the age-29 factor of 0.5.
    expect(rows[3].value).toBe(140);
    expect(rows[3].rankDelta).toBe(9 - 4);
  });

  it('excludes kickers and unprojected players', () => {
    const rows = buildDynastyRankings({ poolPlayers: players, agesBySleeperId: ages });
    expect(rows.some(r => r.player.pos === 'K')).toBe(false);
    expect(rows.some(r => r.player.id === 'no-proj')).toBe(false);
  });

  it('shows a dash age and a neutral factor when the age is unknown', () => {
    const rows = buildDynastyRankings({ poolPlayers: players, agesBySleeperId: ages });
    const row = rows.find(r => r.player.id === 'no-age');
    expect(row?.age).toBeNull();
    expect(row?.value).toBe(250);
  });

  it('attaches the owning team where the league map names one', () => {
    const rows = buildDynastyRankings({
      poolPlayers: players,
      agesBySleeperId: ages,
      teamByPoolId: new Map([['young-rb', 'The Champs']]),
    });
    expect(rows[0].rosteredBy).toBe('The Champs');
    expect(rows[1].rosteredBy).toBeNull();
  });

  it('caps the board at the limit', () => {
    const rows = buildDynastyRankings({
      poolPlayers: players,
      agesBySleeperId: ages,
      limit: 2,
    });
    expect(rows).toHaveLength(2);
  });

  it('ranks a single position against the redraft position rank', () => {
    const rows = buildDynastyRankings({
      poolPlayers: players,
      agesBySleeperId: ages,
      positions: ['RB'],
    });
    expect(rows.map(r => r.player.id)).toEqual(['young-rb', 'old-rb']);
    expect(rows[0].redraftRank).toBe(3);
    expect(rows[0].rankDelta).toBe(3 - 1);
    expect(rows[1].redraftRank).toBe(4);
    expect(rows[1].rankDelta).toBe(4 - 2);
  });
});
