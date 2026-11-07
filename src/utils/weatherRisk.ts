// Item-138 weather risk: per-team passing-game downgrade flags for the
// Weekly Rankings board, Start/Sit, the Matchup game plan, and Compare.
//
// Reuses the Weather Watch feed (item 51): bundled schedule venues +
// Open-Meteo kickoff-hour forecasts, same flag thresholds (wind 15+ mph
// sustained or 25+ mph gusts, 40%+ precipitation probability). Dome and
// retractable-roof games are weather-neutral and never flagged. Freezing
// alone is NOT a passing-game downgrade — the item-138 miss class is
// heavy rain/thunderstorms and high wind — so a freezing-only game
// produces no tag. Open-Meteo's fetched fields carry no thunderstorm
// code, so the 40%+ precipitation flag is the heavy-rain proxy.
//
// Only QB/WR/TE rows get the tag: wet weather favors the run game, so
// RBs are not downgraded by the same signal.
//
// The term is PRICED, not display-only: the week-8 backtest
// (scripts/backtestWeather.ts) measured -25% folding (affected MAE
// 5.57 -> 5.25, overall 5.64 -> 5.60 over 26 flagged-game cases), so
// weatherAdjustmentFor is the single priced definition every surface
// folds through — the board, the scoring core, and Compare. A failed
// forecast fetch leaves every surface on the unfolded projection.

import {
  venueKey,
  weatherFlags,
  type GameVenue,
  type WeatherAtKickoff,
} from '@/utils/weatherWatch';

/** Passing-game positions: the ones a weather downgrade applies to. */
export const WEATHER_RISK_POSITIONS = new Set(['QB', 'WR', 'TE']);

/**
 * The measured weather term (item 138, backtested Nov 6, 2026 on the
 * week-8 grade): passing-game projections in a flagged outdoor game are
 * cut by this share. Both-flags rule — the map only ever carries games
 * flagged windy or wet under the live thresholds, so the helper never
 * re-checks the flag, only the position.
 */
export const WEATHER_DOWNGRADE_PCT = 0.25;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * The (negative) points adjustment for one player's week projection, or
 * null when the term does not apply (no flagged game for his team, or a
 * position the weather never downgrades). One decimal, like every other
 * priced adjustment in the app.
 */
export function weatherAdjustmentFor(
  projection: number,
  risk: WeatherRisk | null | undefined,
  position: string,
): number | null {
  if (risk == null || !WEATHER_RISK_POSITIONS.has(position)) return null;
  return -round1(projection * WEATHER_DOWNGRADE_PCT);
}

export interface WeatherRisk {
  windy: boolean;
  wet: boolean;
  windMph: number;
  gustsMph: number;
  precipProb: number;
  tempF: number;
}

/**
 * Join venues + fetched kickoff weather into a per-NFL-team risk map.
 * Pure — all IO happens in fetchKickoffWeather. Only outdoor games with
 * a windy or wet flag land in the map; both teams of a flagged game map
 * to the same risk.
 */
export function weatherRiskByTeam(
  venues: GameVenue[],
  weather: Map<string, WeatherAtKickoff>,
): Map<string, WeatherRisk> {
  const out = new Map<string, WeatherRisk>();
  for (const v of venues) {
    if (v.venue.roof !== 'open') continue;
    const w = weather.get(venueKey(v));
    if (!w) continue;
    const flags = weatherFlags(w);
    if (!flags.windy && !flags.wet) continue;
    const risk: WeatherRisk = {
      windy: flags.windy,
      wet: flags.wet,
      windMph: Math.round(w.windMph),
      gustsMph: Math.round(w.gustsMph),
      precipProb: Math.round(w.precipProb),
      tempF: Math.round(w.tempF),
    };
    out.set(v.home, risk);
    out.set(v.away, risk);
  }
  return out;
}

/** Plain-language tag label for a row, e.g. "Weather: wind 18 mph, 88% rain". */
export function weatherRiskLabel(risk: WeatherRisk): string {
  const parts: string[] = [];
  if (risk.windy) parts.push(`wind ${risk.windMph} mph (gusts ${risk.gustsMph})`);
  if (risk.wet) parts.push(`${risk.precipProb}% rain`);
  return `Weather risk: ${parts.join(', ')} — downgrade the passing game a notch, lean run`;
}
