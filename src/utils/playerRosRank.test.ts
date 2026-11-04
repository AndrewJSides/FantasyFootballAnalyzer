import { describe, expect, it } from 'vitest';
import type { PoolPlayer } from '@/types/draft';
import type { SeasonOutlook } from './seasonOutlook';
import type { RosRow } from './rosRankings';
import { findPlayerRosRow, rosRankDetail, rosRankLabel } from './playerRosRank';

function outlook(points: number): SeasonOutlook {
  return {
    final: false,
    soFar: 0,
    missedWeeks: 0,
    missedPoints: 0,
    byeKnown: true,
    remainingWeeks: 8,
    outWeeks: 0,
    projectedGames: 8,
    projectedPoints: points,
    replacementPerWeek: 0,
    basis: 'blend',
    total: points,
  };
}

function row(
  over: Partial<PoolPlayer> & { posRank: number; points: number },
): RosRow {
  const { posRank, points, ...player } = over;
  return {
    player: {
      id: 'p',
      name: 'Test Player',
      team: 'KC',
      pos: 'RB',
      posRank: 1,
      overallRank: 1,
      tier: 1,
      bye: 8,
      baseValue: null,
      ...player,
    } as PoolPlayer,
    outlook: outlook(points),
    owner: null,
    posRank,
  };
}

const ROWS: RosRow[] = [
  row({ id: 'rb1', name: 'James Cook', team: 'BUF', pos: 'RB', posRank: 4, points: 148.3 }),
  row({ id: 'rb2', name: 'James Cook', team: 'FAKE', pos: 'RB', posRank: 40, points: 60.0 }),
  row({ id: 'wr1', name: 'James Cook', team: 'BUF', pos: 'WR', posRank: 90, points: 20.0 }),
];

describe('findPlayerRosRow', () => {
  it('matches by normalized name and breaks the same-name tie by team', () => {
    const found = findPlayerRosRow(ROWS, {
      name: 'James Cook',
      position: 'RB',
      team: 'BUF',
    });
    expect(found?.player.id).toBe('rb1');
    expect(found?.posRank).toBe(4);
  });

  it('ignores name suffixes and punctuation', () => {
    const found = findPlayerRosRow(ROWS, {
      name: 'James Cook III',
      position: 'RB',
      team: 'BUF',
    });
    expect(found?.player.id).toBe('rb1');
  });

  it('never returns a same-name player at another position', () => {
    const found = findPlayerRosRow(ROWS, {
      name: 'James Cook',
      position: 'TE',
      team: 'BUF',
    });
    expect(found).toBeNull();
  });

  it('returns null when no row matches the name', () => {
    expect(
      findPlayerRosRow(ROWS, { name: 'Nobody Here', position: 'RB', team: 'KC' }),
    ).toBeNull();
  });

  it('returns null on an unresolvable same-name same-position tie', () => {
    const tied: RosRow[] = [
      row({ id: 'a', name: 'Sam Darnold', team: 'SEA', pos: 'QB', posRank: 10, points: 100 }),
      row({ id: 'b', name: 'Sam Darnold', team: 'MIN', pos: 'QB', posRank: 11, points: 99 }),
    ];
    expect(
      findPlayerRosRow(tied, { name: 'Sam Darnold', position: 'QB', team: 'FAKE' }),
    ).toBeNull();
  });
});

describe('rosRankLabel / rosRankDetail', () => {
  it('labels the rank and details the projection window', () => {
    const r = ROWS[0];
    expect(rosRankLabel(r)).toBe('RB4');
    expect(rosRankDetail(r, 10)).toBe(
      'Projected 148.3 points from week 10 through week 17, ranked 4 among RBs',
    );
  });
});
