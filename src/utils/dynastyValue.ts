// Dynasty Rankings (backlog item 177): TraderApe's own long-term player
// value — the bundled pool's full-PPR season projection priced through a
// per-position age curve. Redraft value treats a 28-year-old RB and a
// 23-year-old RB with the same projection as equals; dynasty value does
// not: the curve holds a player at full value through his position's peak
// window, then declines him linearly toward a floor as he ages out of it,
// with a small ramp up to the peak for the youngest players (a 20-year-old
// has not yet reached it).
//
// The curve is TraderApe's own model, documented here — it does NOT use
// the pool's bundled dynastyRank field, which is joined from a FantasyPros
// dynasty snapshot at pool-build time; surfacing that would republish
// their proprietary rankings. Ages come from Sleeper's free public player
// data (scripts/buildPlayerAges.ts); a player with no known age prices at
// his raw projection (factor 1.0) and shows "—" for age.

import type { PoolPlayer } from '@/types/draft';

export type DynastyPosition = 'QB' | 'RB' | 'WR' | 'TE';

export const DYNASTY_POSITIONS: DynastyPosition[] = ['QB', 'RB', 'WR', 'TE'];

export const MAX_DYNASTY_RANK = 100;

// [age, factor] control points, linear between points, clamped at the ends.
// QB peaks late and fades slowly; RB peaks early and falls off a cliff;
// WR/TE sit between, holding value into their late 20s.
const AGE_CURVES: Record<DynastyPosition, Array<[number, number]>> = {
  QB: [
    [21, 0.9],
    [25, 1.0],
    [30, 1.0],
    [34, 0.8],
    [37, 0.55],
    [40, 0.35],
  ],
  RB: [
    [20, 0.95],
    [23, 1.0],
    [25, 1.0],
    [27, 0.75],
    [29, 0.5],
    [31, 0.25],
  ],
  WR: [
    [20, 0.9],
    [24, 1.0],
    [27, 1.0],
    [30, 0.8],
    [33, 0.55],
    [35, 0.3],
  ],
  TE: [
    [20, 0.9],
    [24, 1.0],
    [27, 1.0],
    [30, 0.8],
    [33, 0.55],
    [35, 0.3],
  ],
};

/** Age factor for a position at a given age. Unknown age prices neutrally. */
export function ageFactor(pos: string, age: number | null | undefined): number {
  if (age === null || age === undefined || !Number.isFinite(age)) return 1;
  const curve = AGE_CURVES[pos as DynastyPosition];
  if (!curve) return 1;
  if (age <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [a0, f0] = curve[i - 1];
    const [a1, f1] = curve[i];
    if (age <= a1) return f0 + ((f1 - f0) * (age - a0)) / (a1 - a0);
  }
  return curve[curve.length - 1][1];
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Dynasty value: season full-PPR projection × the age factor. */
export function dynastyValue(
  projPtsPpr: number,
  pos: string,
  age: number | null | undefined,
): number {
  return round1(projPtsPpr * ageFactor(pos, age));
}

export interface DynastyRow {
  player: PoolPlayer;
  age: number | null;
  seasonProj: number;
  value: number;
  dynastyRank: number;
  redraftRank: number;
  /** Positive: dynasty ranks him this many spots HIGHER than redraft. */
  rankDelta: number;
  rosteredBy: string | null;
}

export interface DynastyRankingsInput {
  poolPlayers: PoolPlayer[];
  /** Sleeper id -> age at the season start. */
  agesBySleeperId: Record<string, number>;
  /** Pool id -> owning team name; omit in guest mode. */
  teamByPoolId?: Map<string, string>;
  limit?: number;
  /** Rank within these positions only; defaults to all four. A single
   * position ranks against the redraft position rank; the full board ranks
   * against the redraft overall rank. */
  positions?: DynastyPosition[];
}

/**
 * Top dynasty values across QB/RB/WR/TE, best first. Only players with a
 * finite positive full-PPR projection rank; K/DST are out of scope.
 */
export function buildDynastyRankings(input: DynastyRankingsInput): DynastyRow[] {
  const limit = input.limit ?? MAX_DYNASTY_RANK;
  const positions = input.positions ?? DYNASTY_POSITIONS;
  const singlePosition = positions.length === 1;
  const rows: DynastyRow[] = [];
  for (const p of input.poolPlayers) {
    if (!positions.includes(p.pos as DynastyPosition)) continue;
    const proj = p.projPtsPpr ?? p.projPts;
    if (proj === undefined || !Number.isFinite(proj) || proj <= 0) continue;
    const age = p.sleeperId ? (input.agesBySleeperId[p.sleeperId] ?? null) : null;
    rows.push({
      player: p,
      age,
      seasonProj: round1(proj),
      value: dynastyValue(proj, p.pos, age),
      dynastyRank: 0,
      redraftRank: singlePosition ? (p.posRank ?? 0) : (p.overallRank ?? 0),
      rankDelta: 0,
      rosteredBy: input.teamByPoolId?.get(p.id) ?? null,
    });
  }
  rows.sort(
    (a, b) =>
      b.value - a.value ||
      b.seasonProj - a.seasonProj ||
      a.player.name.localeCompare(b.player.name),
  );
  const ranked = rows.slice(0, limit);
  ranked.forEach((r, i) => {
    r.dynastyRank = i + 1;
    r.rankDelta = r.redraftRank > 0 ? r.redraftRank - r.dynastyRank : 0;
  });
  return ranked;
}
