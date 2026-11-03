// Usage Risers (backlog item 109).
//
// Flags available players whose ROLE is expanding: snap share over their
// last 3 completed weeks jumped vs their own earlier-season baseline.
// Distinct from Opportunity Watch (item 71, which prices the absolute
// level — a player already at 70% snaps never flags here) and Breakout
// Watch (production surging vs the player's own earlier pace — a player
// can earn snaps before the points arrive, or score without earning
// them). The waiver question is "whose job just grew": a snap-share jump
// is the earliest role-change signal, ahead of both the box score and the
// ownership momentum in Trending Adds. Priced on Sleeper's free public
// weekly stats (off_snp / tm_off_snp), no new data source. Guidance
// only — nothing here moves rosters.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

// Snap share is a skill-position story, and QBs sit near 100% every week
// so they carry no jump signal — RB/WR/TE only.
const POSITIONS = new Set(['RB', 'WR', 'TE']);
// The recent window mirrors Opportunity Watch (last 3 completed weeks).
export const RECENT_WEEKS = 3;
// Both windows need 2+ stat lines so a single spot start can't drive the
// flag alone (same discipline as buy-low/sell-high and breakout watch).
export const MIN_WINDOW_GAMES = 2;
// A jump only counts once the player holds a real role now — 5% to 25%
// is noise, not a job.
export const RECENT_SNAP_SHARE_FLOOR = 0.4;
// 15+ percentage points of snap share gained vs the earlier baseline.
export const SNAP_SHARE_JUMP = 0.15;
// How many risers the panel keeps.
export const MAX_RISERS = 8;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const pct = (n: number): number => Math.round(n * 100);

export interface UsageRiser {
  player: PoolPlayer;
  /** Owning league team name, or null (unrostered / guest mode). */
  rosteredBy: string | null;
  /** Snap share over the recent window (0..1). */
  recentSnapShare: number;
  /** Snap share over the earlier-season window (0..1). */
  earlierSnapShare: number;
  /** recentSnapShare - earlierSnapShare (0..1). */
  delta: number;
  /** Games in the recent window with a stat line. */
  recentGames: number;
  /** Games in the earlier window with a stat line. */
  earlierGames: number;
  /** Plain-language reason naming both ends of the jump. */
  reason: string;
}

export interface UsageRisersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** League mode: pool player id -> owning team name (roster filter). */
  teamByPoolId?: Map<string, string>;
  currentWeek: number;
}

function windowShare(
  entries: { line: WeeklyUsageLine }[],
): number | null {
  const offSnaps = entries.reduce((s, e) => s + e.line.offSnaps, 0);
  const teamSnaps = entries.reduce((s, e) => s + e.line.teamSnaps, 0);
  if (teamSnaps <= 0) return null;
  return offSnaps / teamSnaps;
}

function riserFor(
  p: PoolPlayer,
  input: UsageRisersInput,
): UsageRiser | null {
  if (!POSITIONS.has(p.pos.toUpperCase())) return null;
  const byWeek = input.usageBySleeperId[p.sleeperId ?? ''] ?? {};
  const entries = Object.entries(byWeek)
    .map(([w, line]) => ({ week: Number(w), line }))
    .filter(
      e =>
        Number.isFinite(e.week) &&
        e.week < input.currentWeek &&
        e.line.teamSnaps > 0,
    )
    .sort((a, b) => a.week - b.week);
  const recent = entries.filter(
    e => e.week >= input.currentWeek - RECENT_WEEKS,
  );
  const earlier = entries.filter(
    e => e.week < input.currentWeek - RECENT_WEEKS,
  );
  if (
    recent.length < MIN_WINDOW_GAMES ||
    earlier.length < MIN_WINDOW_GAMES
  ) {
    return null;
  }
  const recentShare = windowShare(recent);
  const earlierShare = windowShare(earlier);
  if (recentShare === null || earlierShare === null) return null;
  if (recentShare < RECENT_SNAP_SHARE_FLOOR) return null;
  const delta = recentShare - earlierShare;
  if (delta < SNAP_SHARE_JUMP) return null;

  return {
    player: p,
    rosteredBy: input.teamByPoolId?.get(p.id) ?? null,
    recentSnapShare: round1(recentShare * 100) / 100,
    earlierSnapShare: round1(earlierShare * 100) / 100,
    delta: round1(delta * 100) / 100,
    recentGames: recent.length,
    earlierGames: earlier.length,
    reason: `Snap share up from ${pct(earlierShare)}% to ${pct(recentShare)}% over his last ${recent.length} games.`,
  };
}

/**
 * Ranked usage risers: available RB/WR/TE whose snap share over the last
 * 3 completed weeks jumped 15+ points vs their earlier-season baseline
 * while holding a 40%+ role now. In league mode, rostered players are
 * excluded (a role change is a waiver question); in guest mode there are
 * no rosters so every riser shows.
 */
export function usageRisers(input: UsageRisersInput): UsageRiser[] {
  const out: UsageRiser[] = [];
  for (const p of input.poolPlayers) {
    const r = riserFor(p, input);
    if (!r) continue;
    if (input.teamByPoolId?.has(p.id)) continue;
    out.push(r);
  }
  out.sort((a, b) => b.delta - a.delta);
  return out.slice(0, MAX_RISERS);
}
