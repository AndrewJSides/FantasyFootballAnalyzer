import { describe, expect, it } from 'vitest';
import { projectWeeklyPoints, projectionReason } from './weeklyProjection';

const w = (week: number, pts: number) => ({ week, pts });

describe('projectWeeklyPoints', () => {
  it('returns null with no completed weeks', () => {
    expect(projectWeeklyPoints([])).toBeNull();
  });

  it('a steady player projects at his average', () => {
    const p = projectWeeklyPoints([w(1, 10), w(2, 10), w(3, 10), w(4, 10)]);
    expect(p).toMatchObject({ projection: 10, baseline: 10, form: 10, trend: 'steady', weeksUsed: 4 });
  });

  it('a hot player projects above his baseline but below his form', () => {
    // Form: (20*4 + 5*3 + 5*2 + 5*1) / 10 = 11; baseline 8.8; blend 0.65/0.35 = 10.2.
    const p = projectWeeklyPoints([w(1, 5), w(2, 5), w(3, 5), w(4, 20)]);
    expect(p).toMatchObject({ projection: 10.2, baseline: 8.8, form: 11, trend: 'hot' });
    expect(p!.projection).toBeGreaterThan(p!.baseline);
    expect(p!.projection).toBeLessThan(p!.form);
  });

  it('a cooling player projects below his baseline but above his form', () => {
    // Form: (5*4 + 5*3 + 20*2 + 20*1) / 10 = 9.5; baseline 12.5; blend = 10.6.
    const p = projectWeeklyPoints([w(1, 20), w(2, 20), w(3, 5), w(4, 5)]);
    expect(p).toMatchObject({ projection: 10.6, baseline: 12.5, form: 9.5, trend: 'cooling' });
  });

  it('form uses only the last 4 weeks', () => {
    // Last 4: 1, 10, 10, 10 -> form (10*4 + 10*3 + 10*2 + 1*1) / 10 = 9.1.
    const p = projectWeeklyPoints([w(1, 1), w(2, 1), w(3, 1), w(4, 10), w(5, 10), w(6, 10)]);
    expect(p).toMatchObject({ form: 9.1, baseline: 5.5, weeksUsed: 6 });
  });

  it('a one-week player leans on his baseline, not his single week', () => {
    const p = projectWeeklyPoints([w(1, 18)]);
    expect(p).toMatchObject({ projection: 18, form: 18, baseline: 18, weeksUsed: 1 });
    expect(projectionReason(p!)).toContain('only 1 game so far');
  });

  it('games played overrides the week count for the baseline', () => {
    // Two scored weeks, four games played: baseline 20/4 = 5, form 10,
    // blend weight 0.4 -> 7.
    const p = projectWeeklyPoints([w(1, 10), w(2, 10)], 4);
    expect(p).toMatchObject({ baseline: 5, form: 10, projection: 7, games: 4 });
  });

  it('ignores non-finite entries', () => {
    const p = projectWeeklyPoints([w(1, 10), { week: NaN, pts: 99 }]);
    expect(p).toMatchObject({ weeksUsed: 1, projection: 10 });
  });
});

describe('projectWeeklyPoints TD regression', () => {
  const wt = (week: number, pts: number, tdPts: number) => ({ week, pts, tdPts });

  it('regresses a TD-inflated recent form down', () => {
    // Flat 10-pt weeks; TD points spike in week 4 only: form TD 4.8 vs
    // season TD 3, gap 1.8, strength 0.5 -> -0.9.
    const p = projectWeeklyPoints(
      [wt(1, 10, 0), wt(2, 10, 0), wt(3, 10, 0), wt(4, 10, 12)],
      null,
      null,
      { strength: 0.5, cap: 5 },
    );
    expect(p).toMatchObject({ projection: 9.1, tdAdjustment: -0.9 });
    expect(projectionReason(p!)).toContain('TD regression adjusts it -0.9 pts');
  });

  it('regresses a TD-starved recent form up', () => {
    // TD points dry up in weeks 2–4: form TD 1.2 vs season TD 3,
    // gap -1.8, strength 0.5 -> +0.9.
    const p = projectWeeklyPoints(
      [wt(1, 10, 12), wt(2, 10, 0), wt(3, 10, 0), wt(4, 10, 0)],
      null,
      null,
      { strength: 0.5, cap: 5 },
    );
    expect(p).toMatchObject({ projection: 10.9, tdAdjustment: 0.9 });
  });

  it('caps the TD swing', () => {
    // Gap 4.5 at strength 1, capped at 3.
    const p = projectWeeklyPoints(
      [wt(1, 10, 0), wt(2, 10, 0), wt(3, 10, 0), wt(4, 10, 30)],
      null,
      null,
      { strength: 1, cap: 3 },
    );
    expect(p).toMatchObject({ projection: 7, tdAdjustment: -3 });
  });

  it('skips the term when any week lacks TD points', () => {
    const p = projectWeeklyPoints(
      [wt(1, 10, 0), wt(2, 10, 0), { week: 3, pts: 10 }, wt(4, 10, 12)],
      null,
      null,
      { strength: 0.5, cap: 5 },
    );
    expect(p).toMatchObject({ projection: 10, tdAdjustment: 0 });
  });

  it('strength 0 leaves the projection untouched', () => {
    const p = projectWeeklyPoints(
      [wt(1, 10, 0), wt(2, 10, 0), wt(3, 10, 0), wt(4, 10, 12)],
      null,
      null,
      { strength: 0, cap: 5 },
    );
    expect(p).toMatchObject({ projection: 10, tdAdjustment: 0 });
    expect(projectionReason(p!)).not.toContain('TD regression');
  });
});

