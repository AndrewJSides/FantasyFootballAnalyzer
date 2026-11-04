// Item-138 weather risk: per-team passing-game downgrade flags for the
// Weekly Rankings board — the display-only half of the outdoor-game
// weather adjustment (the ranked projection does NOT fold it in, same
// discipline as the item-137 sole-back tag: a priced term stays out
// until a backtest says it wins).
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

import {
  venueKey,
  weatherFlags,
  type GameVenue,
  type WeatherAtKickoff,
} from '@/utils/weatherWatch';

/** Passing-game positions: the ones a weather downgrade applies to. */
export const WEATHER_RISK_POSITIONS = new Set(['QB', 'WR', 'TE']);

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
