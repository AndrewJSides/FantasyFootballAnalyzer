// Weather term backtest (backlog item 138, remainder).
//
// The "Weather risk" tag shipped display-only on Nov 4, 2026: a QB/WR/TE
// in an outdoor game flagged windy (15+ mph sustained or 25+ mph gusts)
// or wet (40%+ precipitation) gets an amber tag, but the ranked
// projection deliberately did not fold it in — a priced term stays out
// until a backtest says it wins. This module scores that term against a
// graded week: for every graded passing-game player in a flagged game,
// compare the projection error with and without the downgrade, and do the
// same for the whole graded set. The fold rule is conservative on
// purpose, same as the sole-back term (item 137): the term must cut the
// affected players' MAE *and* not raise the overall MAE. One graded week
// is thin evidence, so the script that feeds this scorer also runs a
// sensitivity pass (wet-only and windy-only variants) and reports all
// variants — the fold only stands when the gated pass wins.
//
// Terms are negative (a downgrade) and the adjusted projection floors at
// 0. Did-not-play graded entries never receive a term: their miss is the
// injury class item 136 already prices at 0, and crediting the weather
// term for it would be measuring the wrong thing — the script excludes
// them before calling this scorer.
//
// Pure: no fetching, no file IO. The script (scripts/backtestWeather.ts)
// reconstructs the week's flagged games from the Open-Meteo archive and
// calls scoreWeatherTerm per candidate variant.
export interface WeatherGradeEntry {
  /** Sleeper player id, as in the grade file. */
  player_id: string;
  predicted: number;
  actual: number;
}

export interface WeatherCaseResult {
  playerId: string;
  /** The downgrade for this player (negative, already applied). */
  term: number;
  predicted: number;
  actual: number;
  errorBefore: number;
  errorAfter: number;
}

export interface WeatherBacktestResult {
  /** One row per graded player the term fires on. */
  cases: WeatherCaseResult[];
  /** Mean absolute error over the affected players, before/after the term. */
  affectedMaeBefore: number;
  affectedMaeAfter: number;
  /** Mean absolute error over every graded player, before/after the term. */
  overallMaeBefore: number;
  overallMaeAfter: number;
  gradedCount: number;
  /** True when the term cuts affected MAE without raising overall MAE. */
  fold: boolean;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Apply a (negative) weather term to a projection, floored at 0. */
export function applyWeatherTerm(predicted: number, term: number): number {
  return Math.max(0, predicted + term);
}

export function scoreWeatherTerm(
  grades: WeatherGradeEntry[],
  terms: Map<string, number>,
): WeatherBacktestResult {
  const cases: WeatherCaseResult[] = [];
  let totalBefore = 0;
  let totalAfter = 0;
  for (const g of grades) {
    if (!Number.isFinite(g.predicted) || !Number.isFinite(g.actual)) continue;
    const term = terms.get(g.player_id) ?? 0;
    const errorBefore = Math.abs(g.predicted - g.actual);
    const errorAfter = Math.abs(applyWeatherTerm(g.predicted, term) - g.actual);
    totalBefore += errorBefore;
    totalAfter += errorAfter;
    if (term !== 0) {
      cases.push({
        playerId: g.player_id,
        term: round2(term),
        predicted: g.predicted,
        actual: g.actual,
        errorBefore: round2(errorBefore),
        errorAfter: round2(errorAfter),
      });
    }
  }
  const gradedCount = grades.filter(
    g => Number.isFinite(g.predicted) && Number.isFinite(g.actual),
  ).length;
  const affectedMaeBefore =
    cases.length > 0
      ? round2(cases.reduce((s, c) => s + c.errorBefore, 0) / cases.length)
      : 0;
  const affectedMaeAfter =
    cases.length > 0
      ? round2(cases.reduce((s, c) => s + c.errorAfter, 0) / cases.length)
      : 0;
  const overallMaeBefore = gradedCount > 0 ? round2(totalBefore / gradedCount) : 0;
  const overallMaeAfter = gradedCount > 0 ? round2(totalAfter / gradedCount) : 0;
  return {
    cases,
    affectedMaeBefore,
    affectedMaeAfter,
    overallMaeBefore,
    overallMaeAfter,
    gradedCount,
    // No cases, no evidence, no fold — the term stays display-only until a
    // graded week actually measures it.
    fold:
      cases.length > 0 &&
      affectedMaeAfter < affectedMaeBefore &&
      overallMaeAfter <= overallMaeBefore,
  };
}
