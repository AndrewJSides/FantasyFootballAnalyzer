import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildGameVenues,
  fetchKickoffWeather,
  impactNotes,
  summarizeWeatherWatch,
  venueKey,
  nearestHourAt,
  weatherFlags,
  type GameVenue,
} from './weatherWatch';

const NOW = new Date('2026-10-31T12:00:00Z');

function venue(over: Partial<GameVenue> = {}): GameVenue {
  return {
    home: 'GB',
    away: 'CAR',
    kickoffIso: '2026-11-01T17:00:00Z',
    venue: { name: 'Lambeau Field', city: 'Green Bay, WI', lat: 44.5013, lon: -88.0622, roof: 'open' },
    neutralSite: false,
    ...over,
  };
}

describe('buildGameVenues', () => {
  it('uses the home stadium by default', () => {
    // Week 8: BAL @ BUF — Highmark Stadium, open air.
    const venues = buildGameVenues(8);
    const buf = venues.find(v => v.home === 'BUF');
    expect(buf).toBeDefined();
    expect(buf?.venue.name).toBe('Highmark Stadium');
    expect(buf?.venue.roof).toBe('open');
    expect(buf?.neutralSite).toBe(false);
    expect(typeof buf?.kickoffIso).toBe('string');
  });

  it('overrides the venue for 2026 international games', () => {
    // Week 9: CIN @ ATL in Madrid per the 2026 International Series.
    const venues = buildGameVenues(9);
    const atl = venues.find(v => v.home === 'ATL');
    expect(atl?.venue.name).toBe('Santiago Bernabéu Stadium');
    expect(atl?.neutralSite).toBe(true);
  });

  it('returns one venue per scheduled game', () => {
    expect(buildGameVenues(8).length).toBeGreaterThan(10);
    expect(buildGameVenues(999)).toEqual([]);
  });
});

describe('nearestHourAt', () => {
  const hourly = {
    time: ['2026-11-01T16:00', '2026-11-01T17:00', '2026-11-01T18:00'],
    temperature_2m: [50, 52, 53],
    precipitation_probability: [10, 20, 30],
    wind_speed_10m: [5, 18, 6],
    wind_gusts_10m: [8, 26, 9],
  };

  it('picks the hourly row nearest to kickoff', () => {
    const w = nearestHourAt(hourly, '2026-11-01T17:05:00Z');
    expect(w).toMatchObject({ tempF: 52, precipProb: 20, windMph: 18, gustsMph: 26 });
  });

  it('returns null when the forecast does not reach the game', () => {
    expect(nearestHourAt(hourly, '2026-11-08T17:00:00Z')).toBeNull();
    expect(nearestHourAt(null, '2026-11-01T17:00:00Z')).toBeNull();
  });

  it('returns null on malformed payloads', () => {
    expect(
      nearestHourAt({ ...hourly, wind_speed_10m: [5] }, '2026-11-01T17:05:00Z'),
    ).toBeNull();
  });
});

describe('weatherFlags + impactNotes', () => {
  it('flags sustained wind at 15 mph and gusts at 25 mph', () => {
    expect(weatherFlags({ tempF: 60, precipProb: 0, windMph: 15, gustsMph: 10, observedAt: '' }).windy).toBe(true);
    expect(weatherFlags({ tempF: 60, precipProb: 0, windMph: 14, gustsMph: 25, observedAt: '' }).windy).toBe(true);
    expect(weatherFlags({ tempF: 60, precipProb: 0, windMph: 14, gustsMph: 24, observedAt: '' }).windy).toBe(false);
  });

  it('flags 40%+ precipitation and 32F-or-below temps', () => {
    expect(weatherFlags({ tempF: 60, precipProb: 40, windMph: 5, gustsMph: 8, observedAt: '' }).wet).toBe(true);
    expect(weatherFlags({ tempF: 32, precipProb: 0, windMph: 5, gustsMph: 8, observedAt: '' }).freezing).toBe(true);
    expect(weatherFlags({ tempF: 33, precipProb: 39, windMph: 5, gustsMph: 8, observedAt: '' })).toEqual({
      windy: false,
      wet: false,
      freezing: false,
    });
  });

  it('writes a plain-language note per flag', () => {
    const notes = impactNotes({ windy: true, wet: true, freezing: false });
    expect(notes).toHaveLength(2);
    expect(notes.join(' ')).toMatch(/field goals/i);
    expect(notes.join(' ')).toMatch(/running backs/i);
    expect(impactNotes({ windy: false, wet: false, freezing: false })).toEqual([]);
  });
});

