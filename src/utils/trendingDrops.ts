// Trending Drops (backlog item 44): the cut-signal counterpart to Trending
// Adds. Sleeper's free trending/drop feed is league-wide cut momentum;
// joining it against the loaded league's rosters answers two questions:
// "is anyone on MY roster a popular cut?" (cut candidates) and "did the
// market overreact?" (most-dropped players who are actually free agents).
// Priced with TraderApe's own numbers (pool projection + matchup rating).
// Nothing here moves rosters — it's waiver-wire research.

import type { League } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import type { TrendingDrop } from '@/api/sleeperTrending';

const TRENDING_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

// How many rows the panel keeps (matches Trending Adds).
export const MAX_TRENDING_DROPS = 10;

export interface TrendingDropTarget {
  player: PoolPlayer;
  /** League-wide drops in the lookback window (from Sleeper). */
  drops: number;
  /** Owning league team name, or null when unrostered. */
  owner: string | null;
  /** True when the owning team is the manager's own (league mode). */
  isMine: boolean;
}

export function trendingDropTargets(
  league: League,
  pool: DraftPoolFile = POOL,
  trending: TrendingDrop[],
  limit = MAX_TRENDING_DROPS,
): TrendingDropTarget[] {
  const index = indexPool(pool);
  // Pool id -> owning team (league mode; empty in guest mode).
  const ownerByPoolId = new Map<string, { name: string; mine: boolean }>();
  for (const team of league.teams ?? []) {
    for (const p of team.roster ?? []) {
      const resolved = resolvePoolPlayer(p, index);
      if (resolved && !ownerByPoolId.has(resolved.id)) {
        ownerByPoolId.set(resolved.id, {
          name: team.name,
          mine: team.isMyTeam === true,
        });
      }
    }
  }
  const bySleeperId = new Map<string, PoolPlayer>();
  for (const p of pool.players) {
    if (p.sleeperId) bySleeperId.set(p.sleeperId, p);
  }
  const targets: TrendingDropTarget[] = [];
  for (const entry of trending) {
    const player = bySleeperId.get(entry.playerId);
    if (!player) continue;
    if (!TRENDING_POSITIONS.has(player.pos.toUpperCase())) continue;
    if (typeof player.projPtsPpr !== 'number' || player.projPtsPpr <= 0)
      continue;
    if (targets.some(t => t.player.id === player.id)) continue;
    const owner = ownerByPoolId.get(player.id) ?? null;
    targets.push({
      player,
      drops: entry.count,
      owner: owner?.name ?? null,
      isMine: owner?.mine ?? false,
    });
    if (targets.length >= Math.max(0, limit)) break;
  }
  return targets;
}
