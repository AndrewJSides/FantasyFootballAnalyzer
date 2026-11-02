// pointsAllowed (backlog item 102): the fantasy-points-allowed board prices
// every defense per skill position from TraderApe's own bundled data.

import { describe, expect, it } from 'vitest';
import {
  ALLOWED_POSITIONS,
  allowedRead,
  buildPointsAllowedBoard,
} from './pointsAllowed';

describe('buildPointsAllowedBoard', () => {
  it('returns one row per NFL team, softest (rank 1) first', () => {
    const board = buildPointsAllowedBoard('QB');
    expect(board.rows).toHaveLength(32);
    expect(board.rows[0].rank).toBe(1);
    // Bundled 2026 data: DET allows the most to QBs through week 7.
    expect(board.rows[0].team).toBe('DET');
    expect(board.rows[0].avg).toBeCloseTo(26.3, 1);
    expect(board.rows[board.rows.length - 1].rank).toBe(32);
  });

  it('names the completed weeks that fed the averages', () => {
    const board = buildPointsAllowedBoard('TE');
    expect(board.weeks).toEqual([1, 7]);
    expect(board.position).toBe('TE');
  });

  it('covers all four skill positions with 32 rows each', () => {
    for (const pos of ALLOWED_POSITIONS) {
      expect(buildPointsAllowedBoard(pos).rows).toHaveLength(32);
    }
  });
});

describe('allowedRead', () => {
  it('uses the same <=10 / >=23 thresholds as the weekly matchup chips', () => {
    expect(allowedRead(1)).toBe('favorable');
    expect(allowedRead(10)).toBe('favorable');
    expect(allowedRead(11)).toBe('neutral');
    expect(allowedRead(22)).toBe('neutral');
    expect(allowedRead(23)).toBe('tough');
    expect(allowedRead(32)).toBe('tough');
  });
});
