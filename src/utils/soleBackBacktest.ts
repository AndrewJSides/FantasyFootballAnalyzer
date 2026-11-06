// Sole-back term backtest (backlog item 137, remainder).
//
// The "Sole back" tag shipped display-only on Nov 4, 2026: an RB whose
// same-team RB mate is ruled out gets an upside estimate (the mate's recent
// usage at the lead back's own points per opportunity, capped at +10), but
// the ranked projection deliberately did not fold it in — a priced term
// stays out until a backtest says it wins. This module scores that term
// against a graded week: for every graded player the detector fires on,
// compare the projection error with and without the term, and do the same
// for the whole graded set. The fold rule is conservative on purpose: the
// term must cut the affected players' MAE *and* not raise the overall MAE.
// One graded week is thin evidence, so the script that feeds this scorer
// also runs a sensitivity pass (every DNP vacancy treated as ruled out)
// and reports both — the fold only stands when the gated pass wins.
//
// Pure: no fetching, no file IO. The script (scripts/backtestSoleBack.ts)
// reconstructs the week's cases and calls scoreSoleBackTerm.
export interface SoleBackGradeEntry {
  /** Sleeper player id, as in the grade file. */
  player_id: string;
  predicted: number;
  actual: number;
}

export interface SoleBackCaseResult {
  playerId: string;
  /** The detector's upside for this player (already capped at +10). */
  term: number;
  predicted: number;
  actual: number;
  errorBefore: number;
  errorAfter: number;
}

export interface SoleBackBacktestResult {
  /** One row per graded player the term fires on. */
  cases: SoleBackCaseResult[];
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

export function scoreSoleBackTerm(
  grades: SoleBackGradeEntry[],
  terms: Map<string, number>,
): SoleBackBacktestResult {
  const cases: SoleBackCaseResult[] = [];
  let totalBefore = 0;
  let totalAfter = 0;
  for (const g of grades) {
    if (!Number.isFinite(g.predicted) || !Number.isFinite(g.actual)) continue;
    const term = terms.get(g.player_id) ?? 0;
    const errorBefore = Math.abs(g.predicted - g.actual);
    const errorAfter = Math.abs(g.predicted + term - g.actual);
    totalBefore += errorBefore;
    totalAfter += errorAfter;
    if (term > 0) {
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
