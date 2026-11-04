// Where TraderApe's weekly model bets against Sleeper's weekly
// projections (backlog item 121): join each Weekly Rankings row's
// TraderApe projection against Sleeper's pts_ppr for the same week, by
// Sleeper id. Rows with no TraderApe projection or no Sleeper line never
// appear — a missing number is not a zero gap. Bullish = TraderApe
// higher, bearish = TraderApe lower, each capped and sorted by gap size
// so the board shows the model's boldest calls, not its consensus ones.

import type { WeeklyRankRow } from './weeklyRankings';

export interface ProjectionDisagreement {
  playerId: string;
  name: string;
  pos: string;
  team: string;
  /** TraderApe's week-N projection, 1dp. */
  traderApe: number;
  /** Sleeper's week-N pts_ppr projection, 1dp. */
  sleeper: number;
  /** traderApe - sleeper, 1dp; positive = bullish, negative = bearish. */
  gap: number;
}

export interface ProjectionDisagreements {
  /** TraderApe higher than Sleeper, largest gap first. */
  bullish: ProjectionDisagreement[];
  /** TraderApe lower than Sleeper, largest |gap| first. */
  bearish: ProjectionDisagreement[];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function buildProjectionDisagreements(
  rows: WeeklyRankRow[],
  sleeperProjections: Record<string, number>,
  limit = 5,
): ProjectionDisagreements {
  const all: ProjectionDisagreement[] = [];
  for (const row of rows) {
    const sid = row.player.sleeperId;
    if (row.projection === null || !sid) continue;
    const sleeper = sleeperProjections[sid];
    if (typeof sleeper !== 'number' || !Number.isFinite(sleeper)) continue;
    const gap = round1(row.projection - sleeper);
    if (gap === 0) continue;
    all.push({
      playerId: row.player.id,
      name: row.player.name,
      pos: row.player.pos,
      team: row.player.team,
      traderApe: round1(row.projection),
      sleeper: round1(sleeper),
      gap,
    });
  }
  return {
    bullish: all
      .filter(d => d.gap > 0)
      .sort((a, b) => b.gap - a.gap || a.name.localeCompare(b.name))
      .slice(0, limit),
    bearish: all
      .filter(d => d.gap < 0)
      .sort((a, b) => a.gap - b.gap || a.name.localeCompare(b.name))
      .slice(0, limit),
  };
}
