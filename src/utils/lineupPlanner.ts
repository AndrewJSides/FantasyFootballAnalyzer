// Multi-week lineup planner (backlog item 29): optimal lineups for every
// remaining regular-season week, priced on the same projection engine as
// the Start/Sit optimizer. Each week is priced by calling
// scoreRosterPlayers with currentWeek set to that week: the matchup
// display and bye detection both key off the target week, while the form
// series stays today's form (weeks 1..realCurrentWeek-1) — the planner shows how
// the schedule reshapes the lineup, not how form will evolve. Treat far
// weeks as directional: the model does not decay form over time.
// Injury designations follow the Roster Alerts rule: Out benched for the
// current week only, season-ending IR for every remaining week.

import type { RosterSlots } from '@/types';
import { optimalLineup } from '@/utils/optimalLineup';
import {
  round1,
  scoreRosterPlayers,
  type RosterScoreInputs,
  type ScoredPlayer,
} from '@/utils/rosterScoring';
import { outForWeek } from '@/utils/rosterAlerts';
import type { MatchupLabel } from '@/utils/matchupRating';
import type { SoleBackInfo } from '@/utils/roleChange';

export interface PlannedStarter {
  name: string;
  position: string;
  slot: string;
  nflTeam: string;
  opponent: string | null;
  matchupLabel: MatchupLabel | null;
  score: number;
  /**
   * Item-173 sole-back vacancy (null when none): the upside is already
   * folded into `score`, so a consumer rendering the plan can name the
   * priced-in amount instead of re-deriving it.
   */
  soleBack: SoleBackInfo | null;
}

/**
 * A rostered player who would have started this week if he weren't
 * unavailable: the lineup hole that week. Cause 'bye' for bye-week sits,
 * 'injury' for players ruled out by injury (Out this week, or season-ending
 * IR for every remaining week — the same rule as the Roster Alerts scan).
 */
export interface LineupHole {
  name: string;
  position: string;
  nflTeam: string;
  cause: 'bye' | 'injury';
  /** e.g. "Out (Knee)" when cause is 'injury', null otherwise. */
  injuryLabel: string | null;
}

export interface PlannedWeek {
  week: number;
  projectedTotal: number;
  starters: PlannedStarter[];
  /** Rostered players on bye that week — excluded from every lineup. */
  onBye: string[];
  /**
   * Unavailable players who would have started (the unfiltered optimal
   * lineup starts them, so the week loses a starter at their position).
   * The Streamer Planner's per-week engines price the replacement for
   * streamable positions (QB / TE / K / DST).
   */
  holes: LineupHole[];
  toughCount: number;
  favorableCount: number;
}

export interface PlanLineupWeeksInputs extends RosterScoreInputs {
  fromWeek: number;
  toWeek: number;
  slots: RosterSlots;
}

export function planLineupWeeks(inputs: PlanLineupWeeksInputs): PlannedWeek[] {
  const { fromWeek, toWeek, slots, soleBack, ...scoreInputs } = inputs;
  // Injury designations are priced as of today: a player listed Out is
  // benched for the current week only (he may return), while a
  // season-ending designation rules him out for every remaining week —
  // the same rule as the Roster Alerts scan. The form series stays
  // today's form either way.
  const realCurrentWeek = scoreInputs.currentWeek ?? fromWeek;
  const plans: PlannedWeek[] = [];
  for (let week = fromWeek; week <= toWeek; week++) {
    // Item-173: the sole-back vacancy is a this-week signal (a mate ruled
    // out this week may return next week), so only the current week's plan
    // prices it — later weeks price the term as 0, like the pre-wiring
    // behavior, instead of carrying a stale vacancy forward.
    const scored = scoreRosterPlayers({
      ...scoreInputs,
      soleBack: week === realCurrentWeek ? soleBack : undefined,
      currentWeek: week,
    });
    const eligible = scored.filter(
      s => !s.onBye && !outForWeek(s.injuryTier, week, realCurrentWeek),
    );
    const lineup = optimalLineup(eligible, slots);
    // Twice-pass (same pattern as the Roster Alerts scan): run the greedy
    // pass once with the week-unavailable players allowed, so an on-bye
    // or out-for-the-week player who would have started shows up as the
    // hole that week rather than silently vanishing behind his backup.
    const fullLineup = optimalLineup(scored, slots);
    const holes: LineupHole[] = [];
    for (const assignment of fullLineup.starters) {
      const player = assignment.player as ScoredPlayer | null;
      if (!player) continue;
      if (player.onBye) {
        holes.push({
          name: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          cause: 'bye',
          injuryLabel: null,
        });
      } else if (outForWeek(player.injuryTier, week, realCurrentWeek)) {
        holes.push({
          name: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          cause: 'injury',
          injuryLabel: player.injuryLabel,
        });
      }
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
        soleBack: player.soleBack,
      });
    }
    plans.push({
      week,
      projectedTotal: round1(starters.reduce((sum, s) => sum + s.score, 0)),
      starters,
      onBye: scored.filter(s => s.onBye).map(s => s.name),
      holes,
      toughCount: starters.filter(s => s.matchupLabel === 'tough').length,
      favorableCount: starters.filter(s => s.matchupLabel === 'favorable').length,
    });
  }
  return plans;
}
