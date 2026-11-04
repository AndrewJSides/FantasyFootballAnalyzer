// Item-138 weather risk: per-team join of venues + kickoff weather.
import { describe, it, expect } from 'vitest';
import { weatherRiskByTeam, weatherRiskLabel, WEATHER_RISK_POSITIONS } from './weatherRisk';
import type { GameVenue, WeatherAtKickoff } from './weatherWatch';

const openVenue = (home: string, away: string): GameVenue => ({
  home,
  away,
  kickoffIso: '2026-11-08T18:00:00Z',
  venue: { name: 'Test Field', city: 'Testville', lat: 40, lon: -80, roof: 'open' },
  neutralSite: false,
});

const domeVenue = (home: string, away: string): GameVenue => ({
  ...openVenue(home, away),
  venue: { name: 'Dome', city: 'Testville', lat: 40, lon: -80, roof: 'dome' },
});

const weather = (windMph: number, gustsMph: number, precipProb: number): WeatherAtKickoff => ({
  tempF: 55,
  precipProb,
  windMph,
  gustsMph,
  observedAt: '2026-11-08T18:00:00Z',
});

describe('weatherRiskByTeam', () => {
  it('maps both teams of a windy outdoor game', () => {
    const map = weatherRiskByTeam(
      [openVenue('TB', 'ATL')],
      new Map([['TB:ATL', weather(18, 20, 10)]]),
    );
    expect(map.get('TB')?.windy).toBe(true);
    expect(map.get('ATL')?.windy).toBe(true);
    expect(map.get('TB')?.wet).toBe(false);
  });

  it('maps both teams of a wet outdoor game', () => {
    const map = weatherRiskByTeam(
      [openVenue('TB', 'ATL')],
      new Map([['TB:ATL', weather(5, 8, 92)]]),
    );
    expect(map.get('ATL')?.wet).toBe(true);
    expect(map.get('ATL')?.windy).toBe(false);
  });

  it('skips calm outdoor games', () => {
    const map = weatherRiskByTeam(
      [openVenue('TB', 'ATL')],
      new Map([['TB:ATL', weather(5, 8, 10)]]),
    );
    expect(map.size).toBe(0);
  });

  it('skips dome games even when the forecast is bad', () => {
    const map = weatherRiskByTeam(
      [domeVenue('TB', 'ATL')],
      new Map([['TB:ATL', weather(30, 40, 95)]]),
    );
    expect(map.size).toBe(0);
  });

  it('skips games with no forecast', () => {
    const map = weatherRiskByTeam([openVenue('TB', 'ATL')], new Map());
    expect(map.size).toBe(0);
  });

  it('flags gusts alone, and freezing alone does not flag', () => {
    const gusty = weatherRiskByTeam(
      [openVenue('GB', 'CHI')],
      new Map([['GB:CHI', weather(10, 30, 5)]]),
    );
    expect(gusty.get('GB')?.windy).toBe(true);
    const freezing = weatherRiskByTeam(
      [openVenue('GB', 'CHI')],
      new Map([['GB:CHI', { ...weather(5, 8, 5), tempF: 20 }]]),
    );
    expect(freezing.size).toBe(0);
  });
});

describe('weatherRiskLabel', () => {
  it('names wind and rain, and the passing-game downgrade', () => {
    const label = weatherRiskLabel({
      windy: true,
      wet: true,
      windMph: 15,
      gustsMph: 22,
      precipProb: 92,
      tempF: 60,
    });
    expect(label).toContain('wind 15 mph');
    expect(label).toContain('92% rain');
    expect(label).toContain('passing game');
  });

  it('covers passing-game positions only', () => {
    expect(WEATHER_RISK_POSITIONS.has('QB')).toBe(true);
    expect(WEATHER_RISK_POSITIONS.has('WR')).toBe(true);
    expect(WEATHER_RISK_POSITIONS.has('TE')).toBe(true);
    expect(WEATHER_RISK_POSITIONS.has('RB')).toBe(false);
  });
});
