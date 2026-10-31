// Waiver priority queue: one ranked "who do I claim first" list per team,
// priced on three league-relative inputs — the player's value (bundled-pool
// full-PPR projection), the team's positional need (the same league-median
// need/surplus math the Trade Finder and FAAB guidance use), and whether
// the player fills an upcoming roster gap (the Roster Alerts' bye-week
// hole/bye-watch fillers). FAAB bid ranges price each row where the league
// has recorded bids; without bid data the ranking still works and the bid
// column drops to a note. Guidance only: nothing claims anyone here.
//
// Competitor rationale (item 46): FantasyPros' Waiver Assistant "integrates
// with your league to analyze your roster and league activity, recommending
// the most beneficial waiver moves. It considers your team's needs, player
// bye weeks, and overall strategy" — this is TraderApe's version of that,
// built from TraderApe's own engines and numbers.

import type { League, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { normalizeLineupPos } from './optimalLineup';
import type { PositionKey } from './tradeAnalysis';
import { teamProfiles } from './tradeFinder';
import {
  availableTargets,
  faabNorms,
  suggestBid,
} from './faabGuidance';
import { teamRosterAlerts } from './rosterAlerts';

const PRIORITY_POSITIONS: PositionKey[] = ['QB', 'RB', 'WR', 'TE'];

// A gap-filler (bye-week hole or bye-watch cover over the next three weeks)
// jumps the queue ahead of a same-value player with no timing need.
const GAP_FILL_MULTIPLIER = 1.5;
const NEED_MULTIPLIER = 1.25;
const SURPLUS_MULTIPLIER = 0.85;

export interface WaiverPriorityTarget {
  player: PoolPlayer;
  // Higher = claim first. Ranked descending.
  score: number;
  // Weeks (current week through +3) where this player fills a roster gap.
  gapWeeks: number[];
  need: boolean;
  surplus: boolean;
  // FAAB bid band when the league has recorded bids; null otherwise.
  bid: { low: number; high: number } | null;
  // Plain-language reasons, strongest first.
  reasons: string[];
}

function posKeyOf(position: string | undefined): PositionKey | null {
  const p = (position ?? '').toUpperCase();
  return (PRIORITY_POSITIONS as string[]).includes(p) ? (p as PositionKey) : null;
}

// Map pool-player id -> the alert weeks they fill as a waiver option.
function gapFillersByPlayer(
  league: League,
  team: Team,
  pool: DraftPoolFile,
): Map<string, number[]> {
  const fillers = new Map<string, number[]>();
  for (const alert of teamRosterAlerts(league, team, pool)) {
    for (const filler of alert.fillers) {
      const weeks = fillers.get(filler.id) ?? [];
      if (!weeks.includes(alert.week)) weeks.push(alert.week);
      fillers.set(filler.id, weeks);
    }
  }
  for (const weeks of fillers.values()) weeks.sort((a, b) => a - b);
  return fillers;
}

export function buildWaiverPriority(
  league: League,
  team: Team,
  pool: DraftPoolFile = POOL,
  limit = 8,
): WaiverPriorityTarget[] {
  const profiles = teamProfiles(league, pool);
  const profile = profiles.find(pr => pr.team.id === team.id);
  const norms = faabNorms(league, pool);
  const gapFillers = gapFillersByPlayer(league, team, pool);

  const targets = availableTargets(league, pool, Math.max(limit, 12));

  return targets
    .map(player => {
      const pos = posKeyOf(player.pos) ?? 'WR';
      const need = profile?.positions[pos]?.need ?? false;
      const surplus = !need && (profile?.positions[pos]?.surplus ?? false);
      const gapWeeks = gapFillers.get(player.id) ?? [];

      const score =
        (player.projPtsPpr ?? 0) *
        (need ? NEED_MULTIPLIER : surplus ? SURPLUS_MULTIPLIER : 1) *
        (gapWeeks.length > 0 ? GAP_FILL_MULTIPLIER : 1);

      const reasons: string[] = [];
      if (gapWeeks.length > 0) {
        const slot = normalizeLineupPos(player.pos);
        reasons.push(
          `Fills your Week ${gapWeeks.join(' / Week ')} ${slot} gap — ` +
            `your starter${gapWeeks.length > 1 ? 's are' : ' is'} on bye.`,
        );
      }
      if (need) {
        reasons.push(
          `Need at ${pos}: your best is below the league median, so this is a starter-grade add.`,
        );
      } else if (surplus) {
        reasons.push(
          `Surplus at ${pos}: you can cover the spot already, so this is depth only.`,
        );
      }
      if (norms) {
        const suggestion = suggestBid(player, team, profiles, norms);
        reasons.push(`Suggested FAAB bid: $${suggestion.low}–$${suggestion.high}.`);
      }

      return {
        player,
        score,
        gapWeeks,
        need,
        surplus,
        bid: norms
          ? (() => {
              const s = suggestBid(player, team, profiles, norms);
              return { low: s.low, high: s.high };
            })()
          : null,
        reasons,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.player.name.localeCompare(b.player.name),
    )
    .slice(0, Math.max(0, limit));
}
