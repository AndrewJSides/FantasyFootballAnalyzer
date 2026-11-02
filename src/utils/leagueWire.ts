import type { League, Player, Transaction } from '@/types';

// League Wire: one chronological feed of every league's add/drop moves
// (waiver claims + free-agent pickups) from the synced per-team
// transactions. Trades live on the Trades page, not here.

export type WireMoveType = 'waiver' | 'free_agent';

export interface WireRow {
  id: string;
  timestamp: number;
  week: number;
  teamId: string;
  teamName: string;
  type: WireMoveType;
  adds: Player[];
  drops: Player[];
  waiverBudgetSpent?: number;
}

export function isWireMove(tx: Transaction): tx is Transaction & { type: WireMoveType } {
  return tx.type === 'waiver' || tx.type === 'free_agent';
}

export function buildLeagueWire(league: League): WireRow[] {
  const rows: WireRow[] = [];
  for (const team of league.teams ?? []) {
    for (const tx of team.transactions ?? []) {
      if (!isWireMove(tx)) continue;
      rows.push({
        id: `${tx.id}::${tx.teamId}`,
        timestamp: tx.timestamp,
        week: tx.week,
        teamId: tx.teamId,
        teamName: tx.teamName || team.name,
        type: tx.type,
        adds: tx.adds ?? [],
        drops: tx.drops ?? [],
        waiverBudgetSpent: tx.waiverBudgetSpent,
      });
    }
  }
  // Newest first; team-name tiebreak keeps same-timestamp moves stable.
  rows.sort(
    (a, b) => b.timestamp - a.timestamp || a.teamName.localeCompare(b.teamName),
  );
  return rows;
}

export interface WireFilters {
  teamId: string; // '' = all teams
  type: '' | WireMoveType; // '' = all types
}

export function filterWire(rows: WireRow[], filters: WireFilters): WireRow[] {
  return rows.filter(
    r =>
      (!filters.teamId || r.teamId === filters.teamId) &&
      (!filters.type || r.type === filters.type),
  );
}

/** Teams that have at least one wire move, for the filter dropdown. */
export function wireTeams(rows: WireRow[]): { teamId: string; teamName: string }[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (!seen.has(r.teamId)) seen.set(r.teamId, r.teamName);
  }
  return [...seen.entries()]
    .map(([teamId, teamName]) => ({ teamId, teamName }))
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
}

export function wireMoveLabel(row: WireRow): string {
  return row.type === 'waiver' ? 'claimed' : 'picked up';
}
