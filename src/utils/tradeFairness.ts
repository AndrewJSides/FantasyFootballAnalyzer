// "Make it fair" counter-offer suggestions for the Trade Analyzer
// (backlog item 53). When the verdict isn't even, this suggests the
// single-player tweaks — add a player to the losing side from that side's
// roster, or remove a player from the winning side — that would even the
// deal out (or come closest to it), priced on the same VOR values the
// verdict uses.
//
// Competitor source: fantasy-trade-analyzer.com (public feature description
// only — https://fantasy-trade-analyzer.com/): "If the trade is lopsided,
// the analyzer suggests a player that would even it out. Tap a suggestion
// to add it." Implemented from TraderApe's own VOR engine, no copied
// content.

import type { Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import {
  DEFAULT_VOR_CONFIG,
  vorPoints,
  type ValueLeague,
  type VorConfig,
} from './projectionValues';
import { TRADE_VALUE_POSITIONS } from './tradeValues';

/** Even band shared with analyzeTradeValue in tradeAnalysis.ts (15% share). */
export const FAIRNESS_EVEN_SHARE = 0.15;

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface FairnessFix {
  /** 'add': add the player to the named side. 'remove': remove him from it. */
  action: 'add' | 'remove';
  /** 'A' | 'B' — the side the player joins (add) or leaves (remove). */
  side: 'A' | 'B';
  player: PoolPlayer;
  /** Resulting absolute VOR margin after the fix. */
  newMargin: number;
  /** Resulting verdict after the fix. */
  newWinner: 'A' | 'B' | 'even';
}

export interface FairnessFixOptions {
  sideA: PoolPlayer[];
  sideB: PoolPlayer[];
  valueLeague: ValueLeague;
  /** League mode: the two sides' team rosters supply the add candidates. */
  rosterA?: Player[];
  rosterB?: Player[];
  pool?: DraftPoolFile;
  cfg?: VorConfig;
  /** Max suggestions returned (default 3). */
  max?: number;
  /** Expected VOR points of future draft picks already on each side
      (backlog item 175): the fixes price on the same pick-adjusted totals
      as the verdict, so a trade that's even only because of a pick gets
      no spurious "make it fair" suggestion. */
  pickVorA?: number;
  pickVorB?: number;
}

function normName(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Single-player tweaks that move a lopsided trade toward even, best first.
 * Returns [] when the trade is already even. "Add" candidates come from the
 * losing side's team roster in league mode (or the bundled pool in manual
 * mode); "remove" candidates come off the winning side's deal (never its
 * only player). A fix only counts when it strictly shrinks the margin.
 */
