import type { TradeCandidate } from './tradeFinder';

// Deep link into the Trade Analyzer with a trade pre-filled from a
// candidate's give lists (player names), plus the team ids when the deal
// comes from a real league so the analyzer opens in league mode.
export function tradeLink(
  candidate: TradeCandidate,
  search: string,
  includeTeamIds: boolean,
): string {
  const payload = {
    a: candidate.aGives.map(p => p.name),
    b: candidate.bGives.map(p => p.name),
    ...(includeTeamIds
      ? { ta: candidate.teamA.id, tb: candidate.teamB.id }
      : {}),
  };
  return `/trade-analyzer${search}#trade=${encodeURIComponent(JSON.stringify(payload))}`;
}
