// Trade Value Chart (backlog item 26): single-number trade values per player
// on a 0-100 scale, computed from TraderApe's own VOR engine (vorPoints in
// projectionValues.ts — value over replacement from projected season points,
// replacement level set by the league's exact roster shape). FantasyPros and
// others publish trade value charts (researched for feature shape only:
// "assigns a numerical value to each player, allowing you to compare players
// or weigh both sides of a multi-player deal" —
// https://d3d4football.com/fantasy-football-trade-value-chart-2026/); these
// values are computed from TraderApe's own data, no copied content.
//
// League mode prices the league's exact shape (roster slots, team count,
// scoring); guest mode degrades to the default 10-team full-PPR shape via
// valueLeagueFor(null).

import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { League } from '@/types';
import {
  DEFAULT_VOR_CONFIG,
  vorConfigFor,
  vorPoints,
  type ValueLeague,
  type VorConfig,
} from './projectionValues';
import {
  pickLabel,
  pickTradeValue,
  type TradePick,
} from './pickValueCurve';

export const TRADE_VALUE_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type TradeValuePosition = (typeof TRADE_VALUE_POSITIONS)[number];

export interface TradeValueRow {
  player: PoolPlayer;
  /** Trade value on a 0-100 scale (top player = 100), one decimal. */
  value: number;
  /** 1 = Elite, 2 = Core, 3 = Starter, 4 = Depth. */
  tier: 1 | 2 | 3 | 4;
  /** 1-based rank within his position, by value. */
  posRank: number;
}

