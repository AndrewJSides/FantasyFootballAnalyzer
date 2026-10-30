// Weekly Game Plan (backlog item 24a): start/sit swap flags for one team's
// optimal lineup, priced on the same shared scoring core as the Start/Sit
// optimizer and the matchup preview (scoreRosterPlayers + optimalLineup),
// so the flags can never disagree with either.
//
// The optimizer's greedy pass is optimal (nested slot eligibility), so no
// bench player ever strictly improves the projected total under TraderApe's
// own numbers — the flags instead name the starts that are CLOSE calls:
// bench players eligible for a starting slot whose projection is within
// TOSS_UP_THRESHOLD points of the starter. That is the honest game-plan
// signal: "the model starts X, but Y is within a point — use your judgment".
// A flag whose challenger outprojects the starter ('upgrade') can't arise
// from the optimal pass, but the kind is kept so the verdict reads honestly
// either way. Nothing here changes the lineup — guidance only.

import type { League, Team } from '@/types';
import { DEFAULT_ROSTER_SLOTS } from '@/utils/draftDefaults';
import { optimalLineup, slotEligiblePositions, normalizeLineupPos } from '@/utils/optimalLineup';
import { scoreRosterPlayers, type ScoredPlayer } from '@/utils/rosterScoring';

/** A bench player within this many points of a starter is a close call. */
export const TOSS_UP_THRESHOLD = 2;

export interface SwapFlag {
  slot: string;
  starterName: string;
  starterScore: number;
  challengerName: string;
  challengerScore: number;
  /** Challenger minus starter, 2dp. */
  gain: number;
  /** 'upgrade' only fires if a bench player outprojects a starter. */
  kind: 'toss-up' | 'upgrade';
  /** Plain-language explanation of the call. */
  note: string;
}

export interface GamePlan {
  teamId: string;
  /** Starting slots in display order, with the assigned player (null = empty slot). */
  slots: { slot: string; player: ScoredPlayer | null }[];
  starters: ScoredPlayer[];
  /** Best challenger per starting slot, highest gain first. */
  swapFlags: SwapFlag[];
}

function swapNote(starter: ScoredPlayer, challenger: ScoredPlayer, gain: number): string {
  if (gain > 0) {
    return `${challenger.name} outprojects ${starter.name} by ${Math.abs(gain).toFixed(1)} — the model would start the bench player here.`;
  }
  return `${challenger.name} is within ${Math.abs(gain).toFixed(1)} of ${starter.name} — a coin flip; check matchup and news before sitting the starter.`;
}

/** The start/sit close calls for one team this week: every starting slot
 *  whose best bench challenger is within TOSS_UP_THRESHOLD (or better) of
 *  the starter. Players on bye never start, same as the preview. */
export function buildGamePlan(
  team: Team,
  league: Pick<
    League,
    'rosterSlots' | 'currentWeek' | 'season' | 'playerWeeklyPoints' | 'gamesPlayed'
  >,
): GamePlan {
  const roster = team.roster ?? [];
  const scored = scoreRosterPlayers({
    roster,
    weeklyPoints: league.playerWeeklyPoints,
    gamesBySleeperId: league.gamesPlayed?.bySleeperId,
    gamesSeason: league.gamesPlayed?.season,
    season: league.season,
    currentWeek: league.currentWeek,
  });
  const lineup = optimalLineup(
    scored.filter(s => !s.onBye),
    league.rosterSlots ?? DEFAULT_ROSTER_SLOTS,
  );
  const byId = new Map(scored.map(s => [s.id, s]));
  const flags: SwapFlag[] = [];
  for (const slot of lineup.starters) {
    const starter = slot.player;
    if (!starter) continue;
    // The assigned player came from the scored list — resolve the full
    // ScoredPlayer (projection, bye, matchup) via the scored map.
    const starterScored = byId.get(starter.id);
    if (!starterScored) continue;
    const eligible = slotEligiblePositions(slot.slot);
    let best: ScoredPlayer | null = null;
    for (const b of lineup.bench) {
      const bp = byId.get(b.id);
      if (!bp || !eligible.includes(normalizeLineupPos(bp.position))) continue;
      if (bp.score < starterScored.score - TOSS_UP_THRESHOLD) continue;
      if (!best || bp.score > best.score) best = bp;
    }
    if (best) {
      const gain = Math.round((best.score - starterScored.score) * 100) / 100;
      flags.push({
        slot: slot.slot,
        starterName: starterScored.name,
        starterScore: starterScored.score,
        challengerName: best.name,
        challengerScore: best.score,
        gain,
        kind: gain > 0 ? 'upgrade' : 'toss-up',
        note: swapNote(starterScored, best, gain),
      });
    }
  }
  flags.sort((a, b) => b.gain - a.gain || a.slot.localeCompare(b.slot));
  const starters = lineup.starters
    .map(s => s.player)
    .filter((p): p is ScoredPlayer => p !== null);
  const slots = lineup.starters.map(s => ({
    slot: s.slot,
    player: s.player !== null ? (byId.get(s.player.id) ?? null) : null,
  }));
  return { teamId: team.id, slots, starters, swapFlags: flags };
}
