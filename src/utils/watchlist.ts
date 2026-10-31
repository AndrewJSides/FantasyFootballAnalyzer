// Player Watchlist storage (backlog item 52).
//
// The watchlist is the manager's personal "my guys" list: players he wants
// to keep an eye on across weeks — trade targets, stash candidates, his
// own boom/bust starters. It persists in localStorage (not sessionStorage)
// because a watchlist is meant to survive the week, unlike a compare
// picker's throwaway selection. Every function takes an optional storage
// so tests can pass a shim instead of touching window.localStorage.
export const WATCHLIST_KEY = 'traderape-watchlist';
/** Cap the list so a runaway script can't grow the stored value forever. */
export const WATCHLIST_MAX = 50;

export interface WatchlistStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storageOrDefault(storage?: WatchlistStorage): WatchlistStorage | null {
  if (storage) return storage;
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* private mode / SSR: no storage available */
  }
  return null;
}

/**
 * Load the stored watchlist: pool-player ids in add order, deduplicated,
 * dropped when they no longer name a real pool player, capped at
 * WATCHLIST_MAX. Never throws — a corrupt value reads as an empty list.
 */
export function loadWatchlist(
  isValidId: (id: string) => boolean,
  storage?: WatchlistStorage,
): string[] {
  const store = storageOrDefault(storage);
  if (!store) return [];
  let raw: string | null = null;
  try {
    raw = store.getItem(WATCHLIST_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'string' || seen.has(entry)) continue;
    seen.add(entry);
    if (isValidId(entry)) ids.push(entry);
    if (ids.length >= WATCHLIST_MAX) break;
  }
  return ids;
}

/** Persist the list. No-op when no storage is available. */
export function saveWatchlist(ids: string[], storage?: WatchlistStorage): void {
  const store = storageOrDefault(storage);
  if (!store) return;
  try {
    store.setItem(WATCHLIST_KEY, JSON.stringify(ids.slice(0, WATCHLIST_MAX)));
  } catch {
    /* quota / private mode: in-memory state still works for the session */
  }
}

/**
 * Toggle one id in the list. Returns the new list (add order preserved,
 * removals keep the remaining order). Adding a duplicate or an id past
 * the cap leaves the list unchanged.
 */
export function toggleWatchlistId(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter(existing => existing !== id);
  if (ids.length >= WATCHLIST_MAX) return ids;
  return [...ids, id];
}
