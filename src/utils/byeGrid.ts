// Bye Week Grid (backlog item 119): the whole league's bye pain at a glance.
//
// For each team and each remaining regular-season week, the cell counts how
// many of that team's OPTIMAL starters are on bye that week — run through
// the same optimalLineup core Roster Alerts uses, scored on bundled-pool
// full-PPR projections, so a bench player on bye never counts and a
// starter's absence is what the number means. The worst week per team
// (most starters out) is flagged so a manager can see, before waivers run,
// which week wrecks his lineup and which week wrecks everyone else's.
//
// League mode only: it needs full rosters. Returns null when no team has
// a resolvable roster (guest mode, empty league) or when the regular
// season is already over.

import type { League, Player, RosterSlots, Team } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import { currentWeekEstimate } from './matchupRating';
import {
  optimalLineup,
  normalizeLineupPos,
  type OptimalLineupPlayer,
} from './optimalLineup';
import { DEFAULT_ROSTER_SLOTS } from './projectedRoster';

export interface ByeGridCell {
  week: number;
  // Optimal starters on bye this week (0 when the full lineup is intact).
  count: number;
  names: string[];
}

export interface ByeGridRow {
  teamId: string;
  teamName: string;
  cells: ByeGridCell[];
  // Total starters lost to byes across all remaining weeks.
  total: number;
  // First week with the most starters out (null when no starter is ever out).
  worstWeek: number | null;
  worstCount: number;
}

export interface ByeGrid {
  weeks: number[];
  rows: ByeGridRow[];
}

// Regular season ends before the playoffs; never grid playoff weeks.
export function byeGridWeeks(league: League): number[] {
  const start = league.currentWeek ?? currentWeekEstimate();
  const end = league.playoffStartWeek
    ? Math.max(1, league.playoffStartWeek - 1)
    : 18;
  const weeks: number[] = [];
  for (let w = Math.max(1, start); w <= end; w++) weeks.push(w);
  return weeks;
}

interface ScoredRosterPlayer extends OptimalLineupPlayer {
  bye: number | null;
}

function scoreRoster(team: Team, pool: DraftPoolFile): ScoredRosterPlayer[] {
  const index = indexPool(pool);
  const out: ScoredRosterPlayer[] = [];
  for (const p of (team.roster ?? []) as Player[]) {
    const resolved = resolvePoolPlayer(p, index);
    if (!resolved) continue;
    out.push({
      id: resolved.id,
      name: resolved.name,
      position: normalizeLineupPos(resolved.pos),
      score: resolved.projPtsPpr ?? 0,
      bye: resolved.bye ?? null,
    });
  }
  return out;
}

export function buildByeGrid(
  league: League,
  pool: DraftPoolFile = POOL,
): ByeGrid | null {
  const weeks = byeGridWeeks(league);
  if (weeks.length === 0) return null;
  const slots: RosterSlots = league.rosterSlots ?? DEFAULT_ROSTER_SLOTS;

  const rows: ByeGridRow[] = [];
  for (const team of league.teams ?? []) {
    const roster = scoreRoster(team, pool);
    if (roster.length === 0) continue;
    // One optimal lineup for the season (same scoring as Roster Alerts):
    // the starters are the players whose bye actually hurts.
    const { starters } = optimalLineup(roster, slots);
    const onByeByWeek = new Map<number, string[]>();
    for (const assigned of starters) {
      const player = assigned.player as ScoredRosterPlayer | null;
      if (player?.bye == null) continue;
      const names = onByeByWeek.get(player.bye) ?? [];
      names.push(player.name);
      onByeByWeek.set(player.bye, names);
    }
    const cells: ByeGridCell[] = weeks.map(week => {
      const names = onByeByWeek.get(week) ?? [];
      return { week, count: names.length, names };
    });
    let worstWeek: number | null = null;
    let worstCount = 0;
    for (const cell of cells) {
      if (cell.count > worstCount) {
        worstCount = cell.count;
        worstWeek = cell.week;
      }
    }
    rows.push({
      teamId: team.id,
      teamName: team.name,
      cells,
      total: cells.reduce((s, c) => s + c.count, 0),
      worstWeek,
      worstCount,
    });
  }
  if (rows.length === 0) return null;
  return { weeks, rows };
}
