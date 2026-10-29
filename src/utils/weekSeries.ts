// Week-by-week point series shaping for the player value-over-time chart
// (backlog item 8). Pure data logic lives here so the chart component file
// exports only the component (react-refresh rule).

export interface WeekPoint {
  week: number;
  /** null = no game recorded that week (bye, injury, or not yet played). */
  points: number | null;
}

/** Expand a week -> points map into a dense week 1..maxWeek series. */
export function buildWeekSeries(weekly: Record<number, number>): WeekPoint[] {
  const weeks = Object.keys(weekly)
    .map(Number)
    .filter(n => Number.isFinite(n) && n >= 1);
  if (weeks.length === 0) return [];
  const maxWeek = Math.max(...weeks);
  const series: WeekPoint[] = [];
  for (let w = 1; w <= maxWeek; w++) {
    const p = weekly[w];
    series.push({
      week: w,
      points: typeof p === 'number' && Number.isFinite(p) ? p : null,
    });
  }
  return series;
}

export interface WeekSeriesStats {
  games: number;
  bestWeek: number | null;
  bestPoints: number;
  average: number;
}

export function summarizeWeekSeries(series: WeekPoint[]): WeekSeriesStats {
  const played = series.filter(s => s.points !== null);
  if (played.length === 0) {
    return { games: 0, bestWeek: null, bestPoints: 0, average: 0 };
  }
  let best = played[0];
  let sum = 0;
  for (const s of played) {
    const pts = s.points as number;
    sum += pts;
    if (pts > (best.points as number)) best = s;
  }
  return {
    games: played.length,
    bestWeek: best.week,
    bestPoints: best.points as number,
    average: sum / played.length,
  };
}
