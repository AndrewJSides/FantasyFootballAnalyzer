import type { Team } from '@/types';
import type { TradeCandidate } from './tradeFinder';

// Backlog item 93: ranked trade partners ("who should I call first").
// Aggregates the Trade Finder's win-win candidates per rival team, from the
// focus team's perspective — the trade-deadline "rank my trade partners"
// read. Reuses findTradeCandidates' output wholesale; no new pricing.

export interface TradePartnerRow {
  team: Team;
  candidateCount: number;
  totalScore: number;
  // Highest-score candidate involving the focus team.
  best: TradeCandidate;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Rank the other teams by trade fit with the focus team: most win-win
 * candidates first, combined candidate score as the tie-break. Only
 * candidates involving the focus team are counted.
 */
export function rankTradePartners(
  candidates: TradeCandidate[],
  focusTeamId: string,
): TradePartnerRow[] {
  const byPartner = new Map<string, { team: Team; rows: TradeCandidate[] }>();
  for (const c of candidates) {
    const involves =
      c.teamA.id === focusTeamId || c.teamB.id === focusTeamId;
    if (!involves) continue;
    const partner = c.teamA.id === focusTeamId ? c.teamB : c.teamA;
    const entry = byPartner.get(partner.id) ?? { team: partner, rows: [] };
    entry.rows.push(c);
    byPartner.set(partner.id, entry);
  }
  return [...byPartner.values()]
    .map(({ team, rows }) => {
      const sorted = [...rows].sort((x, y) => y.score - x.score);
      return {
        team,
        candidateCount: rows.length,
        totalScore: round1(rows.reduce((s, r) => s + r.score, 0)),
        best: sorted[0],
      };
    })
    .sort(
      (a, b) =>
        b.candidateCount - a.candidateCount || b.totalScore - a.totalScore,
    );
}

export interface PartnerDealLine {
  give: string[];
  get: string[];
}

/**
 * The best deal's give/get from the focus team's perspective: "you give
 * these players, you get these players back".
 */
export function partnerDealLine(
  candidate: TradeCandidate,
  focusTeamId: string,
): PartnerDealLine {
  const focusIsA = candidate.teamA.id === focusTeamId;
  return {
    give: (focusIsA ? candidate.aGives : candidate.bGives).map(p => p.name),
    get: (focusIsA ? candidate.bGives : candidate.aGives).map(p => p.name),
  };
}
