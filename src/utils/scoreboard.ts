// Scoreboard shaping for the /scores page (backlog item 84): sort order,
// game-state counts for the header, and the league-aware "your guys" join
// (my roster's players per NFL team, so a manager sees which of his players
// are in each game at a glance). Pure functions — all ESPN fetching lives
// in src/api/espnScoreboard.ts.

import type { DraftPoolFile } from '@/types/draft';
import type { ScoreboardGame } from '@/api/espnScoreboard';
import { indexPool } from './consensusGrade';

/** Live games first, then upcoming (by kickoff), then finals (by kickoff). */
export function sortScoreboardGames(games: ScoreboardGame[]): ScoreboardGame[] {
  const rank = { in: 0, pre: 1, post: 2 } as const;
  return [...games].sort((a, b) => {
    const byState = rank[a.state] - rank[b.state];
    if (byState !== 0) return byState;
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
}

export interface ScoreboardCounts {
  live: number;
  upcoming: number;
  final: number;
}

/** Game-state counts for the page header + aria-live refresh announcements. */
export function scoreboardCounts(games: ScoreboardGame[]): ScoreboardCounts {
  const counts: ScoreboardCounts = { live: 0, upcoming: 0, final: 0 };
  for (const g of games) {
    if (g.state === 'in') counts.live += 1;
    else if (g.state === 'pre') counts.upcoming += 1;
    else counts.final += 1;
  }
  return counts;
}

export interface TeamMyPlayer {
  name: string;
  pos: string;
}

/** Map each game team's canonical abbreviation to the manager's rostered
 *  players on it, from the pool ids on his roster (backlog item 58's
 *  myTeamPoolIds). Empty map when there is no my-team roster. */
export function teamMyPlayers(
  myPoolIds: Set<string>,
  pool: DraftPoolFile,
): Map<string, TeamMyPlayer[]> {
  const byTeam = new Map<string, TeamMyPlayer[]>();
  if (myPoolIds.size === 0) return byTeam;
  const index = indexPool(pool);
  for (const id of myPoolIds) {
    const player = index.byId.get(id);
    if (!player) continue;
    const list = byTeam.get(player.team) ?? [];
    list.push({ name: player.name, pos: player.pos });
    byTeam.set(player.team, list);
  }
  return byTeam;
}

/** "Your guys" line for one game: the manager's players on either NFL team,
 *  away team first. Empty string when none. */
export function gameMyPlayersLine(
  game: ScoreboardGame,
  byTeam: Map<string, TeamMyPlayer[]>,
): string {
  const names = [
    ...(byTeam.get(game.awayAbbr) ?? []),
    ...(byTeam.get(game.homeAbbr) ?? []),
  ].map(p => `${p.name} (${p.pos})`);
  return names.length > 0 ? names.join(', ') : '';
}
