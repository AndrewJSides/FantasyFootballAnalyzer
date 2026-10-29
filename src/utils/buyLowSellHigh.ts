// Buy Low / Sell High trade targets (backlog item 16).
//
// Flags players scoring well below (or above) TraderApe's own forward
// projection over the last 3 weeks as regression candidates, with
// remaining-schedule softness/toughness as the kicker. Pure points-level
// math on the same engines everything else uses — the weekly projection
// model (recency-weighted form blended with the season baseline),
// VOR value, and the ROS matchup-strength ratings — so the targets are
// consistent with the Start/Sit, Trade Finder, and Rankings numbers.
//
// A buy-low target is a startable asset (VOR >= 1) averaging at least 3
// points under his forward projection over his last 3; a sell-high target
// is the mirror image. Nothing here moves rosters — it's trade research.

import type { PoolPlayer } from '@/types/draft';
import type { WeekPoints } from './weeklyProjection';
import { projectWeeklyPoints } from './weeklyProjection';
import { rosMatchupStrength, type RosScheduleStrength } from './rosSchedule';
import {
  DEFAULT_VOR_CONFIG,
  vorPoints,
  type ValueLeague,
  type VorConfig,
} from './projectionValues';

// Positions the engine covers (matchup data is positional).
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

// A candidate has to be a real trade asset: startable value on VOR.
export const VOR_FLOOR = 1.0;
// Points of under/over-performance over the last 3 that earns a flag.
// Matches the spirit of the grading script's ±5 weekly band, tightened to 3
// because this compares 3-week averages, not single weeks.
export const GAP_THRESHOLD = 3.0;
// How many candidates each side keeps.
export const MAX_TARGETS = 6;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface MarketTarget {
  player: PoolPlayer;
  /** Owning league team name, or null (unrostered / guest mode). */
  rosteredBy: string | null;
  /** Average actual points over the recent window (rounded). */
  last3: number;
  /** Weeks in the recent window with a stat line. */
  last3Weeks: number;
  /** TraderApe's forward projection, matchup-neutral (rounded). */
  projection: number;
  /** projection - last3 (positive = underperforming, rounded). */
  gap: number;
  vor: number;
  ros: RosScheduleStrength | null;
  /** Plain-language reasons, ordered strongest first. */
  reasons: string[];
}

export interface MarketTargetsInput {
  poolPlayers: PoolPlayer[];
  /** Weekly points keyed by platform player id (league) or Sleeper id (guest). */
  weeklyPoints?: Record<string, Record<string | number, number>>;
  /** League mode: pool player id -> platform player id for the weekly lookup. */
  platformIdByPoolId?: Map<string, string>;
  /** League mode: pool player id -> owning team name. */
  teamByPoolId?: Map<string, string>;
  currentWeek: number;
  valueLeague: ValueLeague;
  vorCfg?: VorConfig;
}

function weeklyKey(p: PoolPlayer, input: MarketTargetsInput): string {
  return input.platformIdByPoolId?.get(p.id) ?? p.sleeperId ?? p.id;
}

function completedEntries(
  p: PoolPlayer,
  input: MarketTargetsInput,
): WeekPoints[] {
  const byWeek = input.weeklyPoints?.[weeklyKey(p, input)] ?? {};
  return Object.entries(byWeek)
    .map(([w, pts]) => ({ week: Number(w), pts: Number(pts) }))
    .filter(
      e =>
        Number.isFinite(e.week) &&
        Number.isFinite(e.pts) &&
        e.week < input.currentWeek,
    )
    .sort((a, b) => a.week - b.week);
}

function targetFor(
  p: PoolPlayer,
  vor: number,
  input: MarketTargetsInput,
): MarketTarget | null {
  if (!POSITIONS.has(p.pos.toUpperCase())) return null;
  const entries = completedEntries(p, input);
  if (entries.length === 0) return null;
  // The recent window: the last 3 completed weeks only, requiring at least
  // 2 stat lines so one hot/cold game can't drive the flag alone.
  const recent = entries.filter(e => e.week >= input.currentWeek - 3);
  if (recent.length < 2) return null;
  const last3 = round1(recent.reduce((s, e) => s + e.pts, 0) / recent.length);
  // Forward expectation, matchup-neutral: the projection model's
  // recency-weighted form blended with the season baseline.
  const projection = projectWeeklyPoints(entries, entries.length, null)?.projection;
  if (projection === undefined || projection === null) return null;
  const gap = round1(projection - last3);
  if (Math.abs(gap) < GAP_THRESHOLD) return null;

  const ros = rosMatchupStrength(p.team, p.pos, input.currentWeek);
  const reasons: string[] = [];
  if (gap > 0) {
    reasons.push(
      `Averaging ${last3} over his last ${recent.length} — ${gap} under TraderApe's forward projection of ${projection}.`,
    );
    if (ros && ros.label === 'favorable') {
      reasons.push(
        `Soft remaining schedule for ${p.pos}s (avg allowed rank ${round1(ros.avgRank)}).`,
      );
    }
  } else {
    reasons.push(
      `Averaging ${last3}, ${Math.abs(gap)} over his forward projection of ${projection} — peak sell window.`,
    );
    if (ros && ros.label === 'tough') {
      reasons.push(
        `Schedule toughens up for ${p.pos}s the rest of the way (avg allowed rank ${round1(ros.avgRank)}).`,
      );
    }
  }

  return {
    player: p,
    rosteredBy: input.teamByPoolId?.get(p.id) ?? null,
    last3,
    last3Weeks: recent.length,
    projection,
    gap,
    vor: round1(vor),
    ros,
    reasons,
  };
}

/**
 * Rank the pool's startable assets as buy-low (underperforming their
 * forward projection) and sell-high (overperforming) trade targets.
 * Returns at most MAX_TARGETS per side, sorted by gap size.
 */
export function marketTargets(input: MarketTargetsInput): {
  buyLow: MarketTarget[];
  sellHigh: MarketTarget[];
} {
  const cfg = input.vorCfg ?? DEFAULT_VOR_CONFIG;
  const vors = vorPoints(input.poolPlayers, input.valueLeague, cfg);
  const buyLow: MarketTarget[] = [];
  const sellHigh: MarketTarget[] = [];
  for (const p of input.poolPlayers) {
    if ((vors.get(p.id) ?? 0) < VOR_FLOOR) continue;
    const target = targetFor(p, vors.get(p.id) ?? 0, input);
    if (!target) continue;
    if (target.gap > 0) buyLow.push(target);
    else sellHigh.push(target);
  }
  buyLow.sort((a, b) => b.gap - a.gap);
  // Most over-performing first (most negative gap).
  sellHigh.sort((a, b) => a.gap - b.gap);
  return {
    buyLow: buyLow.slice(0, MAX_TARGETS),
    sellHigh: sellHigh.slice(0, MAX_TARGETS),
  };
}

