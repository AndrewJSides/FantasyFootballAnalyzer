import { describe, expect, it } from 'vitest';
import type { WeeklyRankRow } from './weeklyRankings';
import { topFreeAgents } from './topFreeAgents';
import type { PoolPlayer } from '@/types/draft';

function row(
  id: string,
  pos: string,
  owner: string | null,
  projection: number | null = 10,
): WeeklyRankRow {
  const player = { id, name: id, pos, team: 'XX' } as PoolPlayer;
  return {
    player,
    total: null,
    games: null,
    ppg: null,
    last3: null,
    projection,
    matchup: null,
    consistency: null,
    owner,
    posRank: 1,
  };
}

describe('topFreeAgents', () => {
  it('keeps only unrostered rows, grouped by position', () => {
    const rows = [
      row('qb-free', 'QB', null),
      row('qb-owned', 'QB', 'Alpha'),
      row('rb-free', 'RB', null),
      row('k-free', 'K', null),
    ];
    const groups = topFreeAgents(rows);
    const byPos = new Map(groups.map(g => [g.position, g.rows.map(r => r.player.id)]));
    expect(byPos.get('QB')).toEqual(['qb-free']);
    expect(byPos.get('RB')).toEqual(['rb-free']);
    expect(byPos.get('WR')).toEqual([]);
    expect(byPos.get('TE')).toEqual([]);
    // K rows never enter a group.
    expect(groups.every(g => g.rows.every(r => r.player.pos === g.position))).toBe(true);
  });

  it('caps each position at perPosition, preserving engine order', () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(`rb${i}`, 'RB', null));
    const groups = topFreeAgents(rows, 3);
    expect(groups.find(g => g.position === 'RB')!.rows.map(r => r.player.id)).toEqual([
      'rb0',
      'rb1',
      'rb2',
    ]);
  });

  it('returns all four position groups even with no rows', () => {
    const groups = topFreeAgents([]);
    expect(groups.map(g => g.position)).toEqual(['QB', 'RB', 'WR', 'TE']);
    expect(groups.every(g => g.rows.length === 0)).toBe(true);
  });

  it('treats undefined owner the same as null (guest-style rows stay out of league mode)', () => {
    const rows = [row('a', 'WR', null), row('b', 'WR', 'Alpha')];
    const groups = topFreeAgents(rows);
    expect(groups.find(g => g.position === 'WR')!.rows.map(r => r.player.id)).toEqual(['a']);
  });

  it('clamps a negative perPosition to zero', () => {
    const groups = topFreeAgents([row('a', 'TE', null)], -1);
    expect(groups.find(g => g.position === 'TE')!.rows).toEqual([]);
  });
});
