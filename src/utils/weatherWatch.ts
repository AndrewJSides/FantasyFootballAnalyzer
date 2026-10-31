// Weather Watch (backlog item 51): kickoff-hour game-weather flags for the
// current NFL week on the Start/Sit page — "is the game itself a problem?"
//
// Venues come from the bundled schedule (pair[0] = designated home) +
// game-times ISO, joined to stadium coordinates in data/nflStadiums.ts
// (with the 2026 international-game venue overrides). The forecast is
// Open-Meteo's free forecast API (no key), hourly at the venue for the
// kickoff hour. Dome / retractable-roof games are weather-neutral and
// skipped. Everything is TraderApe's own data + a free public API; the
// impact framing (wind 15+ mph / gusts 25+ mph hurts deep passing and
// field goals; rain favors the run) follows the standard public weather-
// report convention, no copied content.

import scheduleJson from '@/data/nflSchedule.2026.json';
import gameTimesJson from '@/data/nflGameTimes.2026.json';
import {
  NFL_STADIUMS,
  INTERNATIONAL_VENUES_2026,
  type Stadium,
} from '@/data/nflStadiums';

const SCHEDULE_WEEKS = (scheduleJson as unknown as { weeks: Record<string, Array<[string, string]>> }).weeks;
const GAME_TIME_WEEKS = (gameTimesJson as unknown as { weeks: Record<string, Record<string, string>> }).weeks;

// Flag thresholds — the standard weather-report cutoffs: sustained wind
// of 15+ mph (or gusts 25+) is the documented fantasy-weather signal,
// 40%+ precipitation is a real rain game, 32°F or below is freezing.
export const WIND_SUSTAINED_MPH = 15;
export const WIND_GUST_MPH = 25;
export const PRECIP_PROB_PCT = 40;
export const FREEZING_F = 32;

export interface GameVenue {
  home: string;
  away: string;
  /** ISO-8601 UTC kickoff. */
  kickoffIso: string;
  venue: Stadium;
  /** True when the venue came from the international-games override. */
  neutralSite: boolean;
}

export interface WeatherAtKickoff {
  tempF: number;
  /** Precipitation probability, 0-100. */
  precipProb: number;
  windMph: number;
  gustsMph: number;
  /** ISO hour the reading came from (UTC). */
  observedAt: string;
}

export interface WeatherFlags {
  windy: boolean;
  wet: boolean;
  freezing: boolean;
}

export interface StarterRef {
  name: string;
  nflTeam: string;
}

export interface WeatherAlert {
  home: string;
  away: string;
  venueName: string;
  city: string;
  kickoffIso: string;
  tempF: number;
  precipProb: number;
  windMph: number;
  gustsMph: number;
  flags: WeatherFlags;
  /** Plain-language fantasy impact notes. */
  notes: string[];
  /** Optimized starters playing in this game. */
  affectedStarters: string[];
}

export interface WeatherWatchSummary {
  alerts: WeatherAlert[];
  /** Upcoming outdoor games that got a forecast. */
  gamesChecked: number;
  /** Upcoming dome/retractable-roof games skipped as weather-neutral. */
  domesSkipped: number;
  /** Upcoming outdoor games with no forecast inside the 7-day window. */
  unavailable: number;
}

export function venueKey(v: Pick<GameVenue, 'home' | 'away'>): string {
  return `${v.home}:${v.away}`;
}

const ET = 'America/New_York';
const FALLBACK_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** Defensive label for a kickoff ISO when the game-times lookup misses
 *  ("Sun 1:05 PM ET"). The component prefers gameKickoff()'s label. */
export function gameKickoffLabelFallback(kickoffIso: string): string {
  const d = new Date(kickoffIso);
  if (!Number.isFinite(d.getTime())) return kickoffIso;
  return `${FALLBACK_FMT.format(d)} ET`;
}

/** One venue row per scheduled game in the week. Games missing a kickoff
 *  time or a stadium are dropped (defensive: a new team abbrev shouldn't
 *  sink the section). */
export function buildGameVenues(week: number): GameVenue[] {
  const pairs = SCHEDULE_WEEKS[String(week)] ?? [];
  const times = GAME_TIME_WEEKS[String(week)] ?? {};
  const intl = INTERNATIONAL_VENUES_2026[week] ?? [];
  const venues: GameVenue[] = [];
  for (const [home, away] of pairs) {
    const kickoffIso = times[home] ?? times[away];
    if (!kickoffIso) continue;
    const override = intl.find(v => v.home === home && v.away === away);
    const venue = override?.venue ?? NFL_STADIUMS[home];
    if (!venue) continue;
    venues.push({ home, away, kickoffIso, venue, neutralSite: !!override });
  }
  return venues;
}

/** Pick the Open-Meteo hourly row nearest to kickoff; null when the
 *  forecast doesn't reach the game (Open-Meteo publishes ~7 days out) or
 *  the payload is malformed. Pure — takes the decoded payload row. */
