// Backtest harness for the weekly projection model (backlog item 1,
// remainder (b)). Replays the model week by week: for every week after a
// player's first, it projects that week using ONLY earlier weeks — never
// the week being scored — and compares the projection to the actual.
// This is what turns "better than Yahoo" from a claim into a measurement:
// run it over completed weeks and the MAE / within-±5 rate is the model's
// track record, comparable against Yahoo's weekly estimates once those
// snapshots exist.
//
// A naive baseline (the player's prior mean, no recency weighting) is
// scored on the same weeks, so the model has to beat doing nothing smart.

import { projectWeeklyPoints, type WeekPoints } from './weeklyProjection';

export interface BacktestPrediction {
  week: number;
  predicted: number;
  naive: number;
  actual: number;
  error: number;
  naiveError: number;
  within5: boolean;
}

export interface BacktestSummary {
  /** Weeks scored (one per prediction). */
  predictions: number;
  /** Mean absolute error of the model, rounded to 2dp. */
  mae: number;
  /** Mean absolute error of the naive prior-mean baseline. */
  naiveMae: number;
  /** Mean signed error (positive = model over-projects), 2dp. */
  bias: number;
  /** Share of predictions within ±5 full-PPR pts, 0–1 rounded to 3dp. */
  within5Rate: number;
}

export interface PlayerBacktest {
  playerId: string;
  predictions: BacktestPrediction[];
  summary: BacktestSummary;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function summarize(predictions: BacktestPrediction[]): BacktestSummary {
  if (predictions.length === 0) {
    return { predictions: 0, mae: 0, naiveMae: 0, bias: 0, within5Rate: 0 };
  }
  const mae =
    predictions.reduce((s, p) => s + Math.abs(p.error), 0) / predictions.length;
  const naiveMae =
    predictions.reduce((s, p) => s + Math.abs(p.naiveError), 0) /
    predictions.length;
  const bias =
    predictions.reduce((s, p) => s + p.error, 0) / predictions.length;
  const within5Rate =
    predictions.filter(p => p.within5).length / predictions.length;
  return {
    predictions: predictions.length,
    mae: round2(mae),
    naiveMae: round2(naiveMae),
    bias: round2(bias),
    within5Rate: round3(within5Rate),
  };
}

/** Replay one player's season. Weeks with no score are skipped as targets
 *  but still count as history only if they carry a score — a missed week
 *  (bye, DNP) is not a 0-point week and must not drag the projection down. */
export function backtestPlayer(
  playerId: string,
  weeks: WeekPoints[],
): PlayerBacktest {
  const sorted = [...weeks]
    .filter(w => Number.isFinite(w.week) && Number.isFinite(w.pts))
    .sort((a, b) => a.week - b.week);
  const predictions: BacktestPrediction[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const history = sorted.slice(0, i);
    const projected = projectWeeklyPoints(history);
    if (!projected) continue;
    const naive =
      Math.round(
        (history.reduce((s, w) => s + w.pts, 0) / history.length) * 10,
      ) / 10;
    const actual = sorted[i].pts;
    const error = Math.round((projected.projection - actual) * 10) / 10;
    const naiveError = Math.round((naive - actual) * 10) / 10;
    predictions.push({
      week: sorted[i].week,
      predicted: projected.projection,
      naive,
      actual,
      error,
      naiveError,
      within5: Math.abs(error) <= 5,
    });
  }
  return { playerId, predictions, summary: summarize(predictions) };
}

/** Pool every player's predictions into one summary (overall or a
 *  position slice — the caller groups first). */
export function aggregateBacktests(results: PlayerBacktest[]): BacktestSummary {
  return summarize(results.flatMap(r => r.predictions));
}
