// Multi-week lineup planner (backlog item 29): optimal lineups for every
// remaining regular-season week, priced on the same projection + matchup
// engine as the Start/Sit optimizer. Each week is priced by calling
// scoreRosterPlayers with currentWeek set to that week: the matchup blend
// and bye detection both key off the target week, while the form series
// stays today's form (weeks 1..realCurrentWeek-1) — the planner shows how
// the schedule reshapes the lineup, not how form will evolve. Treat far
// weeks as directional: the model does not decay form over time.

import type { RosterSlots } from '@/types';
import { optimalLineup } from '@/utils/optimalLineup';
import {
  round1,
  scoreRosterPlayers,
  type RosterScoreInputs,
  type ScoredPlayer,
} from '@/utils/rosterScoring';
import type { MatchupLabel } from '@/utils/matchupRating';

export interface PlannedStarter {
  name: string;
  position: string;
  slot: string;
  nflTeam: string;
  opponent: string | null;
  matchupLabel: MatchupLabel | null;
  score: number;
}

/**
 * A rostered player who would have started this week if he weren't on bye
 * (or otherwise excluded from the lineup pass): the lineup hole that week.
 */
export interface ByeHole {
  name: string;
  position: string;
  nflTeam: string;
}

export interface PlannedWeek {
  week: number;
  projectedTotal: number;
  starters: PlannedStarter[];
  /** Rostered players on bye that week — excluded from every lineup. */
  onBye: string[];
  /**
   * On-bye players who would have started (the unfiltered optimal lineup
   * starts them, so the week loses a starter at their position). The
   * Streamer Planner's per-week engines price the replacement for
   * streamable positions (QB / TE / K / DST).
   */
  byeHoles: ByeHole[];
  toughCount: number;
  favorableCount: number;
}

export interface PlanLineupWeeksInputs extends RosterScoreInputs {
  fromWeek: number;
  toWeek: number;
  slots: RosterSlots;
}

export function planLineupWeeks(inputs: PlanLineupWeeksInputs): PlannedWeek[] {
  const { fromWeek, toWeek, slots, ...scoreInputs } = inputs;
  const plans: PlannedWeek[] = [];
  for (let week = fromWeek; week <= toWeek; week++) {
    const scored = scoreRosterPlayers({ ...scoreInputs, currentWeek: week });
    const eligible = scored.filter(s => !s.onBye);
    const lineup = optimalLineup(eligible, slots);
    // Twice-pass (same pattern as the Roster Alerts scan): run the greedy
    // pass once with the bye players allowed, so an on-bye player who
    // would have started shows up as the hole that week rather than
    // silently vanishing behind his backup.
    const fullLineup = optimalLineup(scored, slots);
    const byeHoles: ByeHole[] = [];
    for (const assignment of fullLineup.starters) {
      const player = assignment.player as ScoredPlayer | null;
      if (!player || !player.onBye) continue;
      byeHoles.push({
        name: player.name,
        position: player.position,
        nflTeam: player.nflTeam,
      });
    }
    const starters: PlannedStarter[] = [];
    for (const assignment of lineup.starters) {
      const player = assignment.player as ScoredPlayer | null;
      if (!player) continue;
      starters.push({
        name: player.name,
        position: player.position,
        slot: assignment.slot,
        nflTeam: player.nflTeam,
        opponent: player.matchup?.opponent ?? null,
        matchupLabel: player.matchup?.label ?? null,
        score: round1(player.score),
      });
    }
    plans.push({
      week,
      projectedTotal: round1(starters.reduce((sum, s) => sum + s.score, 0)),
      starters,
      onBye: scored.filter(s => s.onBye).map(s => s.name),
      byeHoles,
      toughCount: starters.filter(s => s.matchupLabel === 'tough').length,
      favorableCount: starters.filter(s => s.matchupLabel === 'favorable').length,
    });
  }
  return plans;
}
