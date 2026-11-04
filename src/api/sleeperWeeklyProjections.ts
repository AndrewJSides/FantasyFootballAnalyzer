// Sleeper's free weekly projections (no auth) — the same endpoint the
// projection snapshot script reads, fetched at runtime so the Weekly
// Rankings disagreement board always prices the current week. Returns
// each player's projected full-PPR points for the week; players with no
// pts_ppr line (IDP-only entries and the like) are dropped. Throws on
// HTTP or network failure so the caller can show an explicit error state
// rather than silent zeros.

import { logger } from '@/utils/logger';

const FETCH_TIMEOUT_MS = 10_000;

interface SleeperProjectionRow {
  player_id?: unknown;
  stats?: { pts_ppr?: unknown };
}

function isProjectionRow(row: unknown): row is {
  player_id: string;
  stats: { pts_ppr: number };
} {
  if (typeof row !== 'object' || row === null) return false;
  const r = row as SleeperProjectionRow;
  return (
    typeof r.player_id === 'string' &&
    typeof r.stats === 'object' &&
    r.stats !== null &&
    typeof r.stats.pts_ppr === 'number' &&
    Number.isFinite(r.stats.pts_ppr)
  );
}

/** Sleeper player id -> projected full-PPR points for the week. */
export async function fetchSleeperWeekProjections(
  season: number,
  week: number,
): Promise<Record<string, number>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular`,
      { signal: controller.signal },
    );
    if (!res.ok) throw new Error(`Sleeper projections: HTTP ${res.status}`);
    const data: unknown = await res.json();
    if (!Array.isArray(data))
      throw new Error('Sleeper projections: unexpected response shape');
    const out: Record<string, number> = {};
    for (const row of data.filter(isProjectionRow)) {
      out[row.player_id] = row.stats.pts_ppr;
    }
    return out;
  } catch (e) {
    logger.warn('[sleeper-projections] fetch failed:', e);
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    clearTimeout(timeout);
  }
}
