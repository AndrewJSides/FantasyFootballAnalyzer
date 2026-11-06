import type { League, Player, Transaction } from '@/types';

// League Wire: one chronological feed of every league move — add/drop moves
// (waiver claims + free-agent pickups) from the synced per-team
// transactions, plus completed trades from the synced trade list (the
// Trades page keeps the full trade table; the wire is the single
// newest-first stream). Pending or vetoed trades are not moves yet and
// never appear here.

export type WireMoveType = 'waiver' | 'free_agent' | 'trade';

/** One side of a completed trade: what that team received. */
export interface WireTradeSide {
  teamId: string;
  teamName: string;
  received: Player[];
}

export interface WireRow {
  id: string;
  timestamp: number;
  week: number;
  teamId: string;
  teamName: string;
  /** Every team involved in the move — one id for wire moves, all sides for a trade. */
  teamIds: string[];
  type: WireMoveType;
  adds: Player[];
  drops: Player[];
  /** Trade rows only: per-side "received" lists. */
  sides?: WireTradeSide[];
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
        teamIds: [tx.teamId],
        type: tx.type,
        adds: tx.adds ?? [],
        drops: tx.drops ?? [],
        waiverBudgetSpent: tx.waiverBudgetSpent,
      });
    }
  }
  // Completed trades from the synced trade list. A trade-type transaction
  // in team.transactions is still skipped above — the trade list is the
  // single source, so one deal never appears twice.
  for (const trade of league.trades ?? []) {
    if (trade.status !== 'completed') continue;
    const sides = trade.teams ?? [];
    if (sides.length < 2) continue;
    rows.push({
      id: `trade::${trade.id}`,
      timestamp: trade.timestamp,
      week: trade.week,
      teamId: sides[0].teamId,
      teamName: sides[0].teamName,
      teamIds: sides.map(s => s.teamId),
      type: 'trade',
      adds: [],
      drops: [],
      sides: sides.map(s => ({
        teamId: s.teamId,
        teamName: s.teamName,
        received: s.playersReceived ?? [],
      })),
    });
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
      (!filters.teamId || r.teamIds.includes(filters.teamId)) &&
      (!filters.type || r.type === filters.type),
  );
}

/** Teams that have at least one wire move, for the filter dropdown. */
export function wireTeams(rows: WireRow[]): { teamId: string; teamName: string }[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    // Trade rows involve every side; wire rows involve their one team.
    const entries: [string, string][] = r.sides
      ? r.sides.map(s => [s.teamId, s.teamName] as [string, string])
      : [[r.teamId, r.teamName]];
    for (const [teamId, teamName] of entries) {
      if (!seen.has(teamId)) seen.set(teamId, teamName);
    }
  }
  return [...seen.entries()]
    .map(([teamId, teamName]) => ({ teamId, teamName }))
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
}

export function wireMoveLabel(row: WireRow): string {
  return row.type === 'waiver' ? 'claimed' : row.type === 'trade' ? 'traded' : 'picked up';
}
