import { describe, expect, it } from 'vitest';
import { boomChance, boomProbability, normalCdf } from './boomProbability';

describe('normalCdf', () => {
  it('is 0.5 at zero and symmetric in the tails', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(3)).toBeCloseTo(1 - normalCdf(-3), 8);
  });

  it('matches known quantiles', () => {
    expect(normalCdf(1.6449)).toBeCloseTo(0.95, 3);
    expect(normalCdf(-1.6449)).toBeCloseTo(0.05, 3);
    expect(normalCdf(0.6745)).toBeCloseTo(0.75, 3);
  });
});

describe('boomProbability', () => {
  it('returns null without a finite projection or stdDev', () => {
    expect(boomProbability(null, 5, 20)).toBeNull();
    expect(boomProbability(undefined, 5, 20)).toBeNull();
    expect(boomProbability(NaN, 5, 20)).toBeNull();
    expect(boomProbability(14, null, 20)).toBeNull();
    expect(boomProbability(14, undefined, 20)).toBeNull();
  });

  it('is 50% when the projection equals the boom bar', () => {
    expect(boomProbability(20, 6, 20)).toBeCloseTo(0.5, 6);
  });

  it('falls as the bar rises and rises with the projection', () => {
    const low = boomProbability(14, 6, 20)!;
    const highBar = boomProbability(14, 6, 25)!;
    const highProj = boomProbability(19, 6, 20)!;
    expect(highBar).toBeLessThan(low);
    expect(highProj).toBeGreaterThan(low);
  });

  it('stays within [0, 1]', () => {
    expect(boomProbability(30, 2, 20)).toBeLessThanOrEqual(1);
    expect(boomProbability(2, 2, 20)).toBeGreaterThanOrEqual(0);
  });

  it('collapses to the degenerate answer on zero volatility', () => {
    expect(boomProbability(21, 0, 20)).toBe(1);
    expect(boomProbability(19, 0, 20)).toBe(0);
    expect(boomProbability(20, 0, 20)).toBe(0);
  });
});

describe('boomChance', () => {
  it('uses the position boom bar (RB 20, TE 15)', () => {
    const rb = boomChance(16, 4, 'RB');
    const te = boomChance(16, 4, 'TE');
    expect(rb.boomBar).toBe(20);
    expect(te.boomBar).toBe(15);
    expect(te.probability).toBeGreaterThan(rb.probability!);
  });
});
