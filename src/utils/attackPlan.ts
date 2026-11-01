// Attack plan on the Matchup page (backlog item 79): the focus team's
// optimal-lineup starters grouped by skill position and ranked by how soft
// the NFL defenses they face are this week — each starter's matchup chip
// rolled up into a position-group read, so the manager sees where the
// week's edge comes from ("attack through the air" vs "temper expectations
// for the ground game"). Priced on scoreTeamLineup — the same shared
// scoring core as the preview, position battles, and game plan — and on
// the same bundled allowed-vs-position averages as the matchup chips, so
// nothing here can disagree with either. Competitor source: the
// defense-vs-position "best and worst matchups by position this week"
// boards every major tool publishes (fantasy-injury-news.com,
// statchasers.com, profootballnetwork.com, lineupbeat.com — public feature
// descriptions only, e.g. "ranks 1–8 (green) are the softest matchups");
// TraderApe's version is roster-scoped: it maps those softness ranks onto
// the manager's own starters.

import type { League, Team } from '@/types';
import { scoreTeamLineup } from '@/utils/matchupPreview';
import { matchupLabel, type MatchupRating } from '@/utils/matchupRating';
import { round1 } from '@/utils/rosterScoring';

export const ATTACK_GROUPS = ['QB', 'RB', 'WR', 'TE'] as const;
export type AttackGroup = (typeof ATTACK_GROUPS)[number];

/** Softness verdict on the same ≤10/≥23 thresholds as the weekly matchup
 *  chips and the ROS SOS column. */
export type AttackVerdict = 'soft' | 'avg' | 'tough';

export function attackVerdictFor(avgRank: number): AttackVerdict {
  if (avgRank <= 10) return 'soft';
  if (avgRank >= 23) return 'tough';
  return 'avg';
}

export interface AttackStarter {
  name: string;
  rating: MatchupRating;
  /** This week's projection, 1dp. */
  proj: number;
}

export interface AttackGroupPlan {
  group: AttackGroup;
  /** Mean of the starters' opponent ranks, 1dp; lower = softer. */
  avgRank: number;
  verdict: AttackVerdict;
  /** Rated starters only, name-sorted for determinism. */
  starters: AttackStarter[];
  /** Summed projection of the rated starters, 1dp. */
  proj: number;
}

export interface AttackPlan {
  /** Groups softest-first (lowest avgRank). */
  groups: AttackGroupPlan[];
  best: AttackGroupPlan;
  toughest: AttackGroupPlan;
  week: number;
  /** Skill-position starters with no rating (no scheduled game found) —
   *  excluded from the averages. Bye-week and injured-out players never
   *  reach the optimal lineup, so they can't land here. */
  unrated: number;
}

/** Full accessible line for one starter, reusing the matchup chip's own
 *  wording: "X vs DET · Favorable — DET allows 39.2 pts/game to WRs
 *  (3rd-most points)". */
export function attackStarterLabel(s: AttackStarter, position: string): string {
  return `${s.name} ${matchupLabel(s.rating, position)}`;
}

/** Attack plan for a team's current-week optimal lineup, or null when the
 *  lineup can't be priced or no starter carries a matchup rating (caller
 *  hides the section). */
export function buildAttackPlan(team: Team, league: League): AttackPlan | null {
  const scored = scoreTeamLineup(team, league);
  // Same bail-out as the position battles: a zero projection means no
  // weekly or season data for anyone on the roster — a plan against it
  // would be noise.
  if (!scored || scored.preview.projectedScore <= 0 || scored.starters.length === 0) {
    return null;
  }

  const groups: AttackGroupPlan[] = [];
  let unrated = 0;
  for (const group of ATTACK_GROUPS) {
    const starters = scored.starters
      .filter(s => s.position === group)
      .map(s => {
        if (!s.matchup) {
          unrated += 1;
          return null;
        }
        return { name: s.name, rating: s.matchup, proj: round1(s.score) };
      })
      .filter((s): s is AttackStarter => s !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (starters.length === 0) continue;
    const avgRank = round1(starters.reduce((t, s) => t + s.rating.rank, 0) / starters.length);
    groups.push({
      group,
      avgRank,
      verdict: attackVerdictFor(avgRank),
      starters,
      proj: round1(starters.reduce((t, s) => t + s.proj, 0)),
    });
  }
  if (groups.length === 0) return null;

  // Softest first; ties break in fixed QB/RB/WR/TE group order so the
  // verdict is deterministic.
  groups.sort(
    (a, b) =>
      a.avgRank - b.avgRank ||
      ATTACK_GROUPS.indexOf(a.group) - ATTACK_GROUPS.indexOf(b.group),
  );
  return {
    groups,
    best: groups[0],
    toughest: groups[groups.length - 1],
    week: league.currentWeek ?? 0,
    unrated,
  };
}
