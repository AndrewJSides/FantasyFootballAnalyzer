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

describe('position splits', () => {
  const posOf = (id: string): 'QB' | 'RB' | 'WR' | 'TE' | undefined => {
    const map: Record<string, 'QB' | 'RB' | 'WR' | 'TE'> = {
      rb1: 'RB',
      rb2: 'RB',
      wr1: 'WR',
      qb1: 'QB',
    };
    return map[id];
  };

  it('splits a summary by position with a resolver', () => {
    const grades = [
      gradePlayer('rb1', 10, 20, { targets: 5, yards: 60 }, { targets: 10, yards: 150 }), // outperformed, usage-up
      gradePlayer('rb2', 20, 10, { targets: 10, yards: 150 }, {}), // underperformed, did-not-play
      gradePlayer('wr1', 10, 12, {}, { targets: 5, yards: 60 }), // in-line
      gradePlayer('mystery', 10, 20, { targets: 5, yards: 60 }, { targets: 10, yards: 150 }), // unknown position
    ];
    const s = summarize(grades, 0, posOf);
    expect(s.graded).toBe(4);
    expect(s.byPosition?.RB?.graded).toBe(2);
    expect(s.byPosition?.RB?.outperformed).toBe(1);
    expect(s.byPosition?.RB?.underperformed).toBe(1);
    expect(s.byPosition?.RB?.primaryReasonCounts['usage-up']).toBe(1);
    expect(s.byPosition?.RB?.primaryReasonCounts['did-not-play']).toBe(1);
    expect(s.byPosition?.WR?.graded).toBe(1);
    expect(s.byPosition?.WR?.inLine).toBe(1);
    expect(s.byPosition?.QB).toBeUndefined();
    expect(s.byPosition?.RB?.breakoutCount).toBe(0); // breakouts are league-wide only
    expect(s.byPosition?.RB?.byPosition).toBeUndefined(); // depth 1
  });

  it('omits byPosition when no resolver is given', () => {
    const s = summarize([gradePlayer('rb1', 10, 20, {}, { targets: 10, yards: 150 })], 0);
    expect(s.byPosition).toBeUndefined();
  });

  it('omits byPosition when the resolver knows nobody', () => {
    const s = summarize(
      [gradePlayer('rb1', 10, 20, {}, { targets: 10, yards: 150 })],
      0,
      () => undefined,
    );
    expect(s.byPosition).toBeUndefined();
  });

  it('rolls per-position factors up across weeks', () => {
    const weekA = summarize(
      [
        gradePlayer('rb1', 10, 20, { targets: 5, yards: 60 }, { targets: 10, yards: 150 }),
        gradePlayer('wr1', 10, 20, { targets: 5, yards: 60 }, { targets: 10, yards: 150 }),
      ],
      0,
      posOf,
    );
    const weekB = summarize(
      [gradePlayer('qb1', 20, 10, { targets: 10, yards: 150 }, {})],
      0,
      posOf,
    );
    const f = aggregateFactors([weekA, weekB]);
    expect(f.playersGraded).toBe(3);
    expect(f.byPosition?.RB?.playersGraded).toBe(1);
    expect(f.byPosition?.RB?.missShare).toBe(1);
    expect(f.byPosition?.RB?.usageDrivenMissShare).toBe(1);
    expect(f.byPosition?.WR?.playersGraded).toBe(1);
    expect(f.byPosition?.QB?.playersGraded).toBe(1);
    expect(f.byPosition?.QB?.didNotPlayMissShare).toBe(1);
    expect(f.byPosition?.TE).toBeUndefined();
    expect(f.byPosition?.RB?.byPosition).toBeUndefined(); // no nesting
  });

  it('omits byPosition on factors when no week carried splits', () => {
    const s = summarize([gradePlayer('1', 10, 20, {}, { targets: 10, yards: 150 })], 0);
    const f = aggregateFactors([s]);
    expect(f.byPosition).toBeUndefined();
  });
});
