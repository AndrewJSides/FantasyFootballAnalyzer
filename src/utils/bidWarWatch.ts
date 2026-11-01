// Bid War Watch: for each of the Waiver Priority queue's top targets, name
// the rival teams whose roster profiles show a positional need at that
// target's position (the Trade Finder's teamProfiles) plus each rival's
// estimated remaining FAAB (the FAAB Budgets rows). Rivals with a need who
// still hold FAAB are the bidders; broke rivals (zero or negative
// remaining) can't bid and are named as such. The contested/warm/clear read
// nudges the suggested bid band — top of the range into a war, bottom end
// when nobody needs him. Guidance only: nothing is claimed or bid here.
//
// Competitor rationale (item 74): RosterProAI's public feature description
// says it "identifies free agents that could strengthen opponent rosters";
// FantasyPros' Waiver Assistant "integrates with your league to analyze
// your roster and league activity". This is TraderApe's version: rivals'
// needs and budgets joined against each target, from TraderApe's own
// engines and numbers.

import type { League, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import type { PositionKey } from './tradeAnalysis';
import { teamProfiles } from './tradeFinder';
import { faabBudgets } from './faabGuidance';
import type { WaiverPriorityTarget } from './waiverPriority';

const WATCH_POSITIONS: PositionKey[] = ['QB', 'RB', 'WR', 'TE'];

export interface BidWarRival {
  teamId: string;
  teamName: string;
  // Estimated remaining FAAB; null when the league has no recorded bid data.
  estRemaining: number | null;
  // False only when the league has bid data and the rival is at/below $0.
  canBid: boolean;
}

export type BidWarVerdict = 'hot' | 'warm' | 'clear';

export interface BidWarRow {
  player: PoolPlayer;
  // Suggested FAAB band from the priority queue; null = no bid data.
  bid: { low: number; high: number } | null;
  // Every rival with a positional need, richest first (unknown budget first).
  rivals: BidWarRival[];
  // Rivals with a need who can still bid (unknown budget counts).
  bidders: number;
  verdict: BidWarVerdict;
  // Plain-language bid nudge, strongest first.
  advice: string[];
}

function posKeyOf(position: string | undefined): PositionKey | null {
  const p = (position ?? '').toUpperCase();
  return (WATCH_POSITIONS as string[]).includes(p) ? (p as PositionKey) : null;
}

function bidBand(bid: { low: number; high: number } | null): string {
  return bid ? `$${bid.low}–$${bid.high}` : '';
}

export function buildBidWarWatch(
  league: League,
  team: Team,
  targets: WaiverPriorityTarget[],
  pool: DraftPoolFile = POOL,
  limit = 5,
): BidWarRow[] {
  const profiles = teamProfiles(league, pool);
  const budgets = faabBudgets(league);
  const budgetByTeam = new Map(
    (budgets ?? []).map(r => [r.teamId, r.estRemaining] as const),
  );

  return targets.slice(0, limit).map(target => {
    const pos = posKeyOf(target.player.pos) ?? 'WR';

    const rivals: BidWarRival[] = league.teams
      .filter(t => t.id !== team.id)
      .map(t => {
        const profile = profiles.find(p => p.team.id === t.id);
        if (!profile?.positions[pos]?.need) return null;
        const est = budgetByTeam.get(t.id) ?? null;
        return {
          teamId: t.id,
          teamName: t.name,
          estRemaining: est,
          canBid: est === null || est > 0,
        } satisfies BidWarRival;
      })
      .filter((r): r is BidWarRival => r !== null)
      // Unknown budget sorts first (they might bid); then richest first.
      .sort(
        (a, b) => (b.estRemaining ?? Infinity) - (a.estRemaining ?? Infinity),
      );

    const bidders = rivals.filter(r => r.canBid).length;
    const verdict: BidWarVerdict =
      bidders >= 2 ? 'hot' : bidders === 1 ? 'warm' : 'clear';

    const advice: string[] = [];
    const band = bidBand(target.bid);
    const plural = bidders === 1 ? '1 rival' : `${bidders} rivals`;
    if (verdict === 'hot') {
      advice.push(
        target.bid
          ? `Bid war: ${plural} need a ${pos} and can bid — aim for the top of the ${band} range.`
          : `Bid war: ${plural} need a ${pos} — expect competition and bid with conviction.`,
      );
    } else if (verdict === 'warm') {
      advice.push(
        target.bid
          ? `One rival needs a ${pos} — stay above $${target.bid.low} so a minimum bid doesn't lose him.`
          : `One rival needs a ${pos} — don't bid the minimum.`,
      );
    } else {
      advice.push(
        target.bid
          ? `Clear: no rival needs a ${pos} — the $${target.bid.low} end of the range should win him.`
          : `Clear: no rival needs a ${pos} — a light bid should land him.`,
      );
    }
    const brokeNames = rivals.filter(r => !r.canBid).map(r => r.teamName);
    if (brokeNames.length > 0) {
      advice.push(
        `${brokeNames.join(', ')} ${brokeNames.length === 1 ? 'needs' : 'need'} a ${pos} too ` +
          `but ${brokeNames.length === 1 ? 'is' : 'are'} out of FAAB — no bidding threat.`,
      );
    }

    return { player: target.player, bid: target.bid, rivals, bidders, verdict, advice };
  });
}
