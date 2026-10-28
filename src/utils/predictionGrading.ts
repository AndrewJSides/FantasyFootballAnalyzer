// Grades a week's predictions against actuals and attributes the misses.
//
// Categories (diff = actual - predicted, full-PPR points):
//   outperformed:  diff >  THRESHOLD  (the model predicted 5+ pts too low)
//   underperformed: diff < -THRESHOLD  (the model predicted 5+ pts too high)
//   in-line:        |diff| <= THRESHOLD
//
// Reason attribution is directional, not exact accounting. It compares the
// projected component stat line against the actual one and tags the dominant
// driver of the miss:
//   usage:       opportunities (targets + carries + pass attempts) moved a lot
//   efficiency:  yards per opportunity moved a lot
//   td-variance: touchdowns moved by a whole TD or more (TDs are high-variance)
//   did-not-play: no actual stat line / zero volume (inactive, injury, benching)
// A miss with no component trigger is tagged unexplained — that tag is itself
// a signal (game script, weather, late injury news) and must not be hidden.
//
// The factor aggregate is what future predictions consume: it turns a pile of
// graded weeks into learned weights (e.g. how much of the error is usage-driven
// vs TD luck), so the projection model can weight recent usage trends and
// regress TD projections instead of treating every miss the same.

export const GRADE_THRESHOLD = 5;

export type GradeCategory = 'outperformed' | 'underperformed' | 'in-line';

export type ReasonTag =
  | 'usage-up'
  | 'usage-down'
  | 'efficiency-up'
  | 'efficiency-down'
  | 'td-variance'
  | 'did-not-play'
  | 'unexplained';

export interface ComponentLine {
  targets?: number;
  carries?: number;
  passAttempts?: number;
  yards?: number;
  touchdowns?: number;
}

export interface PlayerGrade {
  player_id: string;
  predicted: number;
  actual: number;
  diff: number;
  category: GradeCategory;
  reasons: ReasonTag[];
  primaryReason: ReasonTag | null;
}

export function categorize(diff: number): GradeCategory {
  if (diff > GRADE_THRESHOLD) return 'outperformed';
  if (diff < -GRADE_THRESHOLD) return 'underperformed';
  return 'in-line';
}

function opportunities(line: ComponentLine): number {
  return (line.targets ?? 0) + (line.carries ?? 0) + (line.passAttempts ?? 0);
}

function yardsPerOpportunity(line: ComponentLine): number {
  const opp = opportunities(line);
  return opp > 0 ? (line.yards ?? 0) / opp : 0;
}

// Implied PPR swing of a component move, used only to rank reasons against
// each other. Yards are ~0.1 pts each in PPR; a reception is 1 pt and is
// already inside the yards-per-opportunity move, so this stays approximate.
function impliedSwing(
  projected: ComponentLine,
  actual: ComponentLine,
): { usage: number; efficiency: number; td: number } {
  const oppProj = opportunities(projected);
  const oppAct = opportunities(actual);
  const ypoProj = yardsPerOpportunity(projected);
  const ypoAct = yardsPerOpportunity(actual);
  const tdDelta = (actual.touchdowns ?? 0) - (projected.touchdowns ?? 0);
  return {
    usage: (oppAct - oppProj) * ypoProj * 0.1,
    efficiency: oppAct * (ypoAct - ypoProj) * 0.1,
    td: tdDelta * 6,
  };
}

export function attributeReasons(
  projected: ComponentLine,
  actual: ComponentLine,
  actualMissing: boolean,
): { reasons: ReasonTag[]; primaryReason: ReasonTag | null } {
  if (actualMissing || opportunities(actual) === 0) {
    return { reasons: ['did-not-play'], primaryReason: 'did-not-play' };
  }
  const oppProj = opportunities(projected);
  const oppAct = opportunities(actual);
  const oppDelta = oppProj > 0 ? (oppAct - oppProj) / oppProj : 0;
  const ypoProj = yardsPerOpportunity(projected);
  const ypoAct = yardsPerOpportunity(actual);
  const ypoDelta = ypoProj > 0 ? (ypoAct - ypoProj) / ypoProj : 0;
  const tdDelta = (actual.touchdowns ?? 0) - (projected.touchdowns ?? 0);

  const reasons: ReasonTag[] = [];
  if (oppDelta > 0.2 && oppAct - oppProj >= 3) reasons.push('usage-up');
  if (oppDelta < -0.2 && oppProj - oppAct >= 3) reasons.push('usage-down');
  if (ypoDelta > 0.2) reasons.push('efficiency-up');
  if (ypoDelta < -0.2) reasons.push('efficiency-down');
  if (Math.abs(tdDelta) >= 1) reasons.push('td-variance');

  if (reasons.length === 0) {
    return { reasons: ['unexplained'], primaryReason: 'unexplained' };
  }

  const swing = impliedSwing(projected, actual);
  const ranked: Array<[ReasonTag, number]> = [];
  if (reasons.includes('usage-up') || reasons.includes('usage-down')) {
    ranked.push([swing.usage >= 0 ? 'usage-up' : 'usage-down', Math.abs(swing.usage)]);
  }
  if (reasons.includes('efficiency-up') || reasons.includes('efficiency-down')) {
    ranked.push([
      swing.efficiency >= 0 ? 'efficiency-up' : 'efficiency-down',
      Math.abs(swing.efficiency),
    ]);
  }
  if (reasons.includes('td-variance')) ranked.push(['td-variance', Math.abs(swing.td)]);
  ranked.sort((a, b) => b[1] - a[1]);
  return { reasons, primaryReason: ranked[0]?.[0] ?? reasons[0] };
}

