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
import {
  DEFAULT_VOR_CONFIG,
  vorConfigFor,
  vorPoints,
  type ValueLeague,
  type VorConfig,
} from './projectionValues';

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
