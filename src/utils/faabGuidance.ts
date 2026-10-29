// FAAB bid guidance: suggest a bid range for a waiver target from three
// inputs — the league's own FAAB spending norms (median winning bid overall
// and per position, from this season's transactions), the target's value
// (bundled pool full-PPR projection, scaled against the value of players
// this league has actually claimed), and the bidding team's positional need
// (the same league-relative need/surplus math the Trade Finder uses).
// Guidance only: nothing here bids, spends, or moves money.

import type { League, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import type { PositionKey } from './tradeAnalysis';
import type { TeamProfile } from './tradeFinder';

// Most FAAB leagues (Yahoo default, Sleeper default) run a $100 season
// budget. The app doesn't store the league's configured budget, so the
// remaining-budget estimate assumes $100 and says so in the UI.
export const ASSUMED_FAAB_BUDGET = 100;

// Only skill positions get bid guidance: nobody spends FAAB on K/DST with
// any regularity, and their norms would be noise.
const GUIDANCE_POSITIONS: PositionKey[] = ['QB', 'RB', 'WR', 'TE'];

// Need at a position bids up, surplus bids down. Kept modest: need is one
// factor among three, not the whole story.
const NEED_MULTIPLIER = 1.25;
const SURPLUS_MULTIPLIER = 0.85;

// Value scaling is clamped so one outlier claim (or one outlier target)
// can't swing the range into nonsense.
const VALUE_SCALE_MIN = 0.5;
const VALUE_SCALE_MAX = 2.5;

// The suggested band around the point estimate: bid somewhere in here and
// you're near the league's going rate for a player like this.
const BAND_LOW = 0.65;
const BAND_HIGH = 1.35;

export interface FaabPositionNorm {
  count: number;
  median: number;
}

export interface FaabNorms {
  // Waiver/free-agent transactions with a recorded bid (0 bids included:
  // a $0 winning claim is genuine market information).
  claimCount: number;
  medianBid: number;
  meanBid: number;
  maxBid: number;
  byPosition: Partial<Record<PositionKey, FaabPositionNorm>>;
  // Median bundled-pool full-PPR projection of the players this league has
  // claimed — the value anchor the target is scaled against. Null when no
  // claimed player mapped to the pool.
  medianClaimValue: number | null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function posKeyOf(position: string | undefined): PositionKey | null {
  const p = (position ?? '').toUpperCase();
  return (GUIDANCE_POSITIONS as string[]).includes(p) ? (p as PositionKey) : null;
}

// League FAAB norms from this season's waiver/free-agent transactions.
// Undefined when the league has no recorded bids (syncs without bid data,
// or a league that runs waivers without FAAB) — the UI degrades to a note.
export function faabNorms(league: League, pool: DraftPoolFile = POOL): FaabNorms | undefined {
  const index = indexPool(pool);
  const bids: number[] = [];
  const bidsByPos = new Map<PositionKey, number[]>();
  const claimValues: number[] = [];

  for (const team of league.teams) {
    for (const tx of team.transactions ?? []) {
      if (tx.type !== 'waiver' && tx.type !== 'free_agent') continue;
      const bid = tx.waiverBudgetSpent;
      if (bid == null || !Number.isFinite(bid)) continue;
      bids.push(bid);
      for (const add of tx.adds) {
        const pos = posKeyOf(add.position);
        if (pos) {
          const arr = bidsByPos.get(pos) ?? [];
          arr.push(bid);
          bidsByPos.set(pos, arr);
        }
        const pooled = resolvePoolPlayer(add, index);
        if (pooled && typeof pooled.projPtsPpr === 'number' && pooled.projPtsPpr > 0) {
          claimValues.push(pooled.projPtsPpr);
        }
      }
    }
  }

  if (bids.length === 0) return undefined;

  const byPosition: Partial<Record<PositionKey, FaabPositionNorm>> = {};
  for (const [pos, posBids] of bidsByPos) {
    byPosition[pos] = { count: posBids.length, median: median(posBids) };
  }

  return {
    claimCount: bids.length,
    medianBid: median(bids),
    meanBid: bids.reduce((s, b) => s + b, 0) / bids.length,
    maxBid: Math.max(...bids),
    byPosition,
    medianClaimValue: claimValues.length > 0 ? median(claimValues) : null,
  };
}

// Total FAAB a team has spent on waiver/free-agent adds this season.
export function faabSpentBy(team: Team): number {
  return (team.transactions ?? [])
    .filter(tx => tx.type === 'waiver' || tx.type === 'free_agent')
    .reduce((sum, tx) => sum + (tx.waiverBudgetSpent ?? 0), 0);
}

// The most valuable players on no league roster, by bundled-pool full-PPR
// projection — the "who's even out there" list the bid ranges price.
// Preseason projections by nature: the UI footnotes that.
export function availableTargets(
  league: League,
  pool: DraftPoolFile = POOL,
  limit = 8,
): PoolPlayer[] {
  const index = indexPool(pool);
  const rostered = new Set<string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      const resolved = resolvePoolPlayer(p, index);
      if (resolved) rostered.add(resolved.id);
    }
  }
  return pool.players
    .filter(
      p =>
        GUIDANCE_POSITIONS.includes(p.pos.toUpperCase() as PositionKey) &&
        !rostered.has(p.id) &&
        typeof p.projPtsPpr === 'number' &&
        p.projPtsPpr > 0,
    )
    .sort((a, b) => (b.projPtsPpr ?? 0) - (a.projPtsPpr ?? 0))
    .slice(0, Math.max(0, limit));
}