export function gradePlayer(
  player_id: string,
  predicted: number,
  actual: number | null,
  projected: ComponentLine,
  actualLine: ComponentLine,
): PlayerGrade {
  const act = actual ?? 0;
  const diff = Math.round((act - predicted) * 100) / 100;
  const category = categorize(diff);
  const { reasons, primaryReason } =
    category === 'in-line'
      ? { reasons: [] as ReasonTag[], primaryReason: null as ReasonTag | null }
      : attributeReasons(projected, actualLine, actual === null);
  return { player_id, predicted, actual: act, diff, category, reasons, primaryReason };
}

export interface GradeSummary {
  graded: number;
  outperformed: number;
  underperformed: number;
  inLine: number;
  meanDiff: number;
  meanAbsDiff: number;
  primaryReasonCounts: Partial<Record<ReasonTag, number>>;
  breakoutCount: number;
}

export function summarize(grades: PlayerGrade[], breakoutCount: number): GradeSummary {
  const n = grades.length;
  const sum = (f: (g: PlayerGrade) => number): number =>
    grades.reduce((acc, g) => acc + f(g), 0);
  const primaryReasonCounts: Partial<Record<ReasonTag, number>> = {};
  for (const g of grades) {
    if (g.primaryReason) {
      primaryReasonCounts[g.primaryReason] = (primaryReasonCounts[g.primaryReason] ?? 0) + 1;
    }
  }
  return {
    graded: n,
    outperformed: grades.filter((g) => g.category === 'outperformed').length,
    underperformed: grades.filter((g) => g.category === 'underperformed').length,
    inLine: grades.filter((g) => g.category === 'in-line').length,
    meanDiff: n > 0 ? Math.round((sum((g) => g.diff) / n) * 100) / 100 : 0,
    meanAbsDiff: n > 0 ? Math.round((sum((g) => Math.abs(g.diff)) / n) * 100) / 100 : 0,
    primaryReasonCounts,
    breakoutCount,
  };
}

// Learned weights for future predictions, aggregated over graded weeks.
// These are observed statistics with a documented application rule, not
// fitted-model magic: the projection model should (a) weight recent usage
// trends in proportion to the usage-driven share of misses, and (b) regress
// projected touchdowns toward the player's TD mean in proportion to the
// TD-variance share of misses. A new week of grades re-averages these.
export interface LearnedFactors {
  weeksGraded: number;
  playersGraded: number;
  meanDiff: number;
  meanAbsDiff: number;
  missShare: number;
  usageDrivenMissShare: number;
  tdVarianceMissShare: number;
  didNotPlayMissShare: number;
}

export function aggregateFactors(
  summaries: GradeSummary[],
): LearnedFactors {
  const playersGraded = summaries.reduce((acc, s) => acc + s.graded, 0);
  const misses = summaries.reduce(
    (acc, s) => acc + s.outperformed + s.underperformed,
    0,
  );
  const weightedMean = (f: (s: GradeSummary) => number): number => {
    if (playersGraded === 0) return 0;
    return (
      Math.round(
        (summaries.reduce((acc, s) => acc + f(s) * s.graded, 0) / playersGraded) * 100,
      ) / 100
    );
  };
  const reasonTotal = (tag: ReasonTag): number =>
    summaries.reduce((acc, s) => acc + (s.primaryReasonCounts[tag] ?? 0), 0);
  const usage = reasonTotal('usage-up') + reasonTotal('usage-down');
  const td = reasonTotal('td-variance');
  const dnp = reasonTotal('did-not-play');
  return {
    weeksGraded: summaries.length,
    playersGraded,
    meanDiff: weightedMean((s) => s.meanDiff),
    meanAbsDiff: weightedMean((s) => s.meanAbsDiff),
    missShare: playersGraded > 0 ? Math.round((misses / playersGraded) * 1000) / 1000 : 0,
    usageDrivenMissShare: misses > 0 ? Math.round((usage / misses) * 1000) / 1000 : 0,
    tdVarianceMissShare: misses > 0 ? Math.round((td / misses) * 1000) / 1000 : 0,
    didNotPlayMissShare: misses > 0 ? Math.round((dnp / misses) * 1000) / 1000 : 0,
  };
}
