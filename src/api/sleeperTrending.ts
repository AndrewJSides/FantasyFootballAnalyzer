// Trending players from Sleeper's free public endpoint (no auth) — the
// add/drop activity across Sleeper leagues in the trailing lookback window.
// The waiver wire's "Trending Adds" section joins these ids against the
// bundled pool (no 5MB players map download) and filters out players already
// rostered in the loaded league, so what's left is league-wide momentum the
// manager can actually act on.

import { logger } from '@/utils/logger';

const TRENDING_URL = 'https://api.sleeper.app/v1/players/nfl/trending/add';
const FETCH_TIMEOUT_MS = 10_000;

export interface TrendingAdd {
  /** Sleeper player id. */
  playerId: string;
  /** Number of adds across Sleeper leagues in the lookback window. */
  count: number;
}

interface TrendingRow {
  player_id?: unknown;
  count?: unknown;
}

function isTrendingRow(row: unknown): row is { player_id: string; count: number } {
  if (typeof row !== 'object' || row === null) return false;
  const r = row as TrendingRow;
  return typeof r.player_id === 'string' && typeof r.count === 'number';
}

/** Fetch the top trending adds. Throws on HTTP or network failure so the
 *  caller can show an explicit error state rather than a silent empty list. */
export async function fetchTrendingAdds(
  lookbackHours = 24,
  limit = 25,
): Promise<TrendingAdd[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${TRENDING_URL}?lookback_hours=${lookbackHours}&limit=${limit}`,
      { signal: controller.signal },
    );
    if (!res.ok) throw new Error(`Sleeper trending: HTTP ${res.status}`);
    const data: unknown = await res.json();
    if (!Array.isArray(data))
      throw new Error('Sleeper trending: unexpected response shape');
    return data
      .filter(isTrendingRow)
      .map(row => ({ playerId: row.player_id, count: row.count }));
  } catch (e) {
    logger.warn('[trending] fetch failed:', e);
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    clearTimeout(timeout);
  }
}
