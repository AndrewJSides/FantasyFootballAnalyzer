// Multi-week streamer planner (backlog item 40): the best available
// streamer at D/ST, K, QB and TE for every remaining week, so managers can
// plan pickups ahead instead of re-streaming blind each Tuesday.
//
// Reuses the rank-per-week engines from items 14/15/39 (dstStreamers,
// kickerStreamers, skillStreamers) — those take a week argument and price
// each week on the bundled schedule plus season-to-date opponent generosity,
// exactly like the weekly streamer sections. Each future week is priced on
// today's generosity numbers: a difficulty map, not a forecast.

import type { League } from '@/types';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import { basePosition, canonicalTeam } from '@/utils/playerNames';
import {
  rankDstStreamers,
  type DstMatchup,
} from '@/utils/dstStreamers';
import {
  rankKickerStreamers,
  type KickerMatchup,
} from '@/utils/kickerStreamers';
import {
  rankSkillStreamers,
  type SkillMatchup,
} from '@/utils/skillStreamers';

export interface StreamerPlanRow {
  week: number;
  /** Best available defense that week (null when none has a game). */
  dst: DstMatchup | null;
  /** Best available kicker that week (null when none has a game). */
  kicker: KickerMatchup | null;
  /** Best available QB that week (null when none has a game). */
  qb: SkillMatchup | null;
  /** Best available TE that week (null when none has a game). */
  te: SkillMatchup | null;
}

export interface StreamerPlanInputs {
  fromWeek: number;
  toWeek: number;
  /** Canonical NFL abbrevs of defenses already on a league roster. */
  rosteredDefenses: ReadonlySet<string>;
  /** Canonical NFL abbrevs of teams whose kicker is already rostered. */
  rosteredKickerTeams: ReadonlySet<string>;
  /** Bundled pool ids of rostered QBs/TEs (both positions, one set). */
  rosteredSkillIds: ReadonlySet<string>;
}

/**
 * One row per week from fromWeek through toWeek (inclusive): the single
 * best streamable option at each position, ranked by opponent generosity
 * exactly like the weekly streamer sections. Weeks sort ascending; a week
 * with no streamable defense still yields a row so the grid stays regular.
 */
export function buildStreamerPlan(inputs: StreamerPlanInputs): StreamerPlanRow[] {
  const { fromWeek, toWeek, rosteredDefenses, rosteredKickerTeams, rosteredSkillIds } =
    inputs;
  const rows: StreamerPlanRow[] = [];
  for (let week = fromWeek; week <= toWeek; week++) {
    rows.push({
      week,
      dst: rankDstStreamers(week, rosteredDefenses, 1)[0] ?? null,
      kicker: rankKickerStreamers(week, rosteredKickerTeams, 1)[0] ?? null,
      qb: rankSkillStreamers(week, 'QB', rosteredSkillIds, 1)[0] ?? null,
      te: rankSkillStreamers(week, 'TE', rosteredSkillIds, 1)[0] ?? null,
    });
  }
  return rows;
}

/**
 * The last week the planner covers: the week before the fantasy playoffs
 * start (streaming matters most for the regular-season stretch), falling
 * back to week 14, clipped at week 18. Same horizon as the lineup planner.
 */
export function planEndWeek(league: League, currentWeek: number): number {
  const end = league.playoffStartWeek ? league.playoffStartWeek - 1 : 14;
  return Math.min(Math.max(end, currentWeek), 18);
}

// The NFL defenses already on a league roster — those aren't streamable.
export function rosteredDefenseTeams(league: League): Set<string> {
  const rostered = new Set<string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      if (basePosition(p.position ?? '') === 'DST') {
        const abbr = canonicalTeam(p.team ?? '');
        if (abbr) rostered.add(abbr);
      }
    }
  }
  return rostered;
}

// The NFL teams whose kicker is already on a league roster — not streamable.
export function rosteredKickerTeams(league: League): Set<string> {
  const rostered = new Set<string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      if (basePosition(p.position ?? '') === 'K') {
        const abbr = canonicalTeam(p.team ?? '');
        if (abbr) rostered.add(abbr);
      }
    }
  }
  return rostered;
}

// The pool ids of QBs and TEs already on a league roster — not streamable.
// Resolves each roster player through the pool index so ESPN and Yahoo id
// schemes still match.
export function rosteredSkillPlayerIds(league: League): Set<string> {
  const index = indexPool(POOL);
  const rostered = new Set<string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      const pooled = resolvePoolPlayer(p, index);
      if (pooled && (pooled.pos === 'QB' || pooled.pos === 'TE')) {
        rostered.add(pooled.id);
      }
    }
  }
  return rostered;
}
