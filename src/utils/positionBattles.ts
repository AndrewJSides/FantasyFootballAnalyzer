// Position battles on the Matchup page (backlog item 41): the two teams'
// optimal-lineup starters grouped by position (QB / RB / WR / TE / K / DST)
// with summed weekly projections per side, so the manager can see where the
// matchup is won or lost. Priced on scoreTeamLineup — the same shared
// scoring core as the preview and the game plan, so the three can't
// disagree. Competitor source: the position-by-position starter comparison
// on Yahoo's and ESPN's weekly matchup pages (public feature descriptions
// only — the comparison values are TraderApe's own projections).

import type { League, Team } from '@/types';
import { scoreTeamLineup } from '@/utils/matchupPreview';
import { round1 } from '@/utils/rosterScoring';

export const POSITION_GROUP_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const;
export type PositionGroup = (typeof POSITION_GROUP_ORDER)[number];

/** |A − B| under this (full-PPR points) scores the battle even. */
export const EVEN_BAND = 0.5;

export interface BattleSide {
  /** Starter names + their projections, name-sorted for determinism. */
  players: { name: string; proj: number }[];
  /** Summed projection, 1dp. */
  proj: number;
}

export interface PositionBattle {
  group: PositionGroup;
  a: BattleSide;
  b: BattleSide;
  /** Who the group favors: 'a', 'b', or 'even' inside EVEN_BAND. */
  edge: 'a' | 'b' | 'even';
  /** Signed margin in A's favor, 1dp. */
  margin: number;
}

function toGroup(pos: string): PositionGroup | null {
  const p = pos === 'DEF' || pos === 'D/ST' ? 'DST' : pos;
  return (POSITION_GROUP_ORDER as readonly string[]).includes(p)
    ? (p as PositionGroup)
    : null;
}

/** Position battles for the two teams' current-week optimal lineups, or
 *  null when either side can't be priced (caller hides the section). */
export function buildPositionBattles(
  teamA: Team,
  teamB: Team,
  league: League,
): PositionBattle[] | null {
  const a = scoreTeamLineup(teamA, league);
  const b = scoreTeamLineup(teamB, league);
  // A zero projection means no weekly or season data for anyone on the
  // roster — a battle against it would be noise, so bail like the preview
  // does (previewWeeklyMatchups skips zero-projection teams the same way).
  if (!a || !b || a.preview.projectedScore <= 0 || b.preview.projectedScore <= 0) return null;
  if (a.starters.length === 0 || b.starters.length === 0) return null;

  return POSITION_GROUP_ORDER.map(group => {
    const side = (starters: typeof a.starters): BattleSide => {
      const players = starters
        .filter(s => toGroup(s.position) === group)
        .map(s => ({ name: s.name, proj: round1(s.score) }))
        .sort((x, y) => x.name.localeCompare(y.name));
      return { players, proj: round1(players.reduce((t, p) => t + p.proj, 0)) };
    };
    const sa = side(a.starters);
    const sb = side(b.starters);
    const margin = round1(sa.proj - sb.proj);
    const edge: PositionBattle['edge'] =
      margin >= EVEN_BAND ? 'a' : margin <= -EVEN_BAND ? 'b' : 'even';
    return { group, a: sa, b: sb, edge, margin };
  }).filter(bt => bt.a.players.length > 0 || bt.b.players.length > 0);
}
