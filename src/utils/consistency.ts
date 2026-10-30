// Week-to-week consistency ratings (backlog item 20) — TraderApe's own
// take on the FantasyPros "Boom, Bust, and Everything In Between" idea
// (public feature description only, researched Oct 29, 2026): the concept
// is per-position boom/bust cutoffs that showcase a player's ceiling and
// floor week to week. Their published cutoffs are their research — ours
// are TraderApe's own round full-PPR bars, stated plainly in the UI
// footnote. Floor/ceiling come from the player's own played weeks (25th /
// 75th percentiles), and the verdict uses the scale-free coefficient of
// variation so it works for QBs and kickers alike. Pure data logic — the
// page owns the rendering.

export interface ConsistencySummary {
  games: number;
  /** 25th percentile of played-week scores. */
  floor: number;
  /** 50th percentile of played-week scores. */
  median: number;
  /** 75th percentile of played-week scores. */
  ceiling: number;
  /** Boom/bust bars the player was graded against (TraderApe's own). */
  boomBar: number;
  bustBar: number;
  /** Played weeks scoring at/above the boom bar. */
  boomWeeks: number;
  /** Played weeks scoring at/below the bust bar. */
  bustWeeks: number;
  /** 'Steady' = low week-to-week variance, 'Volatile' = high. */
  verdict: 'Steady' | 'Mixed' | 'Volatile';
}

/**
 * TraderApe's own boom/bust cutoffs in full-PPR points, by position.
 * Round numbers chosen as readable bars — NOT copied from any competitor's
 * published research. K/DST use the TE bars as a fallback.
 */
export function boomBustBars(position: string | undefined): {
  boomBar: number;
  bustBar: number;
} {
  switch ((position ?? '').toUpperCase()) {
    case 'QB':
      return { boomBar: 25, bustBar: 13 };
    case 'RB':
    case 'WR':
      return { boomBar: 20, bustBar: 7 };
    case 'TE':
      return { boomBar: 15, bustBar: 5 };
    default:
      return { boomBar: 20, bustBar: 7 };
  }
}

/** Nearest-rank percentile of a non-empty sorted-ascending array. */
function percentile(sortedAsc: number[], p: number): number {
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.max(0, Math.min(sortedAsc.length - 1, rank - 1))];
}

/**
 * Summarize the week-to-week consistency of a player's weekly full-PPR
 * points. Returns null when fewer than 3 games have been played — the
 * percentiles are noise before that.
 */
export function consistencySummary(
  weekly: Record<number, number> | undefined,
  position: string | undefined,
): ConsistencySummary | null {
  if (!weekly) return null;
  const played = Object.values(weekly).filter(
    v => typeof v === 'number' && Number.isFinite(v),
  );
  if (played.length < 3) return null;
  const sorted = [...played].sort((a, b) => a - b);
  const mean = played.reduce((s, v) => s + v, 0) / played.length;
  const variance =
    played.reduce((s, v) => s + (v - mean) * (v - mean), 0) / played.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  const { boomBar, bustBar } = boomBustBars(position);
  return {
    games: played.length,
    floor: percentile(sorted, 25),
    median: percentile(sorted, 50),
    ceiling: percentile(sorted, 75),
    boomBar,
    bustBar,
    boomWeeks: played.filter(v => v >= boomBar).length,
    bustWeeks: played.filter(v => v <= bustBar).length,
    verdict: cv < 0.25 ? 'Steady' : cv > 0.5 ? 'Volatile' : 'Mixed',
  };
}
