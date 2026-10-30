// Waiver Stash Report (backlog item 23): the "stash him before the waiver
// rush" answer. An available (unrostered; everything in guest mode) player
// is worth stashing when his rest-of-season value is high but a short-term
// reason makes him cheap this week — the Handcuff Report's lead-back
// insurance, an injury return (O/Q/D, never season-ending), or a bye-week
// discount (on bye now, so managers dropped him for coverage). Ranked by
// TraderApe's own season-outlook engine (same engine as the ROS Rankings).
// FantasyPros runs a weekly "Waiver Wire Stashes" series (researched for
// feature shape only); this is computed from TraderApe's own data —
// bundled pool, depth charts, injury designations, bye weeks — no new data
// source, no copied content. Guidance only: nothing here moves a roster.

import type { PoolPlayer } from '@/types/draft';
import type { SeasonOutlook } from './seasonOutlook';
import {
  buildHandcuffReport,
  type HandcuffStatus,
} from './handcuffReport';
import { injuryTier } from './injuryReport';
import {
  buildRosRankings,
  type RosBuildInput,
  type RosRow,
} from './rosRankings';

export type StashReason = 'handcuff' | 'injury-return' | 'bye-discount';

export const STASH_REASONS: StashReason[] = [
  'handcuff',
  'injury-return',
  'bye-discount',
];

export interface StashRow {
  player: PoolPlayer;
  outlook: SeasonOutlook;
  /** 1-based ROS rank within his position (same rank as the ROS Rankings). */
  posRank: number;
  reasons: StashReason[];
}

export interface StashReportInput extends RosBuildInput {
  /** Rows returned; default 8. */
  maxRows?: number;
}

const DEFAULT_MAX_ROWS = 8;

// Injury designations that keep a player out now but leave his season
// alive — the injury-return stash case. 'season-ending' rows are never
// stashes; 'other' is too ambiguous to act on.
const RETURNABLE_TIERS = new Set(['out', 'doubtful', 'questionable']);

// Handcuff statuses that leave the cuff unowned (league) or unknowable
// (guest): either way the insurance case stands.
const STASHABLE_CUFF: ReadonlySet<HandcuffStatus> = new Set([
  'available',
  'unknown',
]);

export function stashReasons(
  row: RosRow,
  handcuffPoolIds: Set<string>,
  currentWeek: number,
): StashReason[] {
  const reasons: StashReason[] = [];
  if (handcuffPoolIds.has(row.player.id)) reasons.push('handcuff');
  const tier = injuryTier(row.player);
  if (tier === 'season-ending') return [];
  if (RETURNABLE_TIERS.has(tier)) reasons.push('injury-return');
  if (row.player.bye === currentWeek) reasons.push('bye-discount');
  return reasons;
}

export function buildStashReport(input: StashReportInput): StashRow[] {
  const maxRows = input.maxRows ?? DEFAULT_MAX_ROWS;
  const ros = buildRosRankings(input);
  const handcuffPoolIds = new Set<string>();
  for (const pair of buildHandcuffReport({
    pool: input.pool,
    ownerByPoolId: input.ownerByPoolId,
  })) {
    if (STASHABLE_CUFF.has(pair.status)) handcuffPoolIds.add(pair.handcuff.id);
  }

  const rows: StashRow[] = [];
  for (const row of ros) {
    // Rostered players aren't stashes (guest mode: no rosters, everything
    // is treated as available — matches the ROS page's guest behavior).
    if (row.owner != null) continue;
    const reasons = stashReasons(row, handcuffPoolIds, input.currentWeek);
    if (reasons.length === 0) continue;
    // A stash needs forward value; a zero-ROS projection is a dead stash.
    if (row.outlook.projectedPoints <= 0) continue;
    rows.push({
      player: row.player,
      outlook: row.outlook,
      posRank: row.posRank,
      reasons,
    });
  }
  rows.sort(
    (a, b) =>
      b.outlook.projectedPoints - a.outlook.projectedPoints ||
      a.posRank - b.posRank,
  );
  return rows.slice(0, maxRows);
}
