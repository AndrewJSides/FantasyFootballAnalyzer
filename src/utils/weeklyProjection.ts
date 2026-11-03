// Weekly projection model for the Start/Sit optimizer (backlog item 1,
// remainder (a)). Ranks players on what they are likely to score this week,
// not just what they have averaged: a recency-weighted last-4-weeks form
// blended with the player's season baseline, so one big week can't
// over-swing the number, plus a numeric matchup adjustment from the
// opponent's fantasy points allowed vs the position relative to the league
// average (DEFAULT_MATCHUP_PRICING: the blend fraction and cap the Nov 1,
// 2026 weeks 1–7 backtest settled on; a per-context pricing override exists
// for the harness), plus an optional TD regression term (DEFAULT_TD_REGRESSION,
// measured by the harness's tdVariants; OFF until a nonzero strength wins)
// that shrinks the gap between recency-weighted TD points and the season
// TD average, plus an optional usage-trend term (DEFAULT_USAGE_TREND,
// measured by the harness's usageVariants; OFF until a nonzero strength
// wins) that prices a rising or falling opportunity share: the gap
// between recency-weighted usage and the season usage average, converted
// to points at the player's own points-per-opportunity rate. Injuries and news are
// out of scope — the page says so.
//
// Inputs are completed weeks only; the caller filters out the current and
// future weeks before passing them in. The matchup display on the Start/Sit
// page (see matchupRating.ts) is fed by `npm run fetch:matchups` (ESPN
// schedule + Sleeper weekly stats, all free); the numeric blend below is the
// shipped version of the queued "numeric matchup blend" step.

export interface WeekPoints {
  week: number;
  pts: number;
  /**
   * Fantasy points from touchdowns that week (standard Sleeper scoring:
   * 4 per passing TD, 6 per rushing/receiving TD). Optional — the TD
   * regression term is skipped for any series that doesn't carry it.
   */
  tdPts?: number;
  /**
   * Opportunities that week (targets + carries + pass attempts, the
   * grading attribution's usage definition). Optional — the usage-trend
   * term is skipped for any series that doesn't carry it.
   */
  usage?: number;
}

/** Opponent context for the numeric matchup blend. */
export interface MatchupPricing {
  /** Fraction of (avgAllowed - leagueAverage) that flows through the term.
   *  0 removes the term entirely. */
  blend: number;
  /** Absolute cap on the term's swing, in points. */
  cap: number;
  /**
   * Minimum completed weeks of allowed data behind avgAllowed for the term
   * to apply. Only enforced when the context carries sampleWeeks — callers
   * that don't know the sample size (production's bundled averages) are
   * never gated.
   */
  minSampleWeeks?: number;
}

/**
 * The production pricing for the matchup term. Re-priced Nov 1, 2026 from
 * the weeks 1–7 backtest (backlog item 1 follow-up, 1,949 predictions):
 * the as-shipped half-deviation/±5 pricing measured clearly worse than no
 * term (MAE 7.03 vs 6.78), and every smaller blend / tighter cap / gated
 * variant also lost to zero — the degradation was monotonic in blend size
 * (0.5 → 7.03, 0.25 → 6.84, 0.125 → 6.80, 0 → 6.78), worst for RB/WR, flat
 * for QB. The numeric term is therefore OFF in production until a future
 * re-measurement says otherwise; the Matchup column's
 * favorable/tough/neutral display chips are unaffected (separate logic).
 * The harness keeps the variant machinery so the term can be re-tested
 * (e.g. after week 8, or with better allowed-data) via a pricing override.
 */
export const DEFAULT_MATCHUP_PRICING: MatchupPricing = { blend: 0, cap: 5 };

/**
 * TD regression for the weekly projection model: the graded-weeks
 * application rule (see LearnedFactors in predictionGrading.ts) is to
 * regress projected touchdowns toward the player's TD mean in proportion
 * to the TD-variance share of misses. The model's form window over-weights
 * TD-inflated weeks, so the term shrinks the gap between the recency-
 * weighted TD points and the season TD average back toward zero.
 */
export interface TdRegression {
  /**
   * Fraction of the (form TD pts - season TD pts) gap regressed away.
   * 0 removes the term entirely; 1 fully regresses form TDs to the mean.
   */
  strength: number;
  /** Absolute cap on the term's swing, in points. */
  cap: number;
}

