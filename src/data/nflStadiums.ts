// NFL stadium coordinates + roof types, backing the Weather Watch
// (backlog item 51): kickoff-hour weather is fetched at the venue, and
// dome / retractable-roof games are marked weather-neutral. Venues are the
// home team's stadium except for the 2026 international games (listed in
// INTERNATIONAL_VENUES_2026), which carry their own venue + coordinates.
//
// Coordinates are stadium-approximate; Open-Meteo's model grid is ~11km,
// so metro-level precision is all the forecast needs.

export type RoofType = 'dome' | 'retractable' | 'open';

export interface Stadium {
  /** e.g. "Lambeau Field". */
  name: string;
  /** e.g. "Green Bay, WI". */
  city: string;
  lat: number;
  lon: number;
  roof: RoofType;
}

// Keyed by canonical team abbreviation. Retractable roofs are treated as
// weather-neutral (closed roof assumed in bad weather); SoFi's fixed
// canopy is treated the same way.
export const NFL_STADIUMS: Record<string, Stadium> = {
  ARI: { name: 'State Farm Stadium', city: 'Glendale, AZ', lat: 33.5277, lon: -112.2626, roof: 'retractable' },
  ATL: { name: 'Mercedes-Benz Stadium', city: 'Atlanta, GA', lat: 33.7554, lon: -84.4008, roof: 'retractable' },
  BAL: { name: 'M&T Bank Stadium', city: 'Baltimore, MD', lat: 39.278, lon: -71.6227, roof: 'open' },
  BUF: { name: 'Highmark Stadium', city: 'Orchard Park, NY', lat: 42.7738, lon: -78.7868, roof: 'open' },
  CAR: { name: 'Bank of America Stadium', city: 'Charlotte, NC', lat: 35.2258, lon: -80.8529, roof: 'open' },
  CHI: { name: 'Soldier Field', city: 'Chicago, IL', lat: 41.8623, lon: -87.6167, roof: 'open' },
  CIN: { name: 'Paycor Stadium', city: 'Cincinnati, OH', lat: 39.0955, lon: -84.5161, roof: 'open' },
  CLE: { name: 'Huntington Bank Field', city: 'Cleveland, OH', lat: 41.5061, lon: -81.6995, roof: 'open' },
  DAL: { name: 'AT&T Stadium', city: 'Arlington, TX', lat: 32.7473, lon: -97.0945, roof: 'retractable' },
  DEN: { name: 'Empower Field at Mile High', city: 'Denver, CO', lat: 39.7439, lon: -105.0201, roof: 'open' },
  DET: { name: 'Ford Field', city: 'Detroit, MI', lat: 42.34, lon: -83.0456, roof: 'dome' },
  GB: { name: 'Lambeau Field', city: 'Green Bay, WI', lat: 44.5013, lon: -88.0622, roof: 'open' },
  HOU: { name: 'NRG Stadium', city: 'Houston, TX', lat: 29.6847, lon: -95.4107, roof: 'retractable' },
  IND: { name: 'Lucas Oil Stadium', city: 'Indianapolis, IN', lat: 39.7601, lon: -86.1639, roof: 'retractable' },
  JAC: { name: 'EverBank Stadium', city: 'Jacksonville, FL', lat: 30.3239, lon: -81.6373, roof: 'open' },
  KC: { name: 'GEHA Field at Arrowhead Stadium', city: 'Kansas City, MO', lat: 39.0489, lon: -94.4839, roof: 'open' },
  LAC: { name: 'SoFi Stadium', city: 'Inglewood, CA', lat: 33.9535, lon: -118.3392, roof: 'dome' },
  LAR: { name: 'SoFi Stadium', city: 'Inglewood, CA', lat: 33.9535, lon: -118.3392, roof: 'dome' },
  LV: { name: 'Allegiant Stadium', city: 'Las Vegas, NV', lat: 36.0908, lon: -115.1839, roof: 'dome' },
  MIA: { name: 'Hard Rock Stadium', city: 'Miami Gardens, FL', lat: 25.958, lon: -80.2389, roof: 'open' },
  MIN: { name: 'U.S. Bank Stadium', city: 'Minneapolis, MN', lat: 44.9743, lon: -93.2581, roof: 'dome' },
  NE: { name: 'Gillette Stadium', city: 'Foxborough, MA', lat: 42.0909, lon: -71.2643, roof: 'open' },
  NO: { name: 'Caesars Superdome', city: 'New Orleans, LA', lat: 29.9511, lon: -90.0812, roof: 'dome' },
  NYG: { name: 'MetLife Stadium', city: 'East Rutherford, NJ', lat: 40.8135, lon: -74.0745, roof: 'open' },
  NYJ: { name: 'MetLife Stadium', city: 'East Rutherford, NJ', lat: 40.8135, lon: -74.0745, roof: 'open' },
  PHI: { name: 'Lincoln Financial Field', city: 'Philadelphia, PA', lat: 39.9008, lon: -75.1675, roof: 'open' },
  PIT: { name: 'Acrisure Stadium', city: 'Pittsburgh, PA', lat: 40.4468, lon: -80.0158, roof: 'open' },
  SF: { name: "Levi's Stadium", city: 'Santa Clara, CA', lat: 37.403, lon: -121.97, roof: 'open' },
  SEA: { name: 'Lumen Field', city: 'Seattle, WA', lat: 47.5952, lon: -122.3316, roof: 'open' },
  TB: { name: 'Raymond James Stadium', city: 'Tampa, FL', lat: 27.9759, lon: -82.5033, roof: 'open' },
  TEN: { name: 'Nissan Stadium', city: 'Nashville, TN', lat: 36.1665, lon: -86.7713, roof: 'open' },
  WAS: { name: 'Northwest Stadium', city: 'Landover, MD', lat: 38.9076, lon: -76.8649, roof: 'open' },
};

