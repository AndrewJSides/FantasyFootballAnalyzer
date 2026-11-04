// Sleeper team totals (backlog item 126): sum Sleeper's own week-N
// projections over one side's optimal starters, so the Matchup page's
// headline "Projected score" line can be checked against the market
// number. The detail view already fetches Sleeper's week-N projections
// for the game-plan column (item 125); this is a free sum over the same
// optimal lineups the preview prices. Starters with no published Sleeper
// line are skipped, never guessed — the caller names the partial
// coverage, and a lineup with no lines at all totals to null (a dash).

import type { ScoredPlayer } from '@/utils/rosterScoring';

export interface SleeperLineupTotal {
  /** Sum of the published Sleeper lines, 1dp like the rest of the app. */
  total: number;
  /** Starters who actually had a published Sleeper line. */
  counted: number;
  /** Optimal starters in the lineup, including ones without a line. */
  starters: number;
}

export function sleeperLineupTotal(
  starters: ScoredPlayer[],
  sleeperIdByKey: Map<string, string>,
  projections: Record<string, number> | undefined,
): SleeperLineupTotal | null {
  if (!projections) return null;
  let total = 0;
  let counted = 0;
  for (const s of starters) {
    const sid = sleeperIdByKey.get(s.player.platformId ?? s.player.id);
    const value = sid ? projections[sid] : undefined;
    if (typeof value === 'number' && Number.isFinite(value)) {
      total += value;
      counted += 1;
    }
  }
  if (counted === 0) return null;
  return { total, counted, starters: starters.length };
}
