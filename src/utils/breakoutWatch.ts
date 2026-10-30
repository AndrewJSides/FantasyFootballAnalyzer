// Breakout Watch (backlog item 36).
//
// Flags players whose recent production is surging vs their own
// earlier-season baseline — the "who's breaking out before the points
// show up in the rankings" question. Distinct from Buy Low / Sell High
// (which grades the last 3 against TraderApe's forward projection) and
// Trending Adds (which is league-wide ownership momentum): this is pure
// self-comparison, priced on the same weekly series the projection model
// uses. Nothing here moves rosters — it's waiver-wire research.

import type { PoolPlayer } from '@/types/draft';

// Positions the engine covers (matchup data is positional).
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

// A breakout needs a real sample: 3+ earlier games set the baseline so one
// hot game at the start of the season can't fake a surge.
export const BASELINE_MIN_GAMES = 3;
// The recent window needs 2+ stat lines so a single explosion can't drive
// the flag alone (same discipline as buy-low/sell-high).
export const RECENT_MIN_GAMES = 2;
// The recent average has to be startable-relevant, not just a ratio spike
// off a tiny base (1.0 → 2.0 pts/game is 2x but nobody's waiver target).
export const RECENT_FLOOR = 12.0;
// 60%+ over the player's own earlier pace earns the flag.
export const SURGE_RATIO = 1.6;
// How many candidates the panel keeps.
export const MAX_BREAKOUTS = 8;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface BreakoutCandidate {
  player: PoolPlayer;
  /** Owning league team name, or null (unrostered / guest mode). */
  rosteredBy: string | null;
  /** Average points over the recent window (rounded). */
  last3: number;
  /** Weeks in the recent window with a stat line. */
  last3Weeks: number;
  /** Average points over the baseline window (rounded). */
  baseline: number;
  /** Weeks in the baseline window with a stat line. */
  baselineWeeks: number;
  /** last3 / baseline (rounded). */
  surge: number;
  /** Plain-language reasons, ordered strongest first. */
  reasons: string[];
}

export interface BreakoutWatchInput {
  poolPlayers: PoolPlayer[];
  /** Weekly points keyed by platform player id (league) or Sleeper id (guest). */
  weeklyPoints?: Record<string, Record<string | number, number>>;
  /** League mode: pool player id -> platform player id for the weekly lookup. */
  platformIdByPoolId?: Map<string, string>;
  /** League mode: pool player id -> owning team name. */
  teamByPoolId?: Map<string, string>;
  currentWeek: number;
}

function weeklyKey(p: PoolPlayer, input: BreakoutWatchInput): string {
  return input.platformIdByPoolId?.get(p.id) ?? p.sleeperId ?? p.id;
}

interface WeekEntry {
  week: number;
  pts: number;
}

function completedEntries(p: PoolPlayer, input: BreakoutWatchInput): WeekEntry[] {
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

function candidateFor(
  p: PoolPlayer,
  input: BreakoutWatchInput,
): BreakoutCandidate | null {
  if (!POSITIONS.has(p.pos.toUpperCase())) return null;
  const entries = completedEntries(p, input);
  if (entries.length === 0) return null;
  // Recent window: the last 3 completed weeks. Baseline: everything before
  // that, so a player is always measured against his OWN earlier pace.
  const recent = entries.filter(e => e.week >= input.currentWeek - 3);
  const baselineEntries = entries.filter(e => e.week < input.currentWeek - 3);
  if (recent.length < RECENT_MIN_GAMES) return null;
  if (baselineEntries.length < BASELINE_MIN_GAMES) return null;
  const last3 = round1(recent.reduce((s, e) => s + e.pts, 0) / recent.length);
  const baseline = round1(
    baselineEntries.reduce((s, e) => s + e.pts, 0) / baselineEntries.length,
  );
  if (last3 < RECENT_FLOOR) return null;
  if (!(baseline > 0)) return null;
  const surge = round1(last3 / baseline);
  if (surge < SURGE_RATIO) return null;

  const reasons: string[] = [
    `Averaging ${last3} over his last ${recent.length} vs ${baseline} before that — ${surge}x his earlier pace.`,
  ];

  return {
    player: p,
    rosteredBy: input.teamByPoolId?.get(p.id) ?? null,
    last3,
    last3Weeks: recent.length,
    baseline,
    baselineWeeks: baselineEntries.length,
    surge,
    reasons,
  };
}

/**
 * Ranked breakout candidates: recent production surging 60%+ over the
 * player's own earlier-season baseline. In league mode, rostered players
 * are excluded (breakouts are a waiver question); in guest mode there are
 * no rosters so every candidate shows.
 */
export function breakoutCandidates(input: BreakoutWatchInput): BreakoutCandidate[] {
  const out: BreakoutCandidate[] = [];
  for (const p of input.poolPlayers) {
    const c = candidateFor(p, input);
    if (!c) continue;
    if (input.teamByPoolId?.has(p.id)) continue;
    out.push(c);
  }
  out.sort((a, b) => b.last3 - a.last3 || b.surge - a.surge);
  return out.slice(0, MAX_BREAKOUTS);
}