export interface InternationalVenue {
  /** The schedule's designated home team (pair[0] in nflSchedule.2026.json). */
  home: string;
  /** The away team (pair[1]). */
  away: string;
  venue: Stadium;
}

// The 2026 NFL International Series: nine games whose venue is NOT the
// home team's stadium. Keyed by week; matched against the schedule pair
// so the venue override wins over the home-stadium default.
export const INTERNATIONAL_VENUES_2026: Record<number, InternationalVenue[]> = {
  1: [
    {
      home: 'LAR',
      away: 'SF',
      venue: { name: 'Melbourne Cricket Ground', city: 'Melbourne, Australia', lat: -37.8199, lon: 144.9834, roof: 'open' },
    },
  ],
  3: [
    {
      home: 'DAL',
      away: 'BAL',
      venue: { name: 'Maracanã Stadium', city: 'Rio de Janeiro, Brazil', lat: -22.9122, lon: -43.2302, roof: 'open' },
    },
  ],
  4: [
    {
      home: 'WAS',
      away: 'IND',
      venue: { name: 'Tottenham Hotspur Stadium', city: 'London, England', lat: 51.6043, lon: -0.0664, roof: 'open' },
    },
  ],
  5: [
    {
      home: 'JAC',
      away: 'PHI',
      venue: { name: 'Tottenham Hotspur Stadium', city: 'London, England', lat: 51.6043, lon: -0.0664, roof: 'open' },
    },
  ],
  6: [
    {
      home: 'JAC',
      away: 'HOU',
      venue: { name: 'Wembley Stadium', city: 'London, England', lat: 51.556, lon: -0.2795, roof: 'open' },
    },
  ],
  7: [
    {
      home: 'NO',
      away: 'PIT',
      venue: { name: 'Stade de France', city: 'Paris, France', lat: 48.9244, lon: 2.3602, roof: 'open' },
    },
  ],
  9: [
    {
      home: 'ATL',
      away: 'CIN',
      venue: { name: 'Santiago Bernabéu Stadium', city: 'Madrid, Spain', lat: 40.4531, lon: -3.6883, roof: 'retractable' },
    },
  ],
  10: [
    {
      home: 'DET',
      away: 'NE',
      venue: { name: 'Allianz Arena', city: 'Munich, Germany', lat: 48.2188, lon: 11.6247, roof: 'open' },
    },
  ],
  11: [
    {
      home: 'SF',
      away: 'MIN',
      venue: { name: 'Estadio Banorte', city: 'Mexico City, Mexico', lat: 19.3029, lon: -99.1505, roof: 'open' },
    },
  ],
};
