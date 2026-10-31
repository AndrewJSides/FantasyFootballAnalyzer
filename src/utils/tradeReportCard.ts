// Season Trade Report Card: who is winning the trade market. Per team, sums
// TraderApe's own per-trade points-above-replacement (netPAR, already stored
// on each completed trade side by the sync) across every completed trade,
// names the best and worst deal, and grades the team on the same percentile
// letter scale as the Waiver Report Card and Team Grades. Guidance only —
// nothing here moves rosters.
import type { Trade, Team } from '@/types';

export interface TradeReportCardRow {
  teamId: string;
  teamName: string;
  // Completed trades this team was part of.
  trades: number;
  // Trade verdict record from the sync's winner flag: wins/losses/fair.
  wins: number;
  losses: number;
  fair: number;
  // Summed net PAR across completed trades, one decimal.
  totalNetPar: number;
  bestTrade: { label: string; netPar: number } | null;
  worstTrade: { label: string; netPar: number } | null;
  grade: string;
}

// Same percentile letter scale as the Waiver Report Card (percentile: 1 =
// best team, 0 = worst) — kept local so this module stays self-contained.
function letterForPercentile(percentile: number): string {
  if (percentile >= 0.97) return 'A+';
  if (percentile >= 0.88) return 'A';
  if (percentile >= 0.79) return 'A-';
  if (percentile >= 0.7) return 'B+';
  if (percentile >= 0.6) return 'B';
  if (percentile >= 0.51) return 'B-';
  if (percentile >= 0.42) return 'C+';
  if (percentile >= 0.32) return 'C';
  if (percentile >= 0.22) return 'C-';
  if (percentile >= 0.12) return 'D';
  return 'F';
}

// Rows before the league-relative grade is attached.
type UngradedRow = Omit<TradeReportCardRow, 'grade'>;

// A plain-language label for one side of a trade: the week and the other
// team's name, e.g. "W5 vs Delta". Multi-team deals name the field instead
// of guessing which side is "the opponent".
function tradeLabel(trade: Trade, teamId: string): string {
  if (trade.teams.length === 2) {
    const other = trade.teams.find(t => t.teamId !== teamId);
    if (other) return `W${trade.week} vs ${other.teamName}`;
  }
  return `W${trade.week} · multi-team`;
}

export function buildTradeReportCard(
  trades: Trade[] | undefined,
  teams: Team[],
): TradeReportCardRow[] | null {
  const completed = (trades ?? []).filter(t => t.status === 'completed');
  // Nobody traded: nothing to grade — the page keeps its "No Trades Found"
  // empty state and this section stays out of the way.
  if (completed.length === 0 || teams.length === 0) return null;

  const rows: UngradedRow[] = teams.map(team => {
    let tradeCount = 0;
    let wins = 0;
    let losses = 0;
    let fair = 0;
    let totalNetPar = 0;
    let best: { label: string; netPar: number } | null = null;
    let worst: { label: string; netPar: number } | null = null;
    for (const trade of completed) {
      const side = trade.teams.find(t => t.teamId === team.id);
      if (!side) continue;
      tradeCount += 1;
      // Same netting the TradeTable's leaderboard uses: netPAR when the
      // sync graded it, netValue as the legacy fallback.
      const netPar = side.netPAR ?? side.netValue ?? 0;
      totalNetPar += netPar;
      if (trade.winner === team.id) wins += 1;
      else if (trade.winner) losses += 1;
      else fair += 1;
      const label = tradeLabel(trade, team.id);
      if (!best || netPar > best.netPar) best = { label, netPar };
      if (!worst || netPar < worst.netPar) worst = { label, netPar };
    }
    return {
      teamId: team.id,
      teamName: team.name,
      trades: tradeCount,
      wins,
      losses,
      fair,
      totalNetPar: Math.round(totalNetPar * 10) / 10,
      bestTrade: best,
      worstTrade: worst,
    };
  });

  // Keep only teams that actually traded — a row of zeros is noise, not a
  // record (same convention as the TradeTable's leaderboard).
  const active = rows.filter(r => r.trades > 0);
  if (active.length === 0) return null;

  active.sort((a, b) => b.totalNetPar - a.totalNetPar);
  const n = active.length;
  return active.map((r, i) => ({
    ...r,
    grade: letterForPercentile((n - i) / n),
  }));
}
