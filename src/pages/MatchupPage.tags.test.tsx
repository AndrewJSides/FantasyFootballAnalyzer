// MatchupPage: sole-back + weather-risk tags on the game-plan lineup
// table (backlog item 139). The Weekly Rankings board's and Start/Sit
// tables' display-only tags come to the game plan, the third place a
// weekly lineup call is made. Same mock discipline as the Start/Sit tag
// tests: a two-player mocked pool (sole-back pair on TEN), a controlled
// Sleeper weekly series, and a controlled kickoff forecast.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Player, Team, WeeklyMatchup } from '@/types';
import { venueKey, type GameVenue, type WeatherAtKickoff } from '@/utils/weatherWatch';
import MatchupPage from './MatchupPage';

vi.mock('@/data/draftPool', () => ({
  POOL: {
    season: 2026,
    generatedAt: '2026-11-04T00:00:00Z',
    baseline: { budget: 200, teams: 10, rounds: 16 },
    players: [
      {
        id: 'sole-lead',
        name: 'Sole Lead',
        pos: 'RB',
        team: 'TEN',
        sleeperId: '9101',
      },
      {
        id: 'sole-mate',
        name: 'Sole Mate',
        pos: 'RB',
        team: 'TEN',
        sleeperId: '9102',
        injuryStatus: 'Out',
        injuryBodyPart: 'Knee',
      },
    ],
  },
}));

vi.mock('@/api/sleeperWeeklyProjections', () => ({
  fetchSleeperWeekProjections: vi.fn(async () => ({})),
}));

// The two async feeds the tags join on: the Sleeper weekly series
// (sole-back usage, via the parent's component fetch) and the kickoff
// forecast (weather risk). Defaults preserve a tag-free page for the
// other suites — a null weekly series and a throwing forecast fetch.
const h = vi.hoisted(() => ({
  weekly: vi.fn(async () => null),
  weather: vi.fn(async () => {
    throw new Error('no forecast in tests');
  }),
}));

vi.mock('@/api/sleeperWeeklyPoints', async importOriginal => {
  const mod = await importOriginal<typeof import('@/api/sleeperWeeklyPoints')>();
  return { ...mod, fetchWeeklyPprPoints: h.weekly };
});

vi.mock('@/utils/weatherWatch', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/weatherWatch')>();
  return {
    ...mod,
    buildGameVenues: () => [
      {
        home: 'TB',
        away: 'DAL',
        kickoffIso: '2026-11-08T18:00:00Z',
        venue: { name: 'Test Field', city: 'Testville', lat: 27, lon: -82, roof: 'open' },
        neutralSite: false,
      },
    ],
    fetchKickoffWeather: h.weather,
  };
});

function mkPlayer(id: string, platformId: string, name: string, pos: string, team: string): Player {
  return { id, platformId, name, position: pos, team } as Player;
}

function weekly(flat: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (let w = 1; w <= 8; w++) out[w] = flat;
  return out;
}

function matchup(week: number, a: string, b: string): WeeklyMatchup {
  return { week, team1Id: a, team2Id: b } as WeeklyMatchup;
}