/**
 * The production pricing for the TD term. Measured Nov 3, 2026 on
 * weeks 1–8 (2,257 predictions, backtest tdVariants): no term MAE 6.74
 * vs 6.73 at strengths 0.25–0.5 — a 0.01 wobble, not a win (RB slightly
 * worse, TE slightly better, within ±5 flat at ~54%). Like the matchup
 * term's Nov 1 repricing, a term that doesn't clearly win stays OFF;
 * re-measure after more graded weeks accumulate before reconsidering.
 */
export const DEFAULT_TD_REGRESSION: TdRegression = { strength: 0, cap: 5 };

/**
 * Usage trend for the weekly projection model: the graded-weeks
 * application rule (see LearnedFactors in predictionGrading.ts) is to
 * weight recent usage trends in proportion to the usage-driven share of
 * misses. The model's form window already over-weights recent points, but
 * a role change shows up in opportunities before it shows up in points,
 * so the term prices the usage gap directly: recency-weighted usage minus
 * the season usage average, converted to points at the player's own
 * season points-per-opportunity, so a back whose touches jumped from 12
 * to 18 a game gets a real (but capped) bump before the points catch up.
 */
export interface UsageTrend {
  /**
   * Fraction of the usage-gap-in-points that flows through the term.
   * 0 removes the term entirely; 1 prices the full gap.
   */
  strength: number;
  /** Absolute cap on the term's swing, in points. */
  cap: number;
}

/**
 * The production pricing for the usage term. Measured Nov 3, 2026 on
 * weeks 1–8 (2,257 predictions, backtest usageVariants): no term MAE
 * 6.74 vs 6.76 at strength 0.25, 6.79 at 0.5, 6.86 at 1.0, and 6.76 for
 * the per-position graded-shares variant — degradation monotonic in
 * strength, no position wins at any nonzero strength (QB flat, WR/TE
 * worse). Like the matchup and TD terms, a term that doesn't clearly
 * win stays OFF; re-measure after more graded weeks accumulate before
 * reconsidering.
 */
export const DEFAULT_USAGE_TREND: UsageTrend = { strength: 0, cap: 5 };

export interface MatchupContext {
  /** Opponent's fantasy points per game allowed to the player's position. */
  avgAllowed: number;
  /** League-wide average points per game allowed to the position. */
  leagueAverage: number;
  /** Completed weeks of allowed data behind avgAllowed, when known. */
  sampleWeeks?: number;
  /** Pricing override for this context (backtest use); default when omitted. */
  pricing?: MatchupPricing;
}

