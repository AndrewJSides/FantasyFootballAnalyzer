// Opportunity Watch (backlog item 71).
//
// Flags available players earning a real role — high snap share and/or high
// target share over their last 3 completed weeks — the "who's earning the
// work before the points show up" question. Distinct from Breakout Watch
// (which is production surging vs the player's own earlier pace) and
// Trending Adds (league-wide ownership momentum): a player can be earning
// 70% of the snaps with quiet box scores (buy-low opportunity) or scoring
// on 25% snaps (TD-dependent, due to regress). Priced on Sleeper's free
// public weekly stats (off_snp / tm_off_snp / rec_tgt), no new data source.
// Nothing here moves rosters — it's waiver-wire research.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

// Positions the engine covers (usage is a skill-position story).
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
// Target share only means something for pass-catchers.
const TARGET_POSITIONS = new Set(['RB', 'WR', 'TE']);

// The recent window needs 2+ stat lines so a single spot start can't drive
// the flag alone (same discipline as buy-low/sell-high and breakout watch).
export const RECENT_MIN_GAMES = 2;
// 55%+ of the offense's snaps over the last 3 earns the flag — a real role.
export const SNAP_SHARE_FLAG = 0.55;
// 20%+ of the team's targets over the last 3 earns the flag for pass-catchers.
export const TARGET_SHARE_FLAG = 0.2;
// How many candidates the panel keeps.
export const MAX_OPPORTUNITIES = 8;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const pct = (n: number): number => Math.round(n * 100);

export interface OpportunityCandidate {
  player: PoolPlayer;
  /** Owning league team name, or null (unrostered / guest mode). */
  rosteredBy: string | null;
  /** Snap share over the recent window (0..1). */
  snapShare: number;
  /** Target share over the recent window (0..1), null for QBs. */
  targetShare: number | null;
  /** Touches per game over the recent window (rush att + receptions). */
  touchesPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
  /** Plain-language reasons, ordered strongest first. */
  reasons: string[];
}

export interface OpportunityWatchInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** League mode: pool player id -> owning team name (roster filter). */
  teamByPoolId?: Map<string, string>;
  currentWeek: number;
}

interface WeekUsage {
  week: number;
  line: WeeklyUsageLine;
}

function recentUsage(
  sleeperId: string | undefined,
  input: OpportunityWatchInput,
): WeekUsage[] {
  if (!sleeperId) return [];
  const byWeek = input.usageBySleeperId[sleeperId] ?? {};
  return Object.entries(byWeek)
    .map(([w, line]) => ({ week: Number(w), line }))
    .filter(
      e =>
        Number.isFinite(e.week) &&
        e.week < input.currentWeek &&
        e.week >= input.currentWeek - 3 &&
        e.line.teamSnaps > 0,
    )
    .sort((a, b) => a.week - b.week);
}

function candidateFor(
  p: PoolPlayer,
  input: OpportunityWatchInput,
  teamTargetsByWeek: Map<string, Map<number, number>>,
): OpportunityCandidate | null {
  if (!POSITIONS.has(p.pos.toUpperCase())) return null;
  const entries = recentUsage(p.sleeperId, input);
  if (entries.length < RECENT_MIN_GAMES) return null;

  const offSnaps = entries.reduce((s, e) => s + e.line.offSnaps, 0);
  const teamSnaps = entries.reduce((s, e) => s + e.line.teamSnaps, 0);
  if (teamSnaps <= 0) return null;
  const snapShare = offSnaps / teamSnaps;

  // Target share prices the player's targets against his own NFL team's
  // targets in the same weeks (a mid-season trade changes the denominator,
  // but the pool only ever holds the current team — noted in the reasons).
  let targetShare: number | null = null;
  if (TARGET_POSITIONS.has(p.pos.toUpperCase()) && p.team) {
    const teamWeeks = teamTargetsByWeek.get(p.team.toUpperCase());
    if (teamWeeks) {
      const targets = entries.reduce((s, e) => s + e.line.targets, 0);
      const teamTargets = entries.reduce(
        (s, e) => s + (teamWeeks.get(e.week) ?? 0),
        0,
      );
      if (teamTargets > 0) targetShare = targets / teamTargets;
    }
  }

  const touches = entries.reduce(
    (s, e) => s + e.line.rushAtt + e.line.receptions,
    0,
  );
  const touchesPerGame = round1(touches / entries.length);

  const snapFlag = snapShare >= SNAP_SHARE_FLAG;
  const targetFlag = targetShare !== null && targetShare >= TARGET_SHARE_FLAG;
  if (!snapFlag && !targetFlag) return null;

  const reasons: string[] = [];
  if (snapFlag) {
    reasons.push(
      `${pct(snapShare)}% of the offense's snaps over his last ${entries.length} games.`,
    );
  }
  if (targetFlag && p.team) {
    reasons.push(
      `${pct(targetShare!)}% of ${p.team.toUpperCase()}'s targets over his last ${entries.length} games.`,
    );
  }

  return {
    player: p,
    rosteredBy: input.teamByPoolId?.get(p.id) ?? null,
    snapShare: round1(snapShare * 100) / 100,
    targetShare:
      targetShare === null ? null : round1(targetShare * 100) / 100,
    touchesPerGame,
    games: entries.length,
    reasons,
  };
}