export const TRADE_VALUE_TIERS: Record<TradeValueRow['tier'], string> = {
  1: 'Elite',
  2: 'Core',
  3: 'Starter',
  4: 'Depth',
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Value tier from the 0-100 value: fixed round thresholds, footnote-named. */
export function tierForValue(value: number): 1 | 2 | 3 | 4 {
  if (value >= 60) return 1;
  if (value >= 35) return 2;
  if (value >= 15) return 3;
  return 4;
}

export interface TradeValueConfig {
  league: ValueLeague;
  /** TE premium / 6pt-pass-TD adjustments applied to VOR before scaling. */
  tePremium?: boolean;
  sixPtPassTd?: boolean;
  cfg?: VorConfig;
}

/**
 * Build the trade value chart: every QB/RB/WR/TE with positive VOR, ranked
 * by value. Players with no projection or zero VOR are not on the chart.
 * The scale is the league's own VOR normalized so the top player is 100 —
 * values only compare within one league shape.
 */
export function buildTradeValueChart(
  players: DraftPoolFile['players'],
  opts: TradeValueConfig,
): TradeValueRow[] {
  const vorCfg = opts.cfg ?? vorConfigFor({
    tePremium: opts.tePremium ?? false,
    sixPtPassTd: opts.sixPtPassTd ?? false,
  });
  const vor = vorPoints(players, opts.league, vorCfg);
  const priced = players
    .filter(
      p =>
        (TRADE_VALUE_POSITIONS as readonly string[]).includes(p.pos) &&
        (vor.get(p.id) ?? 0) > 0,
    )
    .map(p => ({ player: p, vor: vor.get(p.id) ?? 0 }))
    .sort((a, b) => b.vor - a.vor);
  if (priced.length === 0) return [];
  const maxVor = priced[0].vor;
  const posCounter = new Map<string, number>();
  return priced.map(({ player, vor: v }) => {
    const value = maxVor > 0 ? round1((v / maxVor) * 100) : 0;
    const posRank = (posCounter.get(player.pos) ?? 0) + 1;
    posCounter.set(player.pos, posRank);
    return { player, value, tier: tierForValue(value), posRank };
  });
}

/** Look up a chart player's value by pool id; 0 for players off the chart. */
export function tradeValueOf(rows: TradeValueRow[], poolId: string): number {
  return rows.find(r => r.player.id === poolId)?.value ?? 0;
}

export interface PickChartRow {
  pick: TradePick;
  /** Human-readable label, e.g. "2027 Round 1 pick". */
  label: string;
  /** Chart value on the same 0–100 scale as the player rows (top player = 100). */
  value: number;
  /** Expected VOR points for the player taken at the pick's expected slot. */
  vor: number;
  /** Same fixed tier bands as the player rows. */
  tier: 1 | 2 | 3 | 4;
}

/**
 * The picks the chart prices (backlog item 178): the next draft's rounds
 * 1–3, plus the following draft's rounds 1–2. Deeper picks price near
 * zero on the VOR curve and are dropped by buildPickChartRows.
 */
export function defaultChartPicks(poolSeason: number): TradePick[] {
  const next = poolSeason + 1;
  return [
    { season: next, round: 1 },
    { season: next, round: 2 },
    { season: next, round: 3 },
    { season: next + 1, round: 1 },
    { season: next + 1, round: 2 },
  ];
}

/**
 * Draft picks priced on the chart's 0–100 scale: each pick's expected VOR
 * points (item 175's pickTradeValue — mid-round slot, one-round-per-year
 * discount beyond the next draft) divided by the top chart player's VOR,
 * the same denominator buildTradeValueChart normalizes by, so a pick and
 * a player compare directly. Picks pricing at zero VOR are dropped.
 */
export function buildPickChartRows(
  pool: DraftPoolFile,
  opts: TradeValueConfig,
  picks: TradePick[] = defaultChartPicks(pool.season),
): PickChartRow[] {
  const vorCfg = opts.cfg ?? vorConfigFor({
    tePremium: opts.tePremium ?? false,
    sixPtPassTd: opts.sixPtPassTd ?? false,
  });
  const vor = vorPoints(pool.players, opts.league, vorCfg);
  const maxVor = Math.max(
    0,
    ...pool.players
      .filter(p => (TRADE_VALUE_POSITIONS as readonly string[]).includes(p.pos))
      .map(p => vor.get(p.id) ?? 0),
  );
  return picks
    .map(pick => {
      const v = pickTradeValue(pick, opts.league, pool, vorCfg);
      const value = maxVor > 0 ? round1((v / maxVor) * 100) : 0;
      return { pick, label: pickLabel(pick), vor: v, value, tier: tierForValue(value) };
    })
    .filter(r => r.vor > 0)
    .sort((a, b) => b.value - a.value);
}

export interface PackageVerdict {
  sideATotal: number;
  sideBTotal: number;
  /** Absolute difference between the sides. */
  diff: number;
  /** 'fair' | 'a' | 'b' — which side the summed values favor. */
  winner: 'fair' | 'a' | 'b';
}

/** Fairness band: within 5 value points the deal is a fair swap. */
export const PACKAGE_FAIR_BAND = 5;

/** One stored trade value chart snapshot (see scripts/snapshotTradeValues.ts). */
export interface TradeValueSnapshot {
  /** Calendar date the snapshot was taken, YYYY-MM-DD. */
  date: string;
  /** Player pool id → chart value on the 0-100 scale, one decimal. */
  values: Record<string, number>;
}

/** One trade-value mover between two chart snapshots. */
export interface TradeValueMover {
  /** Player pool id. */
  poolId: string;
  /** Value in the baseline snapshot, one decimal. */
  oldValue: number;
  /** Value in the latest snapshot, one decimal. */
  newValue: number;
  /** newValue − oldValue, one decimal (positive = riser). */
  valueDelta: number;
  /** 1-based rank in the baseline snapshot (by value, desc). */
  oldRank: number;
  /** 1-based rank in the latest snapshot (by value, desc). */
  newRank: number;
  /** oldRank − newRank (positive = climbed). */
  rankDelta: number;
}

/** The biggest trade-value movers between the two most recent snapshots. */
export interface TradeValueMoversInfo {
  risers: TradeValueMover[];
  fallers: TradeValueMover[];
  /** Date of the baseline snapshot. */
  baselineDate: string;
  /** Date of the latest snapshot. */
  currentDate: string;
}

/**
 * Biggest trade-value risers and fallers between the two most recent chart
 * snapshots. Both snapshots are priced on the standard 10-team full-PPR
 * scale, so deltas are apples-to-apples even in league mode. Players missing
 * from either snapshot are skipped; |valueDelta| below minDelta is noise and
 * is cut. Returns null with fewer than two snapshots.
 */
export function tradeValueMovers(
  snapshots: TradeValueSnapshot[],
  minDelta = 1.5,
  limit = 8,
): TradeValueMoversInfo | null {
  if (snapshots.length < 2) return null;
  const ordered = [...snapshots].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const baseline = ordered[ordered.length - 2];
  const current = ordered[ordered.length - 1];
  const rankOf = (values: Record<string, number>) => {
    const ids = Object.keys(values).sort((a, b) => values[b] - values[a]);
    return new Map(ids.map((id, i) => [id, i + 1] as const));
  };
  const baselineRank = rankOf(baseline.values);
  const currentRank = rankOf(current.values);
  const movers: TradeValueMover[] = [];
  for (const [id, newValue] of Object.entries(current.values)) {
    const oldValue = baseline.values[id];
    if (typeof oldValue !== 'number') continue;
    const valueDelta = round1(newValue - oldValue);
    if (Math.abs(valueDelta) < minDelta) continue;
    const oldRank = baselineRank.get(id)!;
    const newRank = currentRank.get(id)!;
    movers.push({
      poolId: id,
      oldValue,
      newValue,
      valueDelta,
      oldRank,
      newRank,
      rankDelta: oldRank - newRank,
    });
  }
  const risers = movers
    .filter(m => m.valueDelta > 0)
    .sort((a, b) => b.valueDelta - a.valueDelta)
    .slice(0, limit);
  const fallers = movers
    .filter(m => m.valueDelta < 0)
    .sort((a, b) => a.valueDelta - b.valueDelta)
    .slice(0, limit);
  return {
    risers,
    fallers,
    baselineDate: baseline.date,
    currentDate: current.date,
  };
}

/** Value-change deltas between the two most recent chart snapshots. */
export interface TradeValueDeltaInfo {
  /** Player pool id → value change (current − baseline), one decimal. */
  deltaByPoolId: Map<string, number>;
  /** Date of the baseline snapshot. */
  baselineDate: string;
  /** Date of the latest snapshot. */
  currentDate: string;
}

/**
 * Value-change deltas between the two most recent chart snapshots. Both
 * snapshots are priced on the standard 10-team full-PPR scale (see
 * scripts/snapshotTradeValues.ts), so deltas are apples-to-apples even in
 * league mode. Returns null with fewer than two snapshots; players missing
 * from the baseline snapshot get no delta.
 */
export function tradeValueDeltas(
  snapshots: TradeValueSnapshot[],
): TradeValueDeltaInfo | null {
  if (snapshots.length < 2) return null;
  const ordered = [...snapshots].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const baseline = ordered[ordered.length - 2];
  const current = ordered[ordered.length - 1];
  const deltaByPoolId = new Map<string, number>();
  for (const [id, value] of Object.entries(current.values)) {
    const base = baseline.values[id];
    if (typeof base !== 'number') continue;
    deltaByPoolId.set(id, round1(value - base));
  }
  return { deltaByPoolId, baselineDate: baseline.date, currentDate: current.date };
}

/**
 * Weigh both sides of a package trade by summed chart values. Guidance
 * only: values are a starting point, roster fit decides the deal.
 */
export function packageTotals(
  valueByPoolId: Map<string, number>,
  sideA: string[],
  sideB: string[],
): PackageVerdict {
  const round = (xs: string[]) =>
    round1(xs.reduce((s, id) => s + (valueByPoolId.get(id) ?? 0), 0));
  const sideATotal = round(sideA);
  const sideBTotal = round(sideB);
  const diff = round1(Math.abs(sideATotal - sideBTotal));
  const winner = diff <= PACKAGE_FAIR_BAND ? 'fair' : sideATotal > sideBTotal ? 'a' : 'b';
  return { sideATotal, sideBTotal, diff, winner };
}

export { DEFAULT_VOR_CONFIG };

// --- Auction-dollar equivalents (backlog item 83) ---------------------------

/**
 * The league's real total auction spend, summed from the synced draft picks'
 * auctionValue. Null for snake leagues / leagues with no priced picks, so
 * callers can hide the auction-dollar column instead of guessing.
 */
export function leagueAuctionSpend(league: League): number | null {
  let total = 0;
  let priced = false;
  for (const team of league.teams ?? []) {
    for (const pick of team.draftPicks ?? []) {
      const cost = pick.auctionValue ?? 0;
      if (cost > 0) {
        total += cost;
        priced = true;
      }
    }
  }
  return priced ? total : null;
}

/** Default auction budget priced in guest mode: $200 × 10 teams. */
export const GUEST_AUCTION_BUDGET = 2000;

/**
 * Translate chart values into auction dollars: distribute the total budget
 * across chart players proportional to their 0–100 values, whole dollars.
 * Empty for empty charts / non-positive budgets; players off the chart are
 * absent from the map (worth $0 of chart spend).
 */
export function auctionDollars(
  rows: TradeValueRow[],
  totalBudget: number,
): Map<string, number> {
  const out = new Map<string, number>();
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  if (totalValue <= 0 || totalBudget <= 0) return out;
  for (const r of rows) {
    out.set(r.player.id, Math.round((r.value / totalValue) * totalBudget));
  }
  return out;
}
