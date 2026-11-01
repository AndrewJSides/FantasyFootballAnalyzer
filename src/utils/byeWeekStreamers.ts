// Lineup-hole streamer picks (backlog items 61 + 67 remainder): the Plan
// Ahead table names lineup holes, but left the manager to find the
// replacement. This joins the lineup planner's holes (bye-week sits from
// item 29, injury-out holes from item 67's remainder) with the weekly
// streamer engines (items 14/15/39, re-run per week like the Streamer
// Planner, item 40): for each week where a rostered player at a streamable
// position (D/ST, K, QB, TE) would have started if he weren't unavailable,
// it names the week's best available streamer at that position as the
// pick-up.
//
// Implemented from TraderApe's own data (bundled schedule + opponent-
// generosity averages); the competitor shape is FantasyPros' Waiver
// Assistant, whose public description says it "considers your team's needs,
// player bye weeks, and overall strategy to suggest additions".

import type { LineupHole } from '@/utils/lineupPlanner';
import { basePosition } from '@/utils/playerNames';
import {
  rankDstStreamers,
  type DstMatchup,
  type DstMatchupLabel,
} from '@/utils/dstStreamers';
import {
  rankKickerStreamers,
  type KickerMatchup,
  type KickerMatchupLabel,
} from '@/utils/kickerStreamers';
import {
  rankSkillStreamers,
  type SkillMatchup,
  type SkillMatchupLabel,
  type SkillStreamerPosition,
} from '@/utils/skillStreamers';

export type StreamerPosition = 'QB' | 'TE' | 'K' | 'DST';

/** Rosters that make a streamer unavailable — league-wide, like the Waivers page. */
export interface StreamerExclusions {
  /** Canonical NFL abbrevs of defenses already on a league roster. */
  rosteredDefenses: ReadonlySet<string>;
  /** Canonical NFL abbrevs of teams whose kicker is already rostered. */
  rosteredKickerTeams: ReadonlySet<string>;
  /** Bundled pool ids of rostered QBs/TEs. */
  rosteredSkillIds: ReadonlySet<string>;
}

export interface HoleStreamerPick {
  /** The rostered player whose absence created the need. */
  holeName: string;
  /** Why the hole exists: 'bye' or 'injury'. */
  cause: 'bye' | 'injury';
  /** e.g. "Out (Knee)" for injury holes, null for bye holes. */
  injuryLabel: string | null;
  position: StreamerPosition;
  /** The recommended streamer's name (or defense abbrev for D/ST). */
  pickName: string;
  /** The streamer's opponent that week (canonical abbrev). */
  opponent: string;
  label: DstMatchupLabel | KickerMatchupLabel | SkillMatchupLabel;
}

export const EMPTY_STREAMER_EXCLUSIONS: StreamerExclusions = {
  rosteredDefenses: new Set<string>(),
  rosteredKickerTeams: new Set<string>(),
  rosteredSkillIds: new Set<string>(),
};

/** Optional injected data fixtures (tests); omitted in production, which
 * prices on the bundled JSON. */
export interface ByeWeekStreamerFixtures {
  schedule?: Parameters<typeof rankDstStreamers>[3];
  dstGenerosity?: Parameters<typeof rankDstStreamers>[4];
  kickerGenerosity?: Parameters<typeof rankKickerStreamers>[4];
  kickerMap?: Parameters<typeof rankKickerStreamers>[5];
  allowed?: Parameters<typeof rankSkillStreamers>[5];
  skillStarters?: Parameters<typeof rankSkillStreamers>[6];
}

/** Lineup holes at streamable positions only (QB/TE/K/DST); RB/WR have no streamer engine. */
export function streamableHoles(holes: LineupHole[]): Array<LineupHole & { position: StreamerPosition }> {
  const out: Array<LineupHole & { position: StreamerPosition }> = [];
  for (const hole of holes) {
    const base = basePosition(hole.position ?? '');
    if (base === 'QB' || base === 'TE' || base === 'K' || base === 'DST') {
      out.push({ ...hole, position: base as StreamerPosition });
    }
  }
  return out;
}

/** One best-available streamer per hole, grouped by position so multiple
 * holes at the same position get distinct picks in rank order. */
export function holeStreamerPicks(
  week: number,
  holes: LineupHole[],
  exclusions: StreamerExclusions,
  fixtures: ByeWeekStreamerFixtures = {},
): HoleStreamerPick[] {
  const streamable = streamableHoles(holes);
  if (streamable.length === 0) return [];
  const picks: HoleStreamerPick[] = [];
  const byPosition = new Map<StreamerPosition, typeof streamable>();
  for (const hole of streamable) {
    const list = byPosition.get(hole.position) ?? [];
    list.push(hole);
    byPosition.set(hole.position, list);
  }
  for (const [position, positionHoles] of byPosition) {
    const ranked = rankForPosition(week, position, positionHoles.length, exclusions, fixtures);
    for (let i = 0; i < positionHoles.length && i < ranked.length; i++) {
      picks.push({
        holeName: positionHoles[i].name,
        cause: positionHoles[i].cause,
        injuryLabel: positionHoles[i].injuryLabel,
        position,
        pickName: ranked[i].pickName,
        opponent: ranked[i].opponent,
        label: ranked[i].label,
      });
    }
  }
  return picks;
}

interface RankedPick {
  pickName: string;
  opponent: string;
  label: DstMatchupLabel | KickerMatchupLabel | SkillMatchupLabel;
}

function rankForPosition(
  week: number,
  position: StreamerPosition,
  limit: number,
  exclusions: StreamerExclusions,
  fixtures: ByeWeekStreamerFixtures,
): RankedPick[] {
  if (position === 'DST') {
    return rankDstStreamers(
      week,
      exclusions.rosteredDefenses,
      limit,
      fixtures.schedule,
      fixtures.dstGenerosity,
    ).map((m: DstMatchup) => ({ pickName: m.team, opponent: m.opponent, label: m.label }));
  }
  if (position === 'K') {
    return rankKickerStreamers(
      week,
      exclusions.rosteredKickerTeams,
      limit,
      fixtures.schedule,
      fixtures.kickerGenerosity,
      fixtures.kickerMap,
    ).map((m: KickerMatchup) => ({ pickName: m.name, opponent: m.opponent, label: m.label }));
  }
  return rankSkillStreamers(
    week,
    position as SkillStreamerPosition,
    exclusions.rosteredSkillIds,
    limit,
    fixtures.schedule,
    fixtures.allowed,
    fixtures.skillStarters,
  ).map((m: SkillMatchup) => ({ pickName: m.name, opponent: m.opponent, label: m.label }));
}