export interface WeeklyProjection {
  /** Projected points for the coming week, rounded to 1dp. */
  projection: number;
  /** Season points per game, rounded to 1dp. */
  baseline: number;
  /** Recency-weighted average of the last up to 4 weeks, rounded to 1dp. */
  form: number;
  /**
   * Points added by the matchup blend (positive = favorable), rounded to
   * 1dp. 0 when no matchup context is passed, and 0 under the default
   * pricing (the Nov 1, 2026 backtest turned the numeric term off).
   */
  matchupAdjustment: number;
  /**
   * Points added by the TD regression term (negative when recent form
   * was TD-inflated), rounded to 1dp. 0 when no TD data is passed or
   * under the default pricing (strength 0).
   */
  tdAdjustment: number;
  /**
   * Points added by the usage-trend term (positive when recent usage is
   * above the season average), rounded to 1dp. 0 when no usage data is
   * passed or under the default pricing (strength 0).
   */
  usageAdjustment: number;
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

function matchupAdjustmentFor(matchup: MatchupContext | null | undefined): number {
  if (!matchup) return 0;
  const { avgAllowed, leagueAverage, sampleWeeks, pricing } = matchup;
  if (!Number.isFinite(avgAllowed) || !Number.isFinite(leagueAverage)) return 0;
  const { blend, cap, minSampleWeeks } = pricing ?? DEFAULT_MATCHUP_PRICING;
  if (
    minSampleWeeks !== undefined &&
    sampleWeeks !== undefined &&
    sampleWeeks < minSampleWeeks
  ) {
    return 0;
  }
  const raw = blend * (avgAllowed - leagueAverage);
  return round1(Math.max(-cap, Math.min(cap, raw)));
}

function tdAdjustmentFor(
  sorted: WeekPoints[],
  games: number,
  tdRegression?: TdRegression | null,
): number {
  const { strength, cap } = tdRegression ?? DEFAULT_TD_REGRESSION;
  if (strength === 0) return 0;
  // The term needs a TD line for every week: a partial series would mix
  // a full-points baseline with a partial TD average.
  if (!sorted.every(w => Number.isFinite(w.tdPts))) return 0;
  const last4 = sorted.slice(-4);
  const weighted = last4
    .slice()
    .reverse()
    .reduce((s, w, i) => s + (w.tdPts ?? 0) * FORM_WEIGHTS[i], 0);
  const weightSum = last4
    .slice()
    .reverse()
    .reduce((s, _w, i) => s + FORM_WEIGHTS[i], 0);
  const formTd = weighted / weightSum;
  const baselineTd =
    sorted.reduce((s, w) => s + (w.tdPts ?? 0), 0) / games;
  const raw = -strength * (formTd - baselineTd);
  return round1(Math.max(-cap, Math.min(cap, raw)));
}

function usageAdjustmentFor(
  sorted: WeekPoints[],
  games: number,
  usageTrend?: UsageTrend | null,
): number {
  const { strength, cap } = usageTrend ?? DEFAULT_USAGE_TREND;
  if (strength === 0) return 0;
  // Like the TD term, the series needs a usage line for every week: a
  // partial series would mix a full-points baseline with a partial
  // usage average.
  if (!sorted.every(w => Number.isFinite(w.usage))) return 0;
  const totalUsage = sorted.reduce((s, w) => s + (w.usage ?? 0), 0);
  if (totalUsage <= 0) return 0;
  const last4 = sorted.slice(-4);
  const weighted = last4
    .slice()
    .reverse()
    .reduce((s, w, i) => s + (w.usage ?? 0) * FORM_WEIGHTS[i], 0);
  const weightSum = last4
    .slice()
    .reverse()
    .reduce((s, _w, i) => s + FORM_WEIGHTS[i], 0);
  const formUsage = weighted / weightSum;
  const baselineUsage = totalUsage / games;
  const totalPts = sorted.reduce((s, w) => s + w.pts, 0);
  const ptsPerOpp = totalPts / totalUsage;
  const raw = strength * (formUsage - baselineUsage) * ptsPerOpp;
  return round1(Math.max(-cap, Math.min(cap, raw)));
}

export function projectWeeklyPoints(
  weeks: WeekPoints[],
  gamesPlayed?: number | null,
  matchup?: MatchupContext | null,
  tdRegression?: TdRegression | null,
  usageTrend?: UsageTrend | null,
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
  const baseProjection = w * form + (1 - w) * baseline;
  const matchupAdjustment = matchupAdjustmentFor(matchup);
  const tdAdjustment = tdAdjustmentFor(sorted, games, tdRegression);
  const usageAdjustment = usageAdjustmentFor(sorted, games, usageTrend);
  const projection = round1(
    baseProjection + matchupAdjustment + tdAdjustment + usageAdjustment,
  );
  const trend =
    form >= baseline + 2 ? 'hot' : form <= baseline - 2 ? 'cooling' : 'steady';
  return {
    projection,
    baseline,
    form,
    matchupAdjustment,
    tdAdjustment,
    usageAdjustment,
    weeksUsed: sorted.length,
    games,
    trend,
  };
}

// One-line reason for a projection, for the Start/Sit "why" columns. Names
// the two numbers the blend used so the call is checkable, not a black box.
// Pass the matchup's opponent abbreviation to name where the matchup
// adjustment comes from.
export function projectionReason(
  p: WeeklyProjection,
  opponent?: string | null,
): string {
  const trend =
    p.trend === 'hot'
      ? 'Hot form'
      : p.trend === 'cooling'
        ? 'Cooling off'
        : 'Steady form';
  const sample = p.weeksUsed < 4 ? ` (only ${p.weeksUsed} game${p.weeksUsed === 1 ? '' : 's'} so far)` : '';
  const base = `${trend} — last-4 avg ${p.form} vs ${p.baseline} season avg${sample}.`;
  let out = base;
  if (p.matchupAdjustment !== 0) {
    const sign = p.matchupAdjustment > 0 ? '+' : '';
    const where = opponent ? ` vs ${opponent}` : '';
    out += ` Matchup${where} adjusts it ${sign}${p.matchupAdjustment} pts.`;
  }
  if (p.tdAdjustment !== 0) {
    const sign = p.tdAdjustment > 0 ? '+' : '';
    out += ` TD regression adjusts it ${sign}${p.tdAdjustment} pts.`;
  }
  if (p.usageAdjustment !== 0) {
    const sign = p.usageAdjustment > 0 ? '+' : '';
    out += ` Usage trend adjusts it ${sign}${p.usageAdjustment} pts.`;
  }
  return out;
}
