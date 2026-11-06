// Backup-out role-change detector (backlog item 137).
//
// The week-8 grade's two biggest LEARNABLE upside misses shared one cause:
// a backfield mate ruled out pre-kickoff (Tony Pollard: Tyjae Spears out;
// D'Andre Swift: Kyle Monangai out), leaving the lead back as the sole
// back — but the frozen projection still priced his split share. This
// detector surfaces that vacancy on the Weekly Rankings board: an RB
// whose same-team RB mate is ruled out this week (the same injuryOf
// predicate item 136 uses for exclusions) with a real rotation share
// gets a "Sole back" tag carrying an upside estimate.
//
// The estimate prices the vacated usage, not a new projection: each
// qualifying mate's recent usage (last 3 completed weeks' average
// opportunities — targets + carries + pass attempts, Sleeper's free
// weekly stats) times the lead back's own season points per opportunity,
// summed across mates and capped. The Weekly Rankings board, the
// Start/Sit optimizer, the Matchup game plan, and the Compare page all
// fold it into the ranked projection (backtested Nov 6, 2026 on the week-8
// grade — scripts/backtestSoleBack.ts — the gated term cut the three
// affected RBs' MAE 14.95 -> 7.05 without raising overall MAE); the Compare
// fold shipped Nov 6, 2026 as the item-173 remainder, so all four surfaces
// agree on the same player in the same week. A mate below 5
// opportunities per game is a practice-squad body, not a vacancy; a
// Questionable mate is not ruled out, so he never triggers it.
import type { WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { injuryOf } from '@/utils/seasonOutlook';
import type { DraftPoolFile } from '@/types/draft';

export interface SoleBackInfo {
  /** Names of the ruled-out same-team RB mates behind the vacancy. */
  mates: string[];
  /** Estimated extra full-PPR points from the vacated usage, capped. */
  upside: number;
}

/** A rotation back's floor: below this, a ruled-out mate vacates nothing. */
export const SOLE_BACK_MATE_MIN_OPP_PER_GAME = 5;
/** Cap on the displayed upside — a vacancy is a floor lift, not a ceiling. */
export const SOLE_BACK_UPSIDE_CAP = 10;

const round1 = (n: number): number => Math.round(n * 10) / 10;

function completedUsage(
  bySleeperId: Record<string, Record<number, number>> | undefined,
  sleeperId: string | undefined,
  currentWeek: number,
): { week: number; value: number }[] {
  if (!sleeperId) return [];
  const byWeek = bySleeperId?.[sleeperId] ?? {};
  return Object.entries(byWeek)
    .map(([w, value]) => ({ week: Number(w), value }))
    .filter(e => Number.isFinite(e.week) && e.week < currentWeek && Number.isFinite(e.value))
    .sort((a, b) => a.week - b.week);
}

/**
 * Map pool-player id -> sole-back info for every RB whose backfield has a
 * ruled-out rotation mate this week. Empty when there is no weekly data
 * (the board renders its dash state instead of a silent zero).
 */
export function soleBackMap(
  pool: DraftPoolFile,
  weekly: WeeklyPprPoints | undefined,
  currentWeek: number,
): Map<string, SoleBackInfo> {
  const out = new Map<string, SoleBackInfo>();
  if (!weekly) return out;
  const usageById = weekly.usageBySleeperId ?? {};
  const pointsById = weekly.pointsBySleeperId ?? {};
  const gamesById = weekly.gamesBySleeperId ?? {};

  for (const p of pool.players) {
    if (p.pos !== 'RB' || !p.team || p.team === 'FA') continue;
    // A ruled-out or bye-week lead back never ranks, so he never wears
    // the tag either; the board's own filters already exclude him.
    const mates = pool.players.filter(
      m =>
        m.id !== p.id &&
        m.pos === 'RB' &&
        m.team === p.team &&
        (() => {
          const info = injuryOf(m);
          return info?.outNow || info?.seasonEnding;
        })(),
    );
    if (mates.length === 0) continue;

    // The lead back's own conversion rate: season points per opportunity
    // over completed weeks. No usage history, no estimate, no tag.
    const leadUsage = completedUsage(usageById, p.sleeperId, currentWeek);
    const leadPoints = completedUsage(pointsById, p.sleeperId, currentWeek);
    const totalUsage = leadUsage.reduce((s, e) => s + e.value, 0);
    const totalPoints = leadPoints.reduce((s, e) => s + e.value, 0);
    if (totalUsage <= 0 || totalPoints <= 0) continue;
    const ptsPerOpp = totalPoints / totalUsage;

    const qualifying: { name: string; recentUsage: number }[] = [];
    for (const m of mates) {
      const games = (gamesById[m.sleeperId ?? ''] ?? []).filter(w => w < currentWeek).length;
      const mateUsage = completedUsage(usageById, m.sleeperId, currentWeek);
      const mateTotal = mateUsage.reduce((s, e) => s + e.value, 0);
      // Games played is the denominator; fall back to usage weeks when the
      // games feed lacks the player (guest fixtures, partial loads).
      const denom = games > 0 ? games : mateUsage.length;
      if (denom === 0 || mateTotal / denom < SOLE_BACK_MATE_MIN_OPP_PER_GAME) continue;
      const recent = mateUsage.slice(-3);
      qualifying.push({
        name: m.name,
        recentUsage: recent.reduce((s, e) => s + e.value, 0) / recent.length,
      });
    }
    if (qualifying.length === 0) continue;
    const upside = round1(
      Math.min(
        SOLE_BACK_UPSIDE_CAP,
        qualifying.reduce((s, q) => s + q.recentUsage * ptsPerOpp, 0),
      ),
    );
    if (upside <= 0) continue;
    out.set(p.id, { mates: qualifying.map(q => q.name), upside });
  }
  return out;
}
