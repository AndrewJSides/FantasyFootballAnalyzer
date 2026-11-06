import type { TradeCandidate } from './tradeFinder';
import type { CycleTeamNet } from './threeTeamTrades';

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

// Deep link for one team's side of a three-team cycle (backlog item 172
// remainder): what the team gives vs what it gets, opened in the analyzer's
// manual mode — deliberately WITHOUT team ids. The analyzer grades two-team
// deals, so including the giver/receiver ids would model the receiver
// giving the incoming player back to the giver, which isn't what happens in
// a circle; manual mode prices the net on VOR alone, which is exactly the
// "is my side of this deal worth it" question.
export function cycleNetLink(net: CycleTeamNet, search: string): string {
  const payload = {
    a: net.gives.map(p => p.name),
    b: net.gets.map(p => p.name),
  };
  return `/trade-analyzer${search}#trade=${encodeURIComponent(JSON.stringify(payload))}`;
}
