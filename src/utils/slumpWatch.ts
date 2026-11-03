// Slump Watch (backlog item 117).
//
// The cooling counterpart to Breakout Watch: flags players whose recent
// production fell off vs their own earlier-season baseline — the "whose
// own pace has fallen off a cliff" question. Distinct from Buy Low /
// Sell High (which grades the last 3 against TraderApe's forward
// projection) and from the Start/Sit "cooling off" trend label (a single
// player's form note): this is pure self-comparison, priced on the same
// weekly series the projection model uses. Unlike breakouts (a waiver
// question, rostered players excluded), a slump is a sit/sell question,
// so rostered players STAY in and the owning team is named. Nothing here
// moves rosters — it's research.

import type { PoolPlayer } from '@/types/draft';

// Positions the engine covers (matchup data is positional).
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

// A slump needs a real sample: 3+ earlier games set the baseline so one
// hot start can't fake a cliff (same discipline as Breakout Watch).
export const BASELINE_MIN_GAMES = 3;
// The recent window needs 2+ stat lines so a single dud can't drive
// the flag alone (same discipline as buy-low/sell-high).
export const RECENT_MIN_GAMES = 2;
// The BASELINE has to be startable-relevant, not just a ratio drop off
// a tiny base (4.0 → 2.0 pts/game is a 50% drop but nobody's sit/sell
// decision). Mirror of Breakout Watch's recent floor, on the other side.
export const BASELINE_FLOOR = 12.0;
// The recent average has to fall 40%+ below the player's own earlier
// pace to earn the flag (mirror of Breakout Watch's 1.6x surge).
export const DIP_RATIO = 0.6;
// How many candidates the panel keeps.
export const MAX_SLUMPS = 8;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface SlumpCandidate {
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
  dip: number;
  /** Plain-language reasons, ordered strongest first. */
  reasons: string[];
}

export interface SlumpWatchInput {
  poolPlayers: PoolPlayer[];
  /** Weekly points keyed by platform player id (league) or Sleeper id (guest). */
  weeklyPoints?: Record<string, Record<string | number, number>>;
  /** League mode: pool player id -> platform player id for the weekly lookup. */
  platformIdByPoolId?: Map<string, string>;
  /** League mode: pool player id -> owning team name. */
  teamByPoolId?: Map<string, string>;
  currentWeek: number;
}

function weeklyKey(p: PoolPlayer, input: SlumpWatchInput): string {
  return input.platformIdByPoolId?.get(p.id) ?? p.sleeperId ?? p.id;
}

interface WeekEntry {
  week: number;
  pts: number;
}

function completedEntries(p: PoolPlayer, input: SlumpWatchInput): WeekEntry[] {
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
  input: SlumpWatchInput,
): SlumpCandidate | null {
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
  if (baseline < BASELINE_FLOOR) return null;
  if (!(baseline > 0)) return null;
  const dip = round1(last3 / baseline);
  if (dip > DIP_RATIO) return null;

  const dropPct = Math.round((1 - dip) * 100);
  const reasons: string[] = [
    `Averaging ${last3} over his last ${recent.length} vs ${baseline} before that — down ${dropPct}% from his earlier pace.`,
  ];

  return {
    player: p,
    rosteredBy: input.teamByPoolId?.get(p.id) ?? null,
    last3,
    last3Weeks: recent.length,
    baseline,
    baselineWeeks: baselineEntries.length,
    dip,
    reasons,
  };
}

/**
 * Ranked slump candidates: recent production down 40%+ from the player's
 * own earlier-season baseline, steepest drop first. Rostered players stay
 * in (a slump is a sit/sell question); in guest mode there are no rosters
 * so every candidate shows owner-free.
 */
export function slumpCandidates(input: SlumpWatchInput): SlumpCandidate[] {
  const out: SlumpCandidate[] = [];
  for (const p of input.poolPlayers) {
    const c = candidateFor(p, input);
    if (!c) continue;
    out.push(c);
  }
  out.sort((a, b) => a.dip - b.dip || b.baseline - a.baseline);
  return out.slice(0, MAX_SLUMPS);
}
