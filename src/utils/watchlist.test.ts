import { describe, expect, it } from 'vitest';
import {
  WATCHLIST_KEY,
  WATCHLIST_MAX,
  loadWatchlist,
  saveWatchlist,
  toggleWatchlistId,
  type WatchlistStorage,
} from './watchlist';

function memStorage(initial?: Record<string, string>): WatchlistStorage {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: k => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: k => {
      map.delete(k);
    },
  };
}

const valid = new Set(['p1', 'p2', 'p3']);
const isValidId = (id: string) => valid.has(id);

describe('loadWatchlist', () => {
  it('returns [] when nothing is stored', () => {
    expect(loadWatchlist(isValidId, memStorage())).toEqual([]);
  });

  it('returns [] for corrupt or non-array values without throwing', () => {
    expect(loadWatchlist(isValidId, memStorage({ [WATCHLIST_KEY]: 'not json' }))).toEqual([]);
    expect(loadWatchlist(isValidId, memStorage({ [WATCHLIST_KEY]: '{"a":1}' }))).toEqual([]);
  });

  it('dedupes, drops unknown ids, and preserves add order', () => {
    const store = memStorage({
      [WATCHLIST_KEY]: JSON.stringify(['p2', 'p1', 'p2', 'ghost', 'p3']),
    });
    expect(loadWatchlist(isValidId, store)).toEqual(['p2', 'p1', 'p3']);
  });

  it('caps at WATCHLIST_MAX', () => {
    const ids = Array.from({ length: WATCHLIST_MAX + 5 }, (_, i) => `p${i}`);
    const store = memStorage({ [WATCHLIST_KEY]: JSON.stringify(ids) });
    const loaded = loadWatchlist(() => true, store);
    expect(loaded).toHaveLength(WATCHLIST_MAX);
    expect(loaded[0]).toBe('p0');
  });
});

describe('saveWatchlist', () => {
  it('round-trips through loadWatchlist', () => {
    const store = memStorage();
    saveWatchlist(['p1', 'p3'], store);
    expect(loadWatchlist(isValidId, store)).toEqual(['p1', 'p3']);
  });

  it('does not throw when storage is unavailable', () => {
    expect(() => saveWatchlist(['p1'], undefined)).not.toThrow();
  });
});

describe('toggleWatchlistId', () => {
  it('adds a missing id at the end', () => {
    expect(toggleWatchlistId(['p1'], 'p2')).toEqual(['p1', 'p2']);
  });

  it('removes a present id, keeping order', () => {
    expect(toggleWatchlistId(['p1', 'p2', 'p3'], 'p2')).toEqual(['p1', 'p3']);
  });

  it('refuses to grow past the cap', () => {
    const full = Array.from({ length: WATCHLIST_MAX }, (_, i) => `p${i}`);
    expect(toggleWatchlistId(full, 'new')).toBe(full);
  });
});
