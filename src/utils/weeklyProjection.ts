// Weekly projection model for the Start/Sit optimizer (backlog item 1,
// remainder (a)). Ranks players on what they are likely to score this week,
// not just what they have averaged: a recency-weighted last-4-weeks form
// blended with the player's season baseline, so one big week can't
// over-swing the number, plus a numeric matchup adjustment from the
// opponent's fantasy points allowed vs the position relative to the league
// average (regression to the mean: half the deviation flows through,
// capped so a single soft matchup can't dominate). Injuries and news are
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
export interface MatchupContext {
  /** Opponent's fantasy points per game allowed to the player's position. */
  avgAllowed: number;
  /** League-wide average points per game allowed to the position. */
  leagueAverage: number;
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
   * 1dp. 0 when no matchup context is passed.
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

// How much of the opponent's deviation from league-average allowed actually
// moves the projection: half the gap, so we regress to the mean instead of
// assuming every soft matchup repeats at full strength.
const MATCHUP_BLEND = 0.5;

// The matchup term never swings a projection by more than a field goal +
// PAT: matchup ratings are noisy, so the term stays a nudge, not a driver.
const MATCHUP_CAP = 5;

// How much the blend trusts form over the season baseline, by sample size.
// A 1-week player has no form to trust; a 4+-week player gets a real but
// capped form weight, which is the regression to baseline.
function formWeight(weeksUsed: number): number {
  return Math.min(0.65, 0.2 * weeksUsed);
}

function matchupAdjustmentFor(matchup: MatchupContext | null | undefined): number {
  if (!matchup) return 0;
  const { avgAllowed, leagueAverage } = matchup;
  if (!Number.isFinite(avgAllowed) || !Number.isFinite(leagueAverage)) return 0;
  const raw = MATCHUP_BLEND * (avgAllowed - leagueAverage);
  return round1(Math.max(-MATCHUP_CAP, Math.min(MATCHUP_CAP, raw)));
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
