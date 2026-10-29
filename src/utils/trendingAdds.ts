// Join Sleeper's trending-add ids against the bundled pool and drop
// anything already rostered in the loaded league: what remains is
// league-wide waiver momentum the manager can actually act on. K/DST and
// players with no pool projection are excluded (same discipline as the
// FAAB guidance targets — waiver guidance only makes sense for skill
// players TraderApe can price).

import type { League } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import type { TrendingAdd } from '@/api/sleeperTrending';

const TRENDING_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

export interface TrendingTarget {
  player: PoolPlayer;
  /** League-wide adds in the lookback window (from Sleeper). */
  adds: number;
}

export function trendingTargets(
  league: League,
  pool: DraftPoolFile = POOL,
  trending: TrendingAdd[],
  limit = 10,
): TrendingTarget[] {
  const index = indexPool(pool);
  const rostered = new Set<string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      const resolved = resolvePoolPlayer(p, index);
      if (resolved) rostered.add(resolved.id);
    }
  }
  const bySleeperId = new Map<string, PoolPlayer>();
  for (const p of pool.players) {
    if (p.sleeperId) bySleeperId.set(p.sleeperId, p);
  }
  const targets: TrendingTarget[] = [];
  for (const entry of trending) {
    const player = bySleeperId.get(entry.playerId);
    if (!player) continue;
    if (rostered.has(player.id)) continue;
    if (!TRENDING_POSITIONS.has(player.pos.toUpperCase())) continue;
    if (typeof player.projPtsPpr !== 'number' || player.projPtsPpr <= 0)
      continue;
    if (targets.some(t => t.player.id === player.id)) continue;
    targets.push({ player, adds: entry.count });
    if (targets.length >= Math.max(0, limit)) break;
  }
  return targets;
}
