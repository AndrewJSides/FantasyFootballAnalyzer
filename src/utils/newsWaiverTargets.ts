// News-driven waiver targets (backlog item 65): join ESPN's latest NFL
// headlines against the bundled pool and keep only the players this league
// can actually add. The /news page is league-wide and its "My players"
// filter is roster-scoped; this answers "a player in the news I can
// actually add" — the news signal the waiver wire was missing (a backup
// named starter, a star's injury first surfaces as a headline, and the add
// window closes fast).
//
// No new data source: ESPN's free public news API (espnNews.ts) + the
// athlete->pool join (newsPlayers.ts) + league roster resolution via
// indexPool/resolvePoolPlayer (consensusGrade.ts, the same path the
// Trending Adds and Handcuff Report use). Nothing here adds a player; it's
// waiver-wire research.

import type { League } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { NflNewsItem } from '@/api/espnNews';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import { matchNewsAthletes } from './newsPlayers';

const NEWS_WAIVER_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

export interface NewsWaiverTarget {
  player: PoolPlayer;
  /** The newest headline tagging this player. */
  headline: string;
  /** Canonical ESPN article URL for the headline. */
  url: string;
  /** ISO timestamp from ESPN's `published` field. */
  published: string;
}

/** Pool ids of every rostered player in the loaded league. Empty in guest
 *  mode (no rosters), so nothing is excluded there. */
function rosteredPoolIds(league: League, pool: DraftPoolFile): Set<string> {
  const ids = new Set<string>();
  const index = indexPool(pool);
  for (const team of league.teams ?? []) {
    for (const p of team.roster ?? []) {
      const resolved = resolvePoolPlayer(p, index);
      if (resolved) ids.add(resolved.id);
    }
  }
  return ids;
}

/** Available (unrostered) startable skill players tagged in the latest
 *  headlines — one row per player, newest headline wins, capped at `limit`.
 *  Items are expected newest-first (ESPN's API order), which the newest-
 *  headline-wins rule relies on. K/DST and unprojected players are excluded
 *  on the same discipline as the Trending Adds targets. */
export function newsWaiverTargets(
  league: League,
  items: NflNewsItem[],
  pool: DraftPoolFile = POOL,
  limit = 8,
): NewsWaiverTarget[] {
  const names: string[] = [];
  for (const item of items) names.push(...item.athletes);
  const playerByAthlete = matchNewsAthletes(names, pool);
  const rostered = rosteredPoolIds(league, pool);
  const targets: NewsWaiverTarget[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const name of item.athletes) {
      const player = playerByAthlete.get(name);
      if (!player || seen.has(player.id)) continue;
      if (rostered.has(player.id)) continue;
      if (!NEWS_WAIVER_POSITIONS.has(player.pos.toUpperCase())) continue;
      if (typeof player.projPtsPpr !== 'number' || player.projPtsPpr <= 0)
        continue;
      seen.add(player.id);
      targets.push({
        player,
        headline: item.headline,
        url: item.url,
        published: item.published,
      });
      if (targets.length >= Math.max(0, limit)) return targets;
    }
  }
  return targets;
}
