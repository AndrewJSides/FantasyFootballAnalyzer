// Weather term backtest scoring tests (backlog item 138, remainder).
//
// Fixture numbers are the real week-8 grade (2026-week8-sleeper.json) for
// the four passing-game players who actually played in the ATL@TB rain
// game (Nov 1, 2026): London, Penix, Mayfield, Pitts. Egbuka/Otton/
// Godwin scored 0 but are excluded from the fixture — Egbuka and Otton
// are did-not-play (the injury class, not weather), and Godwin's 0 came
// with a usage-down reason on a day his team completed 8 passes; the
// script excludes did-not-play entries before scoring, so the scorer
// itself only ever sees played players.
import { describe, it, expect } from 'vitest';
import {
  applyWeatherTerm,
  scoreWeatherTerm,
  type WeatherGradeEntry,
} from './weatherBacktest';

// ATL@TB, week 8: 88–98% rain forecast, 13–15 mph wind, 27 mph gusts
// observed at kickoff; ATL completed 8 passes in a 16-0 shutout loss.
const TB_GAME: WeatherGradeEntry[] = [
  { player_id: 'london', predicted: 16.66, actual: 1.8 },
  { player_id: 'penix', predicted: 14.57, actual: 2.1 },
  { player_id: 'mayfield', predicted: 16.05, actual: 1.4 },
  { player_id: 'pitts', predicted: 8.2, actual: 2.6 },
];

// Two unaffected graded players, so the overall MAE is computable.
const UNAFFECTED: WeatherGradeEntry[] = [
  { player_id: 'x1', predicted: 10, actual: 12 },
  { player_id: 'x2', predicted: 20, actual: 15 },
];

const termsAt = (pct: number): Map<string, number> =>
  new Map(TB_GAME.map(g => [g.player_id, -Math.round(pct * g.predicted * 100) / 100]));

describe('applyWeatherTerm', () => {
  it('floors the adjusted projection at 0', () => {
    expect(applyWeatherTerm(2, -5)).toBe(0);
    expect(applyWeatherTerm(16.66, -4.17)).toBeCloseTo(12.49, 2);
  });
});

describe('scoreWeatherTerm', () => {
  it('scores each case and the aggregates from the week-8 TB-game fixture', () => {
    const r = scoreWeatherTerm([...TB_GAME, ...UNAFFECTED], termsAt(0.25));
    expect(r.cases).toHaveLength(4);
    expect(r.cases[0]).toEqual({
      playerId: 'london',
      term: -4.17,
      predicted: 16.66,
      actual: 1.8,
      errorBefore: 14.86,
      errorAfter: 10.69,
    });
    // Affected MAE (14.86+12.47+14.65+5.60)/4 = 11.90 before,
    // (10.69+8.83+10.64+3.55)/4 = 8.43 after.
    expect(r.affectedMaeBefore).toBeCloseTo(11.9, 1);
    expect(r.affectedMaeAfter).toBeCloseTo(8.43, 1);
    expect(r.gradedCount).toBe(6);
    expect(r.fold).toBe(true);
  });

  it('does not fold when the downgrade overshoots the actuals', () => {
    // A -90% haircut on players who merely underperformed a little.
    const mild: WeatherGradeEntry[] = [
      { player_id: 'a', predicted: 12, actual: 10 },
      { player_id: 'b', predicted: 14, actual: 12 },
    ];
    const terms = new Map([
      ['a', -10.8],
      ['b', -12.6],
    ]);
    const r = scoreWeatherTerm([...mild, ...UNAFFECTED], terms);
    expect(r.affectedMaeAfter).toBeGreaterThan(r.affectedMaeBefore);
    expect(r.fold).toBe(false);
  });

  it('does not fold with no cases', () => {
    const r = scoreWeatherTerm(UNAFFECTED, new Map());
    expect(r.cases).toHaveLength(0);
    expect(r.fold).toBe(false);
  });

  it('skips non-finite grade entries', () => {
    const grades: WeatherGradeEntry[] = [
      { player_id: 'a', predicted: NaN, actual: 5 },
      ...TB_GAME,
    ];
    const r = scoreWeatherTerm(grades, termsAt(0.25));
    expect(r.gradedCount).toBe(4);
    expect(r.cases).toHaveLength(4);
  });
});
