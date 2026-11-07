// Bundled weekly prediction grades (backlog item 183) — the committed
// grade files copied from data/projection-grades/ (same copy pattern as
// the backtest snapshot in src/data/projectionBacktest.<season>.json).
// When a new week grades, copy the file here and add one import + one
// entry below; the Model Report's weekly-grades section picks it up.
import week8Json from './projectionGrades.2026-week8.json';
import type { RawGradeFile } from '@/utils/weeklyGrades';

export interface BundledGradeWeek {
  season: number;
  week: number;
  file: RawGradeFile;
}

export const GRADED_WEEKS: BundledGradeWeek[] = [
  { season: 2026, week: 8, file: week8Json as unknown as RawGradeFile },
];
