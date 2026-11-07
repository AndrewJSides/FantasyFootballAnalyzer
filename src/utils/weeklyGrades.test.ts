// Weekly prediction grades (backlog item 183): shaping a committed grade
// file into the summary the Model Report renders.
import { describe, it, expect } from 'vitest';
import {
  gradeReasonLabel,
  summarizeWeeklyGrade,
  type RawGradeFile,
} from './weeklyGrades';
import type { DraftPoolFile } from '@/types/draft';

const POOL = {
  season: 2026,
  generatedAt: '2026-11-06',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    {
      id: 'tyler-allgeier',
      sleeperId: '8132',
      name: 'Tyler Allgeier',
      team: 'ARI',
      pos: 'RB',
      posRank: 30,
      overallRank: 90,
      tier: 5,
      bye: 8,
      baseValue: 5,
    },
    {
      id: 'lamar-jackson',
      sleeperId: '4881',
      name: 'Lamar Jackson',
      team: 'BAL',
      pos: 'QB',
      posRank: 2,
      overallRank: 12,
      tier: 1,
      bye: 14,
      baseValue: 40,
    },
  ],
} as unknown as DraftPoolFile;

function gradeFile(overrides: Partial<RawGradeFile> = {}): RawGradeFile {
  return {
    source: 'sleeper',
    season: 2026,
    week: 8,
    graded_at: '2026-11-03T05:31:47.777Z',
    threshold: 5,
    scoring: 'pts_ppr',
    summary: {
      graded: 10,
      outperformed: 2,
      underperformed: 3,
      inLine: 5,
      meanDiff: -1.2,
      meanAbsDiff: 4.5,
      primaryReasonCounts: {
        'did-not-play': 3,
        'efficiency-down': 2,
        'td-variance': 1,
      },
      breakoutCount: 1,
      byPosition: {
        WR: {
          graded: 4,
          outperformed: 1,
          underperformed: 1,
          inLine: 2,
          meanDiff: -0.5,
          meanAbsDiff: 4.0,
        },
        QB: {
          graded: 6,
          outperformed: 1,
          underperformed: 2,
          inLine: 3,
          meanDiff: -1.5,
          meanAbsDiff: 5.0,
        },
      },
    },
    grades: [
      {
        player_id: '8132',
        predicted: 7.62,
        actual: 36.1,
        diff: 28.48,
        category: 'outperformed',
        reasons: ['usage-up', 'efficiency-up', 'td-variance'],
        primaryReason: 'efficiency-up',
      },
      {
        player_id: '4881',
        predicted: 20.37,
        actual: 0,
        diff: -20.37,
        category: 'underperformed',
        reasons: ['usage-down', 'efficiency-down'],
        primaryReason: 'usage-down',
      },
      {
        player_id: '9999',
        predicted: 12,
        actual: 25,
        diff: 13,
        category: 'outperformed',
        reasons: ['td-variance'],
        primaryReason: 'td-variance',
      },
    ],
    ...overrides,
  };
}

describe('summarizeWeeklyGrade', () => {
  it('shapes the headline numbers from the summary block', () => {
    const s = summarizeWeeklyGrade(gradeFile(), POOL);
    expect(s).not.toBeNull();
    expect(s?.week).toBe(8);
    expect(s?.graded).toBe(10);
    expect(s?.mae).toBe(4.5);
    expect(s?.bias).toBe(-1.2);
    expect(s?.within5Pct).toBe(50);
    expect(s?.outperformed).toBe(2);
    expect(s?.underperformed).toBe(3);
    expect(s?.inLine).toBe(5);
  });

  it('orders by-position rows QB/RB/WR/TE and prices the within-±5 share', () => {
    const s = summarizeWeeklyGrade(gradeFile(), POOL);
    expect(s?.byPosition.map(r => r.position)).toEqual(['QB', 'WR']);
    expect(s?.byPosition[0]).toMatchObject({ graded: 6, mae: 5.0, within5Pct: 50 });
    expect(s?.byPosition[1]).toMatchObject({ graded: 4, mae: 4.0, within5Pct: 50 });
  });

  it('ranks miss reasons by count with plain-language labels', () => {
    const s = summarizeWeeklyGrade(gradeFile(), POOL);
    expect(s?.topReasons).toEqual([
      { reason: 'did-not-play', label: 'Did not play', count: 3 },
      { reason: 'efficiency-down', label: 'Less efficient than projected', count: 2 },
      { reason: 'td-variance', label: 'Touchdown luck', count: 1 },
    ]);
  });

  it('names the biggest beats and misses from the pool, biggest first', () => {
    const s = summarizeWeeklyGrade(gradeFile(), POOL);
    expect(s?.biggestOver.map(m => m.name)).toEqual([
      'Tyler Allgeier',
      'Sleeper 9999',
    ]);
    expect(s?.biggestOver[0]).toMatchObject({
      position: 'RB',
      team: 'ARI',
      diff: 28.48,
      primaryReason: 'efficiency-up',
    });
    expect(s?.biggestUnder.map(m => m.name)).toEqual(['Lamar Jackson']);
    expect(s?.biggestUnder[0]).toMatchObject({ position: 'QB', diff: -20.37 });
  });

  it('falls back to the Sleeper id for graded players missing from the pool', () => {
    const s = summarizeWeeklyGrade(gradeFile(), POOL);
    expect(s?.biggestOver[1]?.name).toBe('Sleeper 9999');
    expect(s?.biggestOver[1]?.position).toBe('—');
  });

  it('returns null for a missing summary, an empty week, or a week of 0', () => {
    expect(summarizeWeeklyGrade(null, POOL)).toBeNull();
    expect(summarizeWeeklyGrade({}, POOL)).toBeNull();
    expect(
      summarizeWeeklyGrade(gradeFile({ summary: { graded: 0 } }), POOL),
    ).toBeNull();
    expect(summarizeWeeklyGrade(gradeFile({ week: 0 }), POOL)).toBeNull();
  });
});

describe('gradeReasonLabel', () => {
  it('labels known reasons and passes unknown ones through', () => {
    expect(gradeReasonLabel('did-not-play')).toBe('Did not play');
    expect(gradeReasonLabel('usage-up')).toBe('More usage than projected');
    expect(gradeReasonLabel(null)).toBe('—');
    expect(gradeReasonLabel('something-new')).toBe('something-new');
  });
});
