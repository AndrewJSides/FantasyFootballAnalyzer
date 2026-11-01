// Draft ROI — backlog item 63: auction $ efficiency per team, priced on
// TraderApe's own season outlook (points scored so far + projected rest of
// season) against each team's actual auction spend. Answers "did I spend my
// auction dollars well" for auction leagues — Andrew's league is auction,
// and Yahoo/ESPN/Sleeper's draft grades are instant snake-ADP grades with no
// in-season auction-dollar accounting.
//
// Competitor source: FantasyPros' Draft Analyzer (post-draft value grades —
// public feature description only; theirs prices picks against ADP, ours
// prices auction dollars against the season outlook). Implemented from
// TraderApe's own data (league.draftPicks' auctionValue + the seasonOutlook
// engine), no copied content.
//
// Hides itself (returns undefined) in non-auction leagues (no auctionValue
// on the synced draft picks) and when the league isn't live.
import type { DraftPick, GamesPlayed, League, RosterSlots, ScoringType } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import type { WeeklyShapeFile } from '@/types/weeklyShape';
import { DEFAULT_ROSTER_SLOTS } from './draftDefaults';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import { seasonOutlooks } from './seasonOutlook';

export interface DraftBuy {
  playerName: string;
  /** Auction $ spent. */
  cost: number;
  /** Full-season expected points per auction $. Higher is better. */
  pointsPerDollar: number;
}

export interface DraftRoiEntry {
  teamId: string;
  teamName: string;
  /** 1-based rank by cost per projected point (1 = most efficient). */
  rank: number;
  /** Total auction $ spent on priced picks. */
  spent: number;
  /** Sum of full-season expected points (so far + projected) of priced picks. */
  projectedPoints: number;
  /** Auction $ per projected point. Lower is better. */
  costPerPoint: number;
  /** Best buy among picks costing $5+, by points per $. */
  bestBuy?: DraftBuy;
  /** Worst buy among picks costing $5+, by points per $. */
  worstBuy?: DraftBuy;
}

export interface DraftRoiInput {
  league: League;
  pool: DraftPoolFile;
  shape?: WeeklyShapeFile;
  scoring?: ScoringType;
  slots?: RosterSlots;
  teamCount?: number;
  season?: number;
  passTdPoints?: number;
  tePremiumPerReception?: number;
  gamesPlayed?: GamesPlayed;
}

// $1 fliers don't carry signal (a $1 bench stash with 0 outlook would
// "win" best buy by dividing by one). Only real spends count for buys.
const BUY_MIN_COST = 5;

/** League-mode auction draft ROI, or undefined when it can't be priced. */
export function buildDraftRoi(input: DraftRoiInput): DraftRoiEntry[] | undefined {
  const { league, pool, shape } = input;
  const currentWeek = league.currentWeek;
  if (!currentWeek || league.status !== 'live') return undefined;

  const scoring = input.scoring ?? league.scoringType ?? 'ppr';
  const slots = input.slots ?? league.rosterSlots ?? DEFAULT_ROSTER_SLOTS;
  const teamCount = input.teamCount ?? league.totalTeams ?? league.teams.length;
  const season = input.season ?? league.season;

  // Auction teams: at least one draft pick with a real auction price.
  const auctionTeams = league.teams.filter(t =>
    (t.draftPicks ?? []).some(p => (p.auctionValue ?? 0) > 0),
  );
  if (auctionTeams.length === 0) return undefined;

  // Price every auctioned pick through the season-outlook engine, keyed by
  // the same `${position}-${playerId}` key the engine writes. Picks that
  // don't resolve to the bundled pool (dropped mid-season, name variants)
  // are skipped — the same "unresolvable contributes nothing" rule the
  // Team Grades engine uses.
  const poolIndex = indexPool(pool);
  const allPicks: DraftPick[] = [];
  const seen = new Set<string>();
  for (const team of auctionTeams) {
    for (const pick of team.draftPicks ?? []) {
      if ((pick.auctionValue ?? 0) <= 0) continue;
      const resolved = resolvePoolPlayer(pick.player, poolIndex);
      if (!resolved) continue;
      if (seen.has(resolved.id)) continue;
      seen.add(resolved.id);
      allPicks.push(pick);
    }
  }
  if (allPicks.length === 0) return undefined;

  const outlooks = seasonOutlooks(allPicks, pool, season === shape?.season ? shape : undefined, {
    scoring,
    slots,
    teamCount,
    currentWeek,
    season,
    extras: {
      passTdPoints: input.passTdPoints ?? league.passTdPoints,
      tePremiumPerReception: input.tePremiumPerReception ?? league.tePremiumPerReception,
    },
    gamesPlayed: input.gamesPlayed ?? league.gamesPlayed,
    platform: league.platform,
  });

  const entries: DraftRoiEntry[] = [];
  for (const team of auctionTeams) {
    let spent = 0;
    let projectedPoints = 0;
    let bestBuy: DraftBuy | undefined;
    let worstBuy: DraftBuy | undefined;
    for (const pick of team.draftPicks ?? []) {
      const cost = pick.auctionValue ?? 0;
      if (cost <= 0) continue;
      if (!resolvePoolPlayer(pick.player, poolIndex)) continue;
      const outlook = outlooks.get(`${pick.player.position}-${pick.player.id}`);
      if (!outlook) continue;
      spent += cost;
      projectedPoints += outlook.total;
      if (cost >= BUY_MIN_COST) {
        const buy: DraftBuy = {
          playerName: pick.player.name,
          cost,
          pointsPerDollar: outlook.total / cost,
        };
        if (!bestBuy || buy.pointsPerDollar > bestBuy.pointsPerDollar) bestBuy = buy;
        if (!worstBuy || buy.pointsPerDollar < worstBuy.pointsPerDollar) worstBuy = buy;
      }
    }
    if (spent <= 0 || projectedPoints <= 0) continue;
    const roundedPoints = Math.round(projectedPoints * 10) / 10;
    entries.push({
      teamId: team.id,
      teamName: team.name,
      rank: 0,
      spent,
      projectedPoints: roundedPoints,
      costPerPoint: spent / roundedPoints,
      bestBuy,
      worstBuy,
    });
  }
  if (entries.length === 0) return undefined;

  entries.sort((a, b) => a.costPerPoint - b.costPerPoint);
  entries.forEach((e, i) => {
    e.rank = i + 1;
  });
  return entries;
}