export function suggestFairnessFixes(opts: FairnessFixOptions): FairnessFix[] {
  const { sideA, sideB, valueLeague } = opts;
  const pool = opts.pool ?? POOL;
  const cfg = opts.cfg ?? DEFAULT_VOR_CONFIG;
  const max = opts.max ?? 3;

  const vorById = vorPoints(pool.players, valueLeague, cfg);
  const vorOf = (p: PoolPlayer): number => round1(vorById.get(p.id) ?? 0);

  const totalOf = (players: PoolPlayer[]): number =>
    round1(players.reduce((s, p) => s + vorOf(p), 0));

  const verdictOf = (
    totalA: number,
    totalB: number,
  ): { winner: 'A' | 'B' | 'even'; margin: number } => {
    const margin = round1(Math.abs(totalA - totalB));
    const larger = Math.max(totalA, totalB);
    const share = larger > 0 ? margin / larger : 0;
    const winner = share > FAIRNESS_EVEN_SHARE && larger > 0 ? (totalA > totalB ? 'A' : 'B') : 'even';
    return { winner, margin };
  };

  const totalA = round1(totalOf(sideA) + (opts.pickVorA ?? 0));
  const totalB = round1(totalOf(sideB) + (opts.pickVorB ?? 0));
  const base = verdictOf(totalA, totalB);
  if (base.winner === 'even') return [];

  const loser: 'A' | 'B' = base.winner === 'A' ? 'B' : 'A';
  const winner: 'A' | 'B' = base.winner;

  // Players already changing hands can't be suggested — trading a player
  // against himself grades nothing real (same guard as the builder).
  const involved = new Set<string>();
  for (const p of [...sideA, ...sideB]) {
    involved.add(p.id);
    involved.add(normName(p.name));
  }

  // Add candidates: the losing side's roster in league mode, the bundled
  // pool in manual mode. Only the four VOR-priced positions — K/DST carry
  // no VOR, so they could never shrink the margin anyway.
  const index = indexPool(pool);
  const roster = loser === 'A' ? opts.rosterA : opts.rosterB;
  const addPool: PoolPlayer[] =
    roster && roster.length > 0
      ? roster
          .map(r => resolvePoolPlayer(r, index))
          .filter((p): p is PoolPlayer => !!p)
      : pool.players;
  const addCandidates = addPool.filter(
    p =>
      (TRADE_VALUE_POSITIONS as readonly string[]).includes(p.pos) &&
      !involved.has(p.id) &&
      !involved.has(normName(p.name)) &&
      vorOf(p) > 0,
  );

  const fixes: FairnessFix[] = [];
  const loserTotal = loser === 'A' ? totalA : totalB;
  const otherTotal = loser === 'A' ? totalB : totalA;
  for (const player of addCandidates) {
    const newLoserTotal = round1(loserTotal + vorOf(player));
    const v =
      loser === 'A'
        ? verdictOf(newLoserTotal, otherTotal)
        : verdictOf(otherTotal, newLoserTotal);
    // A big add can overshoot and flip the loser into the new winner —
    // keep only tweaks that strictly shrink the margin.
    if (v.margin < base.margin) {
      fixes.push({ action: 'add', side: loser, player, newMargin: v.margin, newWinner: v.winner });
    }
  }

  // Remove candidates: take a player off the winning side's deal (never the
  // side's only player — an empty side isn't a trade).
  const winnerSide = winner === 'A' ? sideA : sideB;
  const winnerTotal = winner === 'A' ? totalA : totalB;
  if (winnerSide.length >= 2) {
    for (const player of winnerSide) {
      const v = vorOf(player);
      if (v <= 0) continue;
      const newWinnerTotal = round1(winnerTotal - v);
      const res =
        winner === 'A'
          ? verdictOf(newWinnerTotal, otherTotal)
          : verdictOf(otherTotal, newWinnerTotal);
      if (res.margin < base.margin) {
        fixes.push({
          action: 'remove',
          side: winner,
          player,
          newMargin: res.margin,
          newWinner: res.winner,
        });
      }
    }
  }

  // Best first: smallest resulting margin, adds before removals on ties,
  // then name for a deterministic order.
  fixes.sort((x, y) => {
    if (x.newMargin !== y.newMargin) return x.newMargin - y.newMargin;
    if (x.action !== y.action) return x.action === 'add' ? -1 : 1;
    return x.player.name.localeCompare(y.player.name);
  });
  return fixes.slice(0, Math.max(0, max));
}

/**
 * Plain-language description of a fix for the button's accessible name and
 * tooltip: what changes and what the trade grades after it.
 */
export function fixBlurb(
  fix: FairnessFix,
  nameA = 'Side A',
  nameB = 'Side B',
): string {
  const sideName = fix.side === 'A' ? nameA : nameB;
  const change =
    fix.action === 'add'
      ? `Add ${fix.player.name} to ${sideName}`
      : `Remove ${fix.player.name} from ${sideName}`;
  const result =
    fix.newWinner === 'even'
      ? 'makes the trade even'
      : `${fix.newWinner === 'A' ? nameA : nameB} still leads by ${fix.newMargin} VOR`;
  return `${change} — ${result}.`;
}