describe('summarizeWeatherWatch', () => {
  const starters = [
    { name: 'Starter QB', nflTeam: 'GB' },
    { name: 'Other Guy', nflTeam: 'DET' },
  ];

  it('alerts on flagged outdoor games and names affected starters', () => {
    const v = venue();
    const weather = new Map([[venueKey(v), { tempF: 55, precipProb: 70, windMph: 20, gustsMph: 30, observedAt: '' }]]);
    const s = summarizeWeatherWatch([v], weather, starters, NOW);
    expect(s.alerts).toHaveLength(1);
    expect(s.alerts[0].affectedStarters).toEqual(['Starter QB']);
    expect(s.alerts[0].flags.windy).toBe(true);
    expect(s.alerts[0].flags.wet).toBe(true);
    expect(s.alerts[0].notes.length).toBeGreaterThan(0);
    expect(s.gamesChecked).toBe(1);
  });

  it('skips dome games, past games, and games without a forecast', () => {
    const dome = venue({ home: 'DET', away: 'MIN', venue: { name: 'Ford Field', city: 'Detroit, MI', lat: 42.34, lon: -83.0456, roof: 'dome' } });
    const past = venue({ kickoffIso: '2026-10-29T00:15:00Z' });
    const noForecast = venue({ home: 'BUF', away: 'BAL' });
    const calm = venue({ home: 'KC', away: 'DEN' });
    const weather = new Map([[venueKey(calm), { tempF: 60, precipProb: 0, windMph: 5, gustsMph: 8, observedAt: '' }]]);
    const s = summarizeWeatherWatch([dome, past, noForecast, calm], weather, [], NOW);
    expect(s.alerts).toHaveLength(0);
    expect(s.domesSkipped).toBe(1);
    expect(s.unavailable).toBe(1);
    expect(s.gamesChecked).toBe(1);
  });

  it('sorts wind alerts before rain alerts', () => {
    const wet = venue({ home: 'MIA', away: 'NE' });
    const windy = venue({ home: 'GB', away: 'CAR' });
    const weather = new Map([
      [venueKey(wet), { tempF: 80, precipProb: 90, windMph: 5, gustsMph: 8, observedAt: '' }],
      [venueKey(windy), { tempF: 45, precipProb: 0, windMph: 22, gustsMph: 28, observedAt: '' }],
    ]);
    const s = summarizeWeatherWatch([wet, windy], weather, [], NOW);
    expect(s.alerts.map(a => a.home)).toEqual(['GB', 'MIA']);
  });
});

describe('fetchKickoffWeather', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests all upcoming venues in one call and maps hourly to kickoff', async () => {
    const venues = [
      venue(),
      venue({ home: 'DET', away: 'MIN', venue: { name: 'Ford Field', city: 'Detroit, MI', lat: 42.34, lon: -83.0456, roof: 'dome' } }),
    ];
    const hourly = {
      time: ['2026-11-01T17:00'],
      temperature_2m: [52],
      precipitation_probability: [20],
      wind_speed_10m: [18],
      wind_gusts_10m: [26],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ hourly }, { hourly }] });
    vi.stubGlobal('fetch', fetchMock);
    const out = await fetchKickoffWeather(venues, NOW);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.get('GB:CAR')).toMatchObject({ tempF: 52, windMph: 18 });
    expect(out.get('DET:MIN')).toBeDefined();
  });

  it('skips games that already kicked off and throws on HTTP errors', async () => {
    const past = venue({ kickoffIso: '2026-10-29T00:15:00Z' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = await fetchKickoffWeather([past], NOW);
    expect(out.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchKickoffWeather([venue()], NOW)).rejects.toThrow(/HTTP 500/);
  });
});
