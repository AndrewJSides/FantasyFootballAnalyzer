// Rivalry matrix — backlog item 95: who owns whom this season.
// Team × team head-to-head W-L-T from this season's completed-week
// matchups — the league-wide version of the Matchup page's per-pair
// series history (item 32).
//
// Competitor source: Yahoo's league-history "head-to-head records" and
// Sleeper's all-time matchup history view (public feature descriptions
// only — e.g. Yahoo fantasy matchup previews show "Head-to-Head: Team A
// leads 4-3"). Implemented from TraderApe's own completed-week matchup
// scores, no copied content.
//
// Hides itself (returns null) when the sync fetched no matchups (old
// snapshots, guest mode) or no week is complete yet. The live current
// week is excluded, mirroring completedMatchups: a half-played game can
// never count in a season series.

import type { League } from '@/types';
import { completedMatchups } from './completedMatchups';

export interface RivalryCell {
  opponentId: string;
  opponentName: string;
  /** Completed games between the row team and this opponent. */
  games: number;
  /** The row team's wins / losses / ties against this opponent. */
  wins: number;
  losses: number;
  ties: number;
}

export interface RivalryRow {
  teamId: string;
  teamName: string;
  /** One cell per league team, in league.teams order (self included). */
  cells: RivalryCell[];
}

export interface RivalryMatrix {
  rows: RivalryRow[];
  /** Distinct completed weeks counted. */
  weeks: number;
}

export function buildRivalryMatrix(league: League): RivalryMatrix | null {
  const played = completedMatchups(league);
  if (played.length === 0 || league.teams.length === 0) return null;
  const weeks = new Set(played.map(m => m.week)).size;
  const rows: RivalryRow[] = league.teams.map(team => {
    const cells: RivalryCell[] = league.teams.map(opp => {
      const cell: RivalryCell = {
        opponentId: opp.id,
        opponentName: opp.name,
        games: 0,
        wins: 0,
        losses: 0,
        ties: 0,
      };
      if (team.id === opp.id) return cell;
      for (const m of played) {
        const rowIs1 = m.team1Id === team.id && m.team2Id === opp.id;
        const rowIs2 = m.team2Id === team.id && m.team1Id === opp.id;
        if (!rowIs1 && !rowIs2) continue;
        const mine = rowIs1 ? m.team1Points : m.team2Points;
        const theirs = rowIs1 ? m.team2Points : m.team1Points;
        cell.games += 1;
        if (mine > theirs) cell.wins += 1;
        else if (theirs > mine) cell.losses += 1;
        else cell.ties += 1;
      }
      return cell;
    });
    return { teamId: team.id, teamName: team.name, cells };
  });
  return { rows, weeks };
}
