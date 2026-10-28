import { describe, expect, it } from 'vitest';
import {
  aggregateBacktests,
  backtestPlayer,
  summarize,
} from './projectionBacktest';

const w = (week: number, pts: number) => ({ week, pts });

describe('backtestPlayer', () => {
  it('scores nothing with fewer than 2 weeks', () => {
    expect(backtestPlayer('p1', [w(1, 10)]).predictions).toHaveLength(0);
    expect(backtestPlayer('p1', []).summary.predictions).toBe(0);
  });

  it('never peeks at the week being scored', () => {
    // Week 3 actual (30) must not leak into its own projection: with only
    // weeks 1–2 (both 10) as history, the projection is 10, not pulled up.
    const r = backtestPlayer('p1', [w(1, 10), w(2, 10), w(3, 30)]);
    const week3 = r.predictions.find(p => p.week === 3)!;
    expect(week3.predicted).toBe(10);
    expect(week3.actual).toBe(30);
    expect(week3.error).toBe(-20);
    expect(week3.within5).toBe(false);
  });

  it('a steady player backtests near-perfect', () => {
    const r = backtestPlayer('p1', [w(1, 10), w(2, 10), w(3, 10), w(4, 10)]);
    expect(r.summary).toMatchObject({ predictions: 3, mae: 0, within5Rate: 1 });
  });

  it('naive baseline is the plain prior mean', () => {
    const r = backtestPlayer('p1', [w(1, 0), w(2, 20), w(3, 10)]);
    const week3 = r.predictions.find(p => p.week === 3)!;
    expect(week3.naive).toBe(10);
  });
});

describe('summarize / aggregateBacktests', () => {
  it('empty input summarizes to zeros', () => {
    expect(summarize([])).toMatchObject({ predictions: 0, mae: 0 });
    expect(aggregateBacktests([]).predictions).toBe(0);
  });

  it('pools predictions across players', () => {
    const a = backtestPlayer('a', [w(1, 10), w(2, 10)]);
    const b = backtestPlayer('b', [w(1, 20), w(2, 26)]);
    const agg = aggregateBacktests([a, b]);
    expect(agg.predictions).toBe(2);
    // Model: 10 vs 10 (err 0), 20 vs 26 (err -6) → MAE 3.
    expect(agg.mae).toBe(3);
    expect(agg.within5Rate).toBe(0.5);
  });
});
