// Weekly projection model for the Start/Sit optimizer (backlog item 1,
// remainder (a)). Ranks players on what they are likely to score this week,
// not just what they have averaged: a recency-weighted last-4-weeks form
// blended with the player's season baseline, so one big week can't
// over-swing the number, plus a numeric matchup adjustment from the
// opponent's fantasy points allowed vs the position relative to the league
// average (DEFAULT_MATCHUP_PRICING: the blend fraction and cap the Nov 1,
// 2026 weeks 1–7 backtest settled on; a per-context pricing override exists
// for the harness). Injuries and news are
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

export function projectWeeklyPoints(
  weeks: WeekPoints[],
  gamesPlayed?: number | null,
  matchup?: MatchupContext | null,
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
  const projection = round1(baseProjection + matchupAdjustment);
  const trend =
    form >= baseline + 2 ? 'hot' : form <= baseline - 2 ? 'cooling' : 'steady';
  return {
    projection,
    baseline,
    form,
    matchupAdjustment,
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
  if (p.matchupAdjustment === 0) return base;
  const sign = p.matchupAdjustment > 0 ? '+' : '';
  const where = opponent ? ` vs ${opponent}` : '';
  return `${base} Matchup${where} adjusts it ${sign}${p.matchupAdjustment} pts.`;
}