/**
 * Per-NFL-team total targets per week, summed from the same usage response
 * (rec_tgt is per player; the pool gives each player's current team).
 * Exported for reuse by the Snap Leaders board (backlog item 104) — the
 * same denominator prices target shares there too.
 */
export function teamTargetsByWeek(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): Map<string, Map<number, number>> {
  const sleeperTeam = new Map<string, string>();
  for (const p of poolPlayers) {
    if (p.sleeperId && p.team) sleeperTeam.set(p.sleeperId, p.team.toUpperCase());
  }
  const out = new Map<string, Map<number, number>>();
  for (const [id, byWeek] of Object.entries(usageBySleeperId)) {
    const team = sleeperTeam.get(id);
    if (!team) continue;
    let weeks = out.get(team);
    if (!weeks) out.set(team, (weeks = new Map()));
    for (const [w, line] of Object.entries(byWeek)) {
      const week = Number(w);
      if (!Number.isFinite(week)) continue;
      weeks.set(week, (weeks.get(week) ?? 0) + line.targets);
    }
  }
  return out;
}

/**
 * Per-NFL-team total touches per week, summed from the same usage response
 * (rush_att + rec_tgt per player; the pool gives each player's current
 * team). Exported for reuse by the Opportunity Share board (backlog item
 * 108) — the same denominator prices touch shares there. Mirrors
 * teamTargetsByWeek exactly, including QB scrambles in the denominator
 * (a carry is a touch whoever runs it).
 */
export function teamTouchesByWeek(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): Map<string, Map<number, number>> {
  const sleeperTeam = new Map<string, string>();
  for (const p of poolPlayers) {
    if (p.sleeperId && p.team) sleeperTeam.set(p.sleeperId, p.team.toUpperCase());
  }
  const out = new Map<string, Map<number, number>>();
  for (const [id, byWeek] of Object.entries(usageBySleeperId)) {
    const team = sleeperTeam.get(id);
    if (!team) continue;
    let weeks = out.get(team);
    if (!weeks) out.set(team, (weeks = new Map()));
    for (const [w, line] of Object.entries(byWeek)) {
      const week = Number(w);
      if (!Number.isFinite(week)) continue;
      weeks.set(week, (weeks.get(week) ?? 0) + line.rushAtt + line.targets);
    }
  }
  return out;
}

/**
 * Ranked opportunity candidates: available players earning 55%+ snap share
 * and/or 20%+ target share over their last 3 completed weeks. In league
 * mode, rostered players are excluded (opportunity is a waiver question);
 * in guest mode there are no rosters so every candidate shows.
 */
export function opportunityTargets(
  input: OpportunityWatchInput,
): OpportunityCandidate[] {
  const targetsByWeek = teamTargetsByWeek(
    input.poolPlayers,
    input.usageBySleeperId,
  );

  const out: OpportunityCandidate[] = [];
  for (const p of input.poolPlayers) {
    const c = candidateFor(p, input, targetsByWeek);
    if (!c) continue;
    if (input.teamByPoolId?.has(p.id)) continue;
    out.push(c);
  }
  out.sort(
    (a, b) =>
      b.snapShare - a.snapShare ||
      (b.targetShare ?? 0) - (a.targetShare ?? 0),
  );
  return out.slice(0, MAX_OPPORTUNITIES);
}