describe('projectionReason', () => {
  it('names the trend and both numbers', () => {
    const p = projectWeeklyPoints([w(1, 5), w(2, 5), w(3, 5), w(4, 20)])!;
    expect(projectionReason(p)).toBe('Hot form — last-4 avg 11 vs 8.8 season avg.');
  });

  it('appends the matchup adjustment when one exists', () => {
    const p = projectWeeklyPoints(
      [w(1, 5), w(2, 5), w(3, 5), w(4, 20)],
      null,
      { avgAllowed: 25, leagueAverage: 20, pricing: { blend: 0.5, cap: 5 } },
    )!;
    expect(p.matchupAdjustment).toBe(2.5);
    expect(p.projection).toBe(12.7);
    expect(projectionReason(p, 'DAL')).toBe(
      'Hot form — last-4 avg 11 vs 8.8 season avg. Matchup vs DAL adjusts it +2.5 pts.',
    );
  });

  it('keeps the old reason wording when there is no matchup context', () => {
    const p = projectWeeklyPoints([w(1, 10), w(2, 10), w(3, 10), w(4, 10)], null, null)!;
    expect(p.matchupAdjustment).toBe(0);
    expect(projectionReason(p, 'DAL')).toBe('Steady form — last-4 avg 10 vs 10 season avg.');
  });

  it('caps the matchup swing and regresses to the mean', () => {
    // Opponent allows 40 pts/game to the position against a 20-pt league
    // average: half the gap would be +10, capped at +5.
    const p = projectWeeklyPoints(
      [w(1, 10), w(2, 10), w(3, 10), w(4, 10)],
      null,
      { avgAllowed: 40, leagueAverage: 20, pricing: { blend: 0.5, cap: 5 } },
    )!;
    expect(p.matchupAdjustment).toBe(5);
    expect(p.projection).toBe(15);
    // And the drag direction works symmetrically.
    const q = projectWeeklyPoints(
      [w(1, 10), w(2, 10), w(3, 10), w(4, 10)],
      null,
      { avgAllowed: 10, leagueAverage: 20, pricing: { blend: 0.5, cap: 5 } },
    )!;
    expect(q.matchupAdjustment).toBe(-5);
    expect(projectionReason(q, 'NYJ')).toContain('Matchup vs NYJ adjusts it -5 pts.');
  });

  it('ignores non-finite matchup inputs', () => {
    const p = projectWeeklyPoints(
      [w(1, 10), w(2, 10), w(3, 10), w(4, 10)],
      null,
      { avgAllowed: NaN, leagueAverage: 20 },
    )!;
    expect(p).toMatchObject({ matchupAdjustment: 0, projection: 10 });
  });

  it('a per-context pricing override re-prices the blend and cap', () => {
    // 4-pt gap at blend 0.25 -> +1, no cap hit.
    const p = projectWeeklyPoints(
      [w(1, 10), w(2, 10), w(3, 10), w(4, 10)],
      null,
      { avgAllowed: 24, leagueAverage: 20, pricing: { blend: 0.25, cap: 5 } },
    )!;
    expect(p.matchupAdjustment).toBe(1);
    expect(p.projection).toBe(11);
    // 20-pt gap at blend 0.5 would be +10, but the override caps it at 3.
    const q = projectWeeklyPoints(
      [w(1, 10), w(2, 10), w(3, 10), w(4, 10)],
      null,
      { avgAllowed: 40, leagueAverage: 20, pricing: { blend: 0.5, cap: 3 } },
    )!;
    expect(q.matchupAdjustment).toBe(3);
    expect(q.projection).toBe(13);
  });

  it('blend 0 removes the term entirely', () => {
    const p = projectWeeklyPoints(
      [w(1, 10), w(2, 10), w(3, 10), w(4, 10)],
      null,
      { avgAllowed: 40, leagueAverage: 20, pricing: { blend: 0, cap: 5 } },
    )!;
    expect(p).toMatchObject({ matchupAdjustment: 0, projection: 10 });
    expect(projectionReason(p, 'DAL')).not.toContain('Matchup');
  });

  it('minSampleWeeks gates the term only when the sample size is known', () => {
    const ctx = (sampleWeeks?: number) => ({
      avgAllowed: 24,
      leagueAverage: 20,
      sampleWeeks,
      pricing: { blend: 0.25, cap: 5, minSampleWeeks: 3 },
    });
    const steady = [w(1, 10), w(2, 10), w(3, 10), w(4, 10)];
    // 2 known weeks < 3: no term.
    expect(projectWeeklyPoints(steady, null, ctx(2))!.matchupAdjustment).toBe(0);
    // 3 known weeks: the term applies.
    expect(projectWeeklyPoints(steady, null, ctx(3))!.matchupAdjustment).toBe(1);
    // Unknown sample size (production's bundled averages): never gated.
    expect(projectWeeklyPoints(steady, null, ctx(undefined))!.matchupAdjustment).toBe(1);
  });
});