function league(): League {
  const mine: Team = {
    id: 'M',
    name: 'My Squad',
    isMyTeam: true,
    roster: [
      mkPlayer('m-lead', '9101', 'Sole Lead', 'RB', 'TEN'),
      mkPlayer('m-rb2', 'm-rb2', 'Second Back', 'RB', 'XXX'),
      mkPlayer('m-rb3', 'm-rb3', 'Bench Runner', 'RB', 'XXX'),
      mkPlayer('m-wr1', 'm-wr1', 'Top Wideout', 'WR', 'XXX'),
      mkPlayer('m-wr2', 'm-wr2', 'Second Wideout', 'WR', 'XXX'),
      mkPlayer('m-te1', 'm-te1', 'Top Tight', 'TE', 'XXX'),
      mkPlayer('m-qb', 'm-qb', 'Tampa Qb', 'QB', 'TB'),
    ],
  } as Team;
  const opp: Team = {
    id: 'O',
    name: 'Opponents',
    isMyTeam: false,
    roster: ['rb1', 'rb2', 'rb3', 'wr1', 'wr2', 'te1', 'qb1'].map(k =>
      mkPlayer(`o-${k}`, `o-${k}`, `o-${k}`, k.startsWith('rb') ? 'RB' : k.startsWith('wr') ? 'WR' : k.startsWith('te') ? 'TE' : 'QB', 'XXX'),
    ),
  } as Team;
  const pw: Record<string, Record<number, number>> = {
    '9101': weekly(15),
    'm-rb2': weekly(10),
    'm-rb3': weekly(5),
    'm-wr1': weekly(12),
    'm-wr2': weekly(11),
    'm-te1': weekly(8),
    'm-qb': weekly(20),
  };
  for (const p of opp.roster ?? []) pw[p.platformId ?? p.id] = weekly(8);
  return {
    id: 'L',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    currentWeek: 9,
    rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BENCH: 6 },
    teams: [mine, opp],
    playerWeeklyPoints: pw,
    futureSchedule: [matchup(9, 'M', 'O')],
  } as League;
}

function renderPage(l: League) {
  return render(
    <MemoryRouter>
      <MatchupPage league={l} />
    </MemoryRouter>,
  );
}

describe('MatchupPage game-plan tags (item 139)', () => {
  it('tags the sole back with the vacated-usage upside', async () => {
    // Lead: 120 pts on 160 opps = 0.75 pts/opp; mate's recent 12
    // opps/game vacated → +9.0, under the +10 cap.
    h.weekly.mockResolvedValue({
      season: 2026,
      weeks: [1, 2, 3, 4, 5, 6, 7, 8],
      pointsBySleeperId: {
        '9101': { 1: 15, 2: 15, 3: 15, 4: 15, 5: 15, 6: 15, 7: 15, 8: 15 },
        '9102': { 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 8, 7: 8, 8: 8 },
      },
      gamesBySleeperId: {
        '9101': [1, 2, 3, 4, 5, 6, 7, 8],
        '9102': [1, 2, 3, 4, 5, 6, 7, 8],
      },
      tdPtsBySleeperId: {},
      usageBySleeperId: {
        '9101': { 1: 20, 2: 20, 3: 20, 4: 20, 5: 20, 6: 20, 7: 20, 8: 20 },
        '9102': { 1: 12, 2: 12, 3: 12, 4: 12, 5: 12, 6: 12, 7: 12, 8: 12 },
      },
    });
    renderPage(league());
    expect(await screen.findByText('Sole back +9.0')).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Sole back: Sole Mate ruled out/),
    ).toBeInTheDocument();
  });

  it('tags the passing-game player in a windy, wet game but not the RB', async () => {
    h.weekly.mockResolvedValue(null);
    h.weather.mockImplementation(async (venues: GameVenue[]) =>
      new Map<string, WeatherAtKickoff>(
        venues.map(v => [
          venueKey(v),
          {
            tempF: 60,
            precipProb: 90,
            windMph: 20,
            gustsMph: 30,
            observedAt: '2026-11-08T18:00:00Z',
          },
        ]),
      ),
    );
    renderPage(league());
    expect(
      await screen.findByLabelText(/Weather risk: wind 20 mph/),
    ).toBeInTheDocument();
    // Exactly one tag on the page: the Tampa quarterback's. The TEN
    // running back plays no mocked-venue game and carries no tag.
    expect(screen.queryAllByLabelText(/Weather risk:/)).toHaveLength(1);
    // Item-138 remainder: the -25% cut is priced into the projection the
    // tag sits under — the flat-20 QB shows -5.0, not just the flag.
    expect(
      screen.getByLabelText(/5\.0 pts priced into the projection shown/),
    ).toBeInTheDocument();
  });
});
