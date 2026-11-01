// Top Free Agents board engine (backlog item 80).
//
// The league-wide "who can I actually add" board: every row from the
// Weekly Rankings engine (this week's TraderApe projection + matchup +
// consistency) filtered to players no league team rosters, grouped by
// position. Pure: the page builds the rows with buildWeeklyRankings and
// this module keeps only the unrostered top-N per position, so the board
// and the Weekly Rankings page can never disagree on a player's numbers.

import type { WeeklyRankRow } from './weeklyRankings';

export const TOP_FREE_AGENT_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type TopFreeAgentPosition = (typeof TOP_FREE_AGENT_POSITIONS)[number];

/** The best available free agents at one position, engine rank order. */
export interface FreeAgentGroup {
  position: TopFreeAgentPosition;
  rows: WeeklyRankRow[];
}

/**
 * Keep the unrostered rows (owner == null) from a buildWeeklyRankings
 * result, grouped by position, top `perPosition` per position in the
 * engine's own rank order. Rows for other positions are ignored.
 */
export function topFreeAgents(
  rows: WeeklyRankRow[],
  perPosition = 10,
): FreeAgentGroup[] {
  return TOP_FREE_AGENT_POSITIONS.map(position => ({
    position,
    rows: rows
      .filter(r => r.player.pos === position && r.owner == null)
      .slice(0, Math.max(0, perPosition)),
  }));
}
