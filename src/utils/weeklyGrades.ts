// Weekly prediction grades (backlog item 183) — shapes TraderApe's own
// graded weeks (npm run grade:predictions: Sleeper weekly actuals vs the
// frozen pre-kickoff snapshot, ±5 full-PPR pts) into what the /model-report
// page renders. Pure data logic — the component owns the rendering. Grade
// files live in data/projection-grades/<season>-week<week>-sleeper.json and
// are copied into src/data/projectionGrades.<season>-week<week>.json (same
// copy pattern as the backtest snapshot) so the page can import them.
import { indexPool, type PoolIndex } from './consensusGrade';
import type { DraftPoolFile } from '@/types/draft';

export type GradeCategory = 'outperformed' | 'underperformed' | 'in-line';

export type GradeReason =
  | 'usage-up'
  | 'usage-down'
  | 'efficiency-up'
  | 'efficiency-down'
  | 'td-variance'
  | 'did-not-play'
  | 'unexplained';

export const GRADE_REASON_LABELS: Record<GradeReason, string> = {
  'usage-up': 'More usage than projected',
  'usage-down': 'Less usage than projected',
  'efficiency-up': 'More efficient than projected',
  'efficiency-down': 'Less efficient than projected',
  'td-variance': 'Touchdown luck',
  'did-not-play': 'Did not play',
  unexplained: 'No clear reason',
};

export function gradeReasonLabel(reason: string | null | undefined): string {
  if (!reason) return '—';
  return GRADE_REASON_LABELS[reason as GradeReason] ?? reason;
}

export interface RawGradeRow {
  player_id?: string;
  predicted?: number;
  actual?: number;
  diff?: number;
  category?: string;
  reasons?: string[];
  primaryReason?: string | null;
}

export interface RawGradePositionSummary {
  graded?: number;
  outperformed?: number;
  underperformed?: number;
  inLine?: number;
  meanDiff?: number;
  meanAbsDiff?: number;
  primaryReasonCounts?: Record<string, number>;
  breakoutCount?: number;
  byPosition?: Record<string, RawGradePositionSummary>;
}

export interface RawGradeFile {
  source?: string;
  season?: number;
  week?: number;
  graded_at?: string;
  threshold?: number;
  scoring?: string;
  summary?: RawGradePositionSummary;
  grades?: RawGradeRow[];
  breakouts?: { player_id?: string; predicted?: number; actual?: number }[];
}

export interface GradeMiss {
  playerId: string;
  name: string;
  position: string;
  team: string;
  predicted: number;
  actual: number;
  diff: number;
  primaryReason: GradeReason | null;
}

export interface GradePositionRow {
  position: string;
  graded: number;
  mae: number;
  within5Pct: number;
  /** Mean (actual − predicted): negative = projections ran high. */
  bias: number;
}

export interface GradeReasonCount {
  reason: GradeReason;
  label: string;
  count: number;
}

export interface WeeklyGradeSummary {
  season: number;
  week: number;
  gradedAt: string;
  threshold: number;
  graded: number;
  outperformed: number;
  underperformed: number;
  inLine: number;
  within5Pct: number;
  /** Mean absolute error, full-PPR pts. */
  mae: number;
  /** Mean (actual − predicted): negative = projections ran high. */
  bias: number;
  topReasons: GradeReasonCount[];
  byPosition: GradePositionRow[];
  biggestOver: GradeMiss[];
  biggestUnder: GradeMiss[];
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE'];

const TOP_MISSES = 5;
const TOP_REASONS = 5;

function finite(n: number | undefined, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function resolveMiss(
  row: RawGradeRow,
  poolIndex: PoolIndex | undefined,
): GradeMiss {
  const playerId = String(row.player_id ?? '');
  const poolPlayer = poolIndex?.bySleeperId.get(playerId);
  return {
    playerId,
    name: poolPlayer?.name ?? `Sleeper ${playerId}`,
    position: poolPlayer?.pos ?? '—',
    team: poolPlayer?.team ?? '—',
    predicted: finite(row.predicted, 0),
    actual: finite(row.actual, 0),
    diff: finite(row.diff, finite(row.actual, 0) - finite(row.predicted, 0)),
    primaryReason: (row.primaryReason as GradeReason | null) ?? null,
  };
}

/**
 * Shape one committed grade file into the summary the Model Report renders.
 * Returns null when the file has no usable summary (ungraded or empty week),
 * so the page hides the section instead of rendering zeros.
 */
export function summarizeWeeklyGrade(
  file: RawGradeFile | null | undefined,
  pool?: DraftPoolFile,
): WeeklyGradeSummary | null {
  if (!file || !file.summary) return null;
  const s = file.summary;
  const graded = finite(s.graded, 0);
  if (graded <= 0) return null;
  const week = finite(file.week, 0);
  if (week <= 0) return null;

  const poolIndex = pool ? indexPool(pool) : undefined;
  const rows = (file.grades ?? []).filter(
    r => typeof r.player_id !== 'undefined',
  );
  const over = rows
    .filter(r => r.category === 'outperformed')
    .sort((a, b) => finite(b.diff, 0) - finite(a.diff, 0))
    .slice(0, TOP_MISSES)
    .map(r => resolveMiss(r, poolIndex));
  const under = rows
    .filter(r => r.category === 'underperformed')
    .sort((a, b) => finite(a.diff, 0) - finite(b.diff, 0))
    .slice(0, TOP_MISSES)
    .map(r => resolveMiss(r, poolIndex));

  const byPosition: GradePositionRow[] = POSITION_ORDER.map(pos => {
    const sub = s.byPosition?.[pos];
    if (!sub) return null;
    const subGraded = finite(sub.graded, 0);
    if (subGraded <= 0) return null;
    return {
      position: pos,
      graded: subGraded,
      mae: finite(sub.meanAbsDiff, 0),
      within5Pct: (finite(sub.inLine, 0) / subGraded) * 100,
      bias: finite(sub.meanDiff, 0),
    };
  }).filter((r): r is GradePositionRow => r !== null);

  const topReasons: GradeReasonCount[] = Object.entries(
    s.primaryReasonCounts ?? {},
  )
    .map(([reason, count]) => ({
      reason: reason as GradeReason,
      label: gradeReasonLabel(reason),
      count: finite(count, 0),
    }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_REASONS);

  return {
    season: finite(file.season, 0),
    week,
    gradedAt: file.graded_at ?? '',
    threshold: finite(file.threshold, 5),
    graded,
    outperformed: finite(s.outperformed, 0),
    underperformed: finite(s.underperformed, 0),
    inLine: finite(s.inLine, 0),
    within5Pct: (finite(s.inLine, 0) / graded) * 100,
    mae: finite(s.meanAbsDiff, 0),
    bias: finite(s.meanDiff, 0),
    topReasons,
    byPosition,
    biggestOver: over,
    biggestUnder: under,
  };
}
