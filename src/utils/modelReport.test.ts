import { describe, it, expect } from 'vitest';
import {
  summarizeModelReport,
  scoreVerdict,
  verdictLabel,
  type RawBacktestJson,
} from './modelReport';

function raw(): RawBacktestJson {
  return {
    season: 2026,
    weeks: [1, 8],
    players: 446,
    overall: { predictions: 2257, mae: 6.74, naiveMae: 6.72, bias: -0.17, within5Rate: 0.536 },
    byPosition: {
      QB: { predictions: 208, mae: 6.85, naiveMae: 6.85, bias: -0.22, within5Rate: 0.442 },
      RB: { predictions: 448, mae: 5.46, naiveMae: 5.5, bias: -0.21, within5Rate: 0.583 },
      WR: { predictions: 630, mae: 5.72, naiveMae: 5.7, bias: -0.3, within5Rate: 0.546 },
      TE: { predictions: 340, mae: 5.2, naiveMae: 5.14, bias: -0.22, within5Rate: 0.597 },
    },
    generatedAt: '2026-11-03T11:33:00.976Z',
    pricingVariants: [
      { name: 'blend 0.5, cap 5 (shipped)', overall: { mae: 7 } },
      { name: 'no term (blend 0)', overall: { mae: 6.74 } },
    ],
    tdVariants: [
      { name: 'no term (strength 0)', overall: { mae: 6.74 } },
      { name: 'strength 0.5, cap 3', overall: { mae: 6.73 } },
    ],
    usageVariants: [{ name: 'no term (strength 0)', overall: { mae: 6.74 } }],
  };
}

describe('scoreVerdict', () => {
  it('calls an equal MAE a tie, a lower MAE a lead, a higher MAE a trail', () => {
    expect(scoreVerdict(6.85, 6.85)).toBe('ties');
    expect(scoreVerdict(5.46, 5.5)).toBe('leads');
    expect(scoreVerdict(5.72, 5.7)).toBe('trails');
  });

  it('treats sub-half-hundredth gaps as ties (2dp rounding)', () => {
    expect(scoreVerdict(6.744, 6.74)).toBe('ties');
  });
});

describe('summarizeModelReport', () => {
  it('shapes the overall line and the honest verdict: model trails naive by 0.02', () => {
    const report = summarizeModelReport(raw());
    expect(report?.weekRange).toBe('Weeks 1–8');
    expect(report?.predictions).toBe(2257);
    expect(report?.maeGap).toBeCloseTo(0.02, 10);
    expect(report?.verdict).toBe('trails');
    expect(verdictLabel(report!.verdict)).toBe('Trails naive');
    expect(report?.within5Pct).toBeCloseTo(53.6, 10);
  });

  it('orders positions QB/RB/WR/TE with per-position verdicts', () => {
    const report = summarizeModelReport(raw());
    expect(report?.byPosition.map(r => r.position)).toEqual(['QB', 'RB', 'WR', 'TE']);
    expect(report?.byPosition.map(r => r.verdict)).toEqual(['ties', 'leads', 'trails', 'trails']);
  });

  it('marks the no-term variant as the production row in each family', () => {
    const report = summarizeModelReport(raw());
    expect(report?.experiments).toHaveLength(3);
    for (const family of report!.experiments) {
      expect(family.variants.filter(v => v.isProduction)).toHaveLength(1);
      expect(family.variants.find(v => v.isProduction)?.name).toMatch(/^no term/);
    }
  });

  it('returns null when the overall line is missing', () => {
    expect(summarizeModelReport({ season: 2026 })).toBeNull();
    expect(summarizeModelReport({ overall: { predictions: 0, mae: NaN, naiveMae: 1, bias: 0, within5Rate: 0 } })).toBeNull();
  });

  it('skips positions absent from the snapshot instead of crashing', () => {
    const partial = raw();
    delete partial.byPosition!.TE;
    expect(summarizeModelReport(partial)?.byPosition.map(r => r.position)).toEqual(['QB', 'RB', 'WR']);
  });
});
