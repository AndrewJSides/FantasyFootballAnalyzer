// Join ESPN news athlete names to TraderApe's bundled player pool so the
// News page can deep-link tagged players into Player Journey.
// ESPN's athlete categories carry exact full names ("Josh Jacobs"); the pool
// is keyed by normalized name via matchKey(name) (playerNames.ts strips
// suffixes, punctuation, and case). Names that match zero pool players are
// left as plain text; names that match two or more pool players are dropped
// rather than guessed, so a link never points at the wrong player.

import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { matchKey } from './playerNames';

// One index entry per normalized name: a single player, or null when the
// name is ambiguous (two pool players normalize the same).
export function indexPoolNames(
  pool: DraftPoolFile,
): Map<string, PoolPlayer | null> {
  const index = new Map<string, PoolPlayer | null>();
  for (const p of pool.players) {
    const key = matchKey(p.name);
    const existing = index.get(key);
    if (existing === undefined) {
      index.set(key, p);
    } else if (existing !== null && existing !== p) {
      index.set(key, null);
    }
  }
  return index;
}

/** Map each athlete name to its pool player. Unmatched and ambiguous names
 *  are omitted; the page renders those as plain text. */
export function matchNewsAthletes(
  names: string[],
  pool: DraftPoolFile,
): Map<string, PoolPlayer> {
  const index = indexPoolNames(pool);
  const matched = new Map<string, PoolPlayer>();
  for (const name of names) {
    if (matched.has(name)) continue;
    const player = index.get(matchKey(name));
    if (player) matched.set(name, player);
  }
  return matched;
}
