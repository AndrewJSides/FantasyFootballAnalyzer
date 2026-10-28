import { describe, it, expect } from 'vitest';
import {
  categorize,
  gradePlayer,
  attributeReasons,
  summarize,
  aggregateFactors,
} from './predictionGrading';

describe('categorize', () => {
  it('uses a ±5 point band', () => {
    expect(categorize(5)).toBe('in-line');
    expect(categorize(-5)).toBe('in-line');
    expect(categorize(5.01)).toBe('outperformed');
    expect(categorize(-5.01)).toBe('underperformed');
    expect(categorize(0)).toBe('in-line');
  });
});

describe('gradePlayer', () => {
  const proj = { targets: 8, carries: 2, yards: 100, touchdowns: 1 };

  it('grades an outperformed player with a usage reason', () => {
    const g = gradePlayer('1', 12, 20, proj, {
      targets: 14,
      carries: 4,
      yards: 160,
      touchdowns: 2,
    });
    expect(g.category).toBe('outperformed');
    expect(g.diff).toBe(8);
    expect(g.primaryReason).toBe('usage-up');
  });

  it('grades an underperformed player who did not play', () => {
    const g = gradePlayer('2', 15, null, proj, {});
    expect(g.category).toBe('underperformed');
    expect(g.primaryReason).toBe('did-not-play');
  });

  it('leaves in-line players reasonless', () => {
    const g = gradePlayer('3', 12, 14, proj, {
      targets: 8,
      carries: 2,
      yards: 105,
      touchdowns: 1,
    });
    expect(g.category).toBe('in-line');
    expect(g.reasons).toEqual([]);
    expect(g.primaryReason).toBeNull();
  });

  it('tags TD variance when touchdowns swing a full TD', () => {
    const { reasons } = attributeReasons(proj, {
      targets: 8,
      carries: 2,
      yards: 100,
      touchdowns: 3,
    }, false);
    expect(reasons).toContain('td-variance');
  });
});

describe('summarize / aggregateFactors', () => {
  it('counts categories and averages diffs', () => {
    const grades = [
      gradePlayer('1', 10, 20, {}, { targets: 10, yards: 150 }),
      gradePlayer('2', 20, 10, { targets: 10, yards: 150 }, {}),
      gradePlayer('3', 10, 12, {}, { targets: 5, yards: 60 }),
    ];
    const s = summarize(grades, 2);
    expect(s.graded).toBe(3);
    expect(s.outperformed).toBe(1);
    expect(s.underperformed).toBe(1);
    expect(s.inLine).toBe(1);
    expect(s.breakoutCount).toBe(2);
    expect(s.meanAbsDiff).toBeCloseTo((10 + 10 + 2) / 3, 2);
  });

  it('aggregates miss shares across weeks', () => {
    const s = summarize(
      [
        gradePlayer('1', 10, 20, { targets: 5, yards: 60 }, { targets: 10, yards: 150 }),
      ],
      0,
    );
    const f = aggregateFactors([s]);
    expect(f.weeksGraded).toBe(1);
    expect(f.missShare).toBe(1);
    expect(f.usageDrivenMissShare).toBe(1);
  });
});