export interface BidSuggestion {
  low: number;
  high: number;
  // Human-readable reasons, strongest first — the UI shows them under the range.
  reasons: string[];
  // Remaining budget estimate (assumes the $100 season budget), for the cap note.
  estRemaining: number;
}

export function suggestBid(
  target: PoolPlayer,
  team: Team,
  profiles: TeamProfile[],
  norms: FaabNorms,
): BidSuggestion {
  const pos = posKeyOf(target.pos) ?? 'WR';
  const posNorm = norms.byPosition[pos];
  const baseline = posNorm?.median ?? norms.medianBid;

  const valueScale =
    norms.medianClaimValue && target.projPtsPpr
      ? Math.min(
          VALUE_SCALE_MAX,
          Math.max(VALUE_SCALE_MIN, target.projPtsPpr / norms.medianClaimValue),
        )
      : 1;

  const profile = profiles.find(pr => pr.team.id === team.id);
  const need = profile?.positions[pos]?.need ?? false;
  const surplus = !need && (profile?.positions[pos]?.surplus ?? false);
  const needMultiplier = need ? NEED_MULTIPLIER : surplus ? SURPLUS_MULTIPLIER : 1;

  const reasons: string[] = [];
  if (posNorm) {
    reasons.push(
      `Going rate: $${posNorm.median} median winning ${pos} bid across ${posNorm.count} ` +
        `${pos} claim${posNorm.count === 1 ? '' : 's'} this season.`,
    );
  } else {
    reasons.push(
      `Going rate: $${norms.medianBid} median winning bid across ${norms.claimCount} ` +
        `claims this season (no ${pos} bids on record yet).`,
    );
  }
  if (valueScale !== 1 && norms.medianClaimValue) {
    const pct = Math.round((valueScale - 1) * 100);
    reasons.push(
      `${target.name} projects ${target.projPtsPpr} PPR pts vs ${norms.medianClaimValue} ` +
        `for the median claimed player — bid ${pct > 0 ? `${pct}% up` : `${-pct}% down`} on value.`,
    );
  }
  if (need) {
    reasons.push(
      `Need at ${pos}: your best is below the league median — bid up 25%.`,
    );
  } else if (surplus) {
    reasons.push(
      `Surplus at ${pos}: you can cover the spot already — bid down 15%.`,
    );
  }

  const estRemaining = Math.max(0, ASSUMED_FAAB_BUDGET - faabSpentBy(team));

  // A spent budget gets a $0 range and a plain reason, not a capped band.
  if (estRemaining <= 0) {
    reasons.push(
      `Budget looks spent (assumes a $${ASSUMED_FAAB_BUDGET} season budget) — only $0 bids are sensible now.`,
    );
    return { low: 0, high: 0, reasons, estRemaining };
  }

  const point = baseline * valueScale * needMultiplier;
  let low = Math.max(1, Math.round(point * BAND_LOW));
  let high = Math.max(low, Math.round(point * BAND_HIGH));

  // Never suggest more than the (estimated) remaining budget.
  if (high > estRemaining) {
    high = estRemaining;
    low = Math.min(low, high);
    reasons.push(
      `Capped at ~$${estRemaining} remaining (assumes a $${ASSUMED_FAAB_BUDGET} season budget).`,
    );
  }

  return { low, high, reasons, estRemaining };
}