export function nearestHourAt(
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; wind_speed_10m: number[]; wind_gusts_10m: number[] } | null | undefined,
  kickoffIso: string,
): WeatherAtKickoff | null {
  if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) return null;
  const kickoff = new Date(kickoffIso).getTime();
  if (!Number.isFinite(kickoff)) return null;
  let best = -1;
  let bestDelta = Infinity;
  for (let i = 0; i < hourly.time.length; i++) {
    const t = new Date(`${hourly.time[i]}Z`).getTime();
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - kickoff);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  // The nearest forecast hour must actually be near kickoff — otherwise
  // the model run doesn't cover the game and we'd label it with a
  // far-away hour.
  if (best < 0 || bestDelta > 90 * 60 * 1000) return null;
  const pick = (arr: number[] | undefined, i: number): number | null =>
    Array.isArray(arr) && typeof arr[i] === 'number' ? arr[i] : null;
  const tempF = pick(hourly.temperature_2m, best);
  const precipProb = pick(hourly.precipitation_probability, best);
  const windMph = pick(hourly.wind_speed_10m, best);
  const gustsMph = pick(hourly.wind_gusts_10m, best);
  if (tempF === null || precipProb === null || windMph === null || gustsMph === null) return null;
  return { tempF, precipProb, windMph, gustsMph, observedAt: `${hourly.time[best]}Z` };
}

/** Kickoff-hour weather for every venue that hasn't kicked off yet, keyed
 *  by venueKey(). Throws on transport / HTTP errors so the caller can
 *  hide the section. One Open-Meteo request covers all venues. */
export async function fetchKickoffWeather(
  venues: GameVenue[],
  now: Date = new Date(),
): Promise<Map<string, WeatherAtKickoff>> {
  const upcoming = venues.filter(v => new Date(v.kickoffIso).getTime() > now.getTime());
  const out = new Map<string, WeatherAtKickoff>();
  if (upcoming.length === 0) return out;
  const params = new URLSearchParams({
    latitude: upcoming.map(v => String(v.venue.lat)).join(','),
    longitude: upcoming.map(v => String(v.venue.lon)).join(','),
    hourly: 'temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'UTC',
    forecast_days: '7',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`weather request failed (HTTP ${res.status})`);
  const body = await res.json();
  const list = Array.isArray(body) ? body : [body];
  upcoming.forEach((v, i) => {
    const w = nearestHourAt(list[i]?.hourly, v.kickoffIso);
    if (w) out.set(venueKey(v), w);
  });
  return out;
}

export function weatherFlags(w: WeatherAtKickoff): WeatherFlags {
  return {
    windy: w.windMph >= WIND_SUSTAINED_MPH || w.gustsMph >= WIND_GUST_MPH,
    wet: w.precipProb >= PRECIP_PROB_PCT,
    freezing: w.tempF <= FREEZING_F,
  };
}

export function impactNotes(flags: WeatherFlags): string[] {
  const notes: string[] = [];
  if (flags.windy)
    notes.push('Wind hurts deep passing and field goals — downgrade kickers and deep-threat receivers a notch.');
  if (flags.wet)
    notes.push('Wet ball favors the run — lean toward running backs, fade passing volume.');
  if (flags.freezing)
    notes.push('Freezing temps — a small passing-game drag, mostly a comfort note.');
  return notes;
}

const hasFlag = (f: WeatherFlags): boolean => f.windy || f.wet || f.freezing;

/** Join venues + fetched weather + the page's optimized starters into
 *  per-game alerts. Pure — all IO happens in fetchKickoffWeather. */
export function summarizeWeatherWatch(
  venues: GameVenue[],
  weather: Map<string, WeatherAtKickoff>,
  starters: StarterRef[],
  now: Date = new Date(),
): WeatherWatchSummary {
  const alerts: WeatherAlert[] = [];
  let gamesChecked = 0;
  let domesSkipped = 0;
  let unavailable = 0;
  for (const v of venues) {
    if (new Date(v.kickoffIso).getTime() <= now.getTime()) continue;
    if (v.venue.roof !== 'open') {
      domesSkipped++;
      continue;
    }
    const w = weather.get(venueKey(v));
    if (!w) {
      unavailable++;
      continue;
    }
    gamesChecked++;
    const flags = weatherFlags(w);
    if (!hasFlag(flags)) continue;
    const affectedStarters = starters
      .filter(s => s.nflTeam === v.home || s.nflTeam === v.away)
      .map(s => s.name);
    alerts.push({
      home: v.home,
      away: v.away,
      venueName: v.venue.name,
      city: v.venue.city,
      kickoffIso: v.kickoffIso,
      tempF: Math.round(w.tempF),
      precipProb: Math.round(w.precipProb),
      windMph: Math.round(w.windMph),
      gustsMph: Math.round(w.gustsMph),
      flags,
      notes: impactNotes(flags),
      affectedStarters,
    });
  }
  // Worst conditions first: wind, then rain, then cold.
  const severity = (a: WeatherAlert): number =>
    (a.flags.windy ? 4 : 0) + (a.flags.wet ? 2 : 0) + (a.flags.freezing ? 1 : 0);
  alerts.sort((a, b) => severity(b) - severity(a) || a.kickoffIso.localeCompare(b.kickoffIso));
  return { alerts, gamesChecked, domesSkipped, unavailable };
}
