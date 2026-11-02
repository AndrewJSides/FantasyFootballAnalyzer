// Live NFL scores from ESPN's free public scoreboard API (no auth).
// Powers the /scores page — Yahoo, ESPN and Sleeper all ship live game
// scores on game day; TraderApe had nothing live. Same fetch contract as
// espnNews.ts: 10s timeout, throws on HTTP/network failure so the page can
// show an explicit error state rather than a silent empty list.
//
// Data source (free, no auth):
//   ESPN scoreboard: https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=<season>&seasontype=2&week=<1..18>

import { logger } from '@/utils/logger';

const SCOREBOARD_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const FETCH_TIMEOUT_MS = 10_000;

// ESPN and Sleeper spell two teams differently than the app's FantasyPros-
// style canonical form (JAC, WAS) — normalize at the boundary (same map as
// scripts/buildGameTimes.ts).
const CANON: Record<string, string> = { JAX: 'JAC', WSH: 'WAS' };
export function canonTeamAbbr(abbr: string | null | undefined): string {
  const upper = (abbr ?? '').toUpperCase().trim();
  return CANON[upper] ?? upper;
}

export type ScoreboardGameState = 'pre' | 'in' | 'post';

export interface ScoreboardGame {
  /** ESPN event id, stable for keying the list. */
  id: string;
  awayAbbr: string;
  homeAbbr: string;
  /** Short display names, e.g. "Eagles" / "Commanders". */
  awayName: string;
  homeName: string;
  /** null before kickoff (ESPN reports no score yet). */
  awayScore: number | null;
  homeScore: number | null;
  state: ScoreboardGameState;
  /** ESPN's short status line: "Sun 1:05 PM ET", "2:40 - 2nd", "Final/OT". */
  statusLine: string;
  /** Kickoff ISO date (ESPN's `date`) — used to sort pre-game matchups. */
  date: string;
}

interface EspnCompetitor {
  homeAway?: unknown;
  team?: { abbreviation?: unknown; shortDisplayName?: unknown };
  score?: unknown;
}

interface EspnEvent {
  id?: unknown;
  date?: unknown;
  status?: {
    type?: { state?: unknown; shortDetail?: unknown };
  };
  competitions?: Array<{ competitors?: unknown }>;
}

function parseScore(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Parse one ESPN event; returns undefined for malformed events so one bad
 *  row never sinks the whole board. */
function parseEvent(event: unknown): ScoreboardGame | undefined {
  if (typeof event !== 'object' || event === null) return undefined;
  const e = event as EspnEvent;
  const competition = e.competitions?.[0];
  const competitors = Array.isArray(competition?.competitors)
    ? (competition?.competitors as EspnCompetitor[])
    : [];
  const away = competitors.find(c => c.homeAway === 'away');
  const home = competitors.find(c => c.homeAway === 'home');
  const awayAbbr = away?.team?.abbreviation;
  const homeAbbr = home?.team?.abbreviation;
  if (typeof awayAbbr !== 'string' || typeof homeAbbr !== 'string') {
    return undefined;
  }
  const rawState = e.status?.type?.state;
  const state: ScoreboardGameState =
    rawState === 'in' ? 'in' : rawState === 'post' ? 'post' : 'pre';
  return {
    id: String(e.id ?? `${awayAbbr}-${homeAbbr}-${e.date ?? ''}`),
    awayAbbr: canonTeamAbbr(awayAbbr),
    homeAbbr: canonTeamAbbr(homeAbbr),
    awayName:
      typeof away?.team?.shortDisplayName === 'string'
        ? away.team.shortDisplayName
        : awayAbbr,
    homeName:
      typeof home?.team?.shortDisplayName === 'string'
        ? home.team.shortDisplayName
        : homeAbbr,
    awayScore: parseScore(away?.score),
    homeScore: parseScore(home?.score),
    state,
    statusLine:
      typeof e.status?.type?.shortDetail === 'string'
        ? e.status.type.shortDetail
        : '',
    date: typeof e.date === 'string' ? e.date : '',
  };
}

/** Fetch one week's NFL scoreboard. Throws on HTTP or network failure so the
 *  caller can show an explicit error state rather than a silent empty list. */
export async function fetchNflScoreboard(
  season: number,
  week: number,
): Promise<ScoreboardGame[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${SCOREBOARD_BASE}?dates=${season}&seasontype=2&week=${week}`,
      { signal: controller.signal },
    );
    if (!res.ok) throw new Error(`ESPN scoreboard: HTTP ${res.status}`);
    const data: unknown = await res.json();
    if (
      typeof data !== 'object' ||
      data === null ||
      !Array.isArray((data as { events?: unknown }).events)
    ) {
      throw new Error('ESPN scoreboard: unexpected response shape');
    }
    const events = (data as { events: unknown[] }).events;
    return events
      .map(parseEvent)
      .filter((g): g is ScoreboardGame => g !== undefined);
  } catch (e) {
    logger.warn('[espn-scoreboard] fetch failed:', e);
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    clearTimeout(timeout);
  }
}
