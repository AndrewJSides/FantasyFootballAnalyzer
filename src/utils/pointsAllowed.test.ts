// pointsAllowed (backlog item 102): the fantasy-points-allowed board prices
// every defense per skill position from TraderApe's own bundled data.

import { describe, expect, it } from 'vitest';
import {
  ALLOWED_POSITIONS,
  allowedRead,
  allowedSubjectLabel,
  allowedTargetLabel,
  allowedYourLabel,
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

  it('covers all six positions with 32 rows each', () => {
    for (const pos of ALLOWED_POSITIONS) {
      expect(buildPointsAllowedBoard(pos).rows).toHaveLength(32);
    }
  });

  it('ranks defenses by points given to opposing kickers on the K tab', () => {
    const board = buildPointsAllowedBoard('K');
    expect(board.weeks).toEqual([1, 7]);
    expect(board.rows[0].rank).toBe(1);
    // Bundled 2026 data: IND gives the most to kickers through week 7.
    expect(board.rows[0].team).toBe('IND');
    expect(board.rows[0].avg).toBeCloseTo(10, 1);
    expect(board.rows[board.rows.length - 1].rank).toBe(32);
  });

  it('ranks offenses by points given to opposing defenses on the DST tab', () => {
    const board = buildPointsAllowedBoard('DST');
    expect(board.weeks).toEqual([1, 7]);
    expect(board.rows[0].rank).toBe(1);
    // Bundled 2026 data: ARI gives the most to opposing defenses.
    expect(board.rows[0].team).toBe('ARI');
    expect(board.rows[0].avg).toBeCloseTo(26.9, 1);
    expect(board.rows[board.rows.length - 1].rank).toBe(32);
  });
});

describe('allowedTargetLabel / allowedSubjectLabel / allowedYourLabel', () => {
  it('names kickers and opposing defenses in prose, and offenses for DST', () => {
    expect(allowedTargetLabel('QB')).toBe('QBs');
    expect(allowedTargetLabel('K')).toBe('kickers');
    expect(allowedTargetLabel('DST')).toBe('opposing defenses');
    expect(allowedSubjectLabel('QB')).toBe('defenses');
    expect(allowedSubjectLabel('DST')).toBe('offenses');
    expect(allowedYourLabel('K')).toBe('kicker');
    expect(allowedYourLabel('DST')).toBe('defense');
    expect(allowedYourLabel('TE')).toBe('TE');
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
