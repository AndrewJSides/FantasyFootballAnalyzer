// Roster-scoped news filter (backlog item 58): which pool players sit on the
// manager's own roster, and which headlines tag at least one of them, so the
// News page can offer a "My players" view alongside the league-wide feed.
//
// No new data source: the ESPN-athlete -> pool join comes from newsPlayers.ts
// and roster -> pool resolution reuses indexPool/resolvePoolPlayer from
// consensusGrade.ts (the same path the Injury Report and Handcuff Report use).

import type { League } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { NflNewsItem } from '@/api/espnNews';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from './consensusGrade';

/** Pool ids of the players on the manager's own roster. Empty when the league
 *  has no remembered my-team or the sync fetched no roster — the page hides
 *  the "My players" filter in that case. */
export function myTeamPoolIds(league: League, pool: DraftPoolFile = POOL): Set<string> {
  const ids = new Set<string>();
  const roster = league.teams?.find(t => t.isMyTeam)?.roster;
  if (!roster || roster.length === 0) return ids;
  const index = indexPool(pool);
  for (const player of roster) {
    const poolPlayer = resolvePoolPlayer(player, index);
    if (poolPlayer) ids.add(poolPlayer.id);
  }
  return ids;
}

/** Keep the headlines that tag at least one of the manager's pool players.
 *  playerByAthlete is the page's existing ESPN-athlete -> pool join
 *  (matchNewsAthletes); names it couldn't match are plain text there and
 *  never match here either. */
export function filterNewsToMyPlayers(
  items: NflNewsItem[],
  playerByAthlete: Map<string, PoolPlayer>,
  myPoolIds: Set<string>,
): NflNewsItem[] {
  if (myPoolIds.size === 0) return [];
  return items.filter(item =>
    item.athletes.some(name => {
      const player = playerByAthlete.get(name);
      return player !== undefined && myPoolIds.has(player.id);
    }),
  );
}
