// Weekly projection model for the Start/Sit optimizer (backlog item 1,
// remainder (a)). Ranks players on what they are likely to score this week,
// not just what they have averaged: a recency-weighted last-4-weeks form
// blended with the player's season baseline, so one big week can't
// over-swing the number. No matchup term yet: the app has no NFL schedule
// or opponent data to derive points-allowed-vs-position from, so that term
// stays queued until a schedule source lands. Injuries and news are also
// out of scope — the page says so.
//
// Inputs are completed weeks only; the caller filters out the current and
// future weeks before passing them in.

export interface WeekPoints {
  week: number;
  pts: number;
}

export interface WeeklyProjection {
  /** Projected points for the coming week, rounded to 1dp. */
  projection: number;
  /** Season points per game, rounded to 1dp. */
  baseline: number;
  /** Recency-weighted average of the last up to 4 weeks, rounded to 1dp. */
  form: number;
  /** Completed weeks with a score that fed the model. */
  weeksUsed: number;
  /** Games the baseline divides by (games played when known). */
  games: number;
  trend: 'hot' | 'steady' | 'cooling';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Most-recent-first weights for the last-4 window: the latest week counts
// 4x the oldest week in the window, so form tracks direction without
// letting a single week dominate.
const FORM_WEIGHTS = [4, 3, 2, 1];

// How much the blend trusts form over the season baseline, by sample size.
// A 1-week player has no form to trust; a 4+-week player gets a real but
// capped form weight, which is the regression to baseline.
function formWeight(weeksUsed: number): number {
  return Math.min(0.65, 0.2 * weeksUsed);
}

export function projectWeeklyPoints(
  weeks: WeekPoints[],
  gamesPlayed?: number | null,
): WeeklyProjection | null {
  const sorted = [...weeks]
    .filter(w => Number.isFinite(w.week) && Number.isFinite(w.pts))
    .sort((a, b) => a.week - b.week);
  if (sorted.length === 0) return null;
  const games =
    gamesPlayed !== undefined && gamesPlayed !== null && gamesPlayed > 0
      ? gamesPlayed
      : sorted.length;
  const total = sorted.reduce((s, w) => s + w.pts, 0);
  const baseline = round1(total / games);
  const last4 = sorted.slice(-4);
  const weighted = last4
    .slice()
    .reverse()
    .reduce((s, w, i) => s + w.pts * FORM_WEIGHTS[i], 0);
  const weightSum = last4
    .slice()
    .reverse()
    .reduce((s, _w, i) => s + FORM_WEIGHTS[i], 0);
  const form = round1(weighted / weightSum);
  const w = formWeight(sorted.length);
  const projection = round1(w * form + (1 - w) * baseline);
  const trend =
    form >= baseline + 2 ? 'hot' : form <= baseline - 2 ? 'cooling' : 'steady';
  return { projection, baseline, form, weeksUsed: sorted.length, games, trend };
}

// One-line reason for a projection, for the Start/Sit "why" columns. Names
// the two numbers the blend used so the call is checkable, not a black box.
export function projectionReason(p: WeeklyProjection): string {
  const trend =
    p.trend === 'hot'
      ? 'Hot form'
      : p.trend === 'cooling'
        ? 'Cooling off'
        : 'Steady form';
  const sample = p.weeksUsed < 4 ? ` (only ${p.weeksUsed} game${p.weeksUsed === 1 ? '' : 's'} so far)` : '';
  return `${trend} — last-4 avg ${p.form} vs ${p.baseline} season avg${sample}.`;
}
