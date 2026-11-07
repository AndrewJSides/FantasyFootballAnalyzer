// Item-138 weather-risk tag on the Weekly Rankings board: passing-game
// players in a flagged outdoor game get the tag, RBs do not. The
// weatherWatch module is mocked so the tag join is tested without a
// forecast fetch; the Sleeper weekly-stats fetch uses the same stub as
// WeeklyRankingsPage.test.tsx.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League } from '@/types';
import type { PoolPlayer } from '@/types/draft';

const h = vi.hoisted(() => {
  const players: PoolPlayer[] = [];
  const add = (id: string, name: string, pos: string, team: string, bye: number | null) => {
    players.push({
      id,
      name,
      team,
      pos,
      posRank: players.length + 1,
      overallRank: players.length + 1,
      tier: 1,
      bye,
      baseValue: null,
      sleeperId: `sid-${id}`,
      projPtsPpr: 250,
      projPts: 240,
      projPtsStd: 230,
    } as PoolPlayer);
  };
  add('a1', 'Alpha Aardvark', 'RB', 'FA', null);
  add('c1', 'Charlie Cheetah', 'WR', 'FA', null);
  add('d1', 'Delta Dolphin', 'QB', 'FA', null);
  return { players };
});

vi.mock('@/data/draftPool', () => ({
  POOL: { players: h.players, season: 2026 },
}));

// One flagged outdoor game: FA hosts FB in wind + heavy rain. The mock
// also re-implements the two pure helpers weatherRisk.ts imports from
// this module (venueKey, weatherFlags) with the production thresholds.
vi.mock('@/utils/weatherWatch', () => ({
  venueKey: (v: { home: string; away: string }) => `${v.home}:${v.away}`,
  weatherFlags: (w: { windMph: number; gustsMph: number; precipProb: number; tempF: number }) => ({
    windy: w.windMph >= 15 || w.gustsMph >= 25,
    wet: w.precipProb >= 40,
    freezing: w.tempF <= 32,
  }),
  buildGameVenues: () => [
    {
      home: 'FA',
      away: 'FB',
      kickoffIso: '2026-11-08T18:00:00Z',
      venue: { name: 'Test Field', city: 'Testville', lat: 40, lon: -80, roof: 'open' },
      neutralSite: false,
    },
  ],
  fetchKickoffWeather: () =>
    Promise.resolve(
      new Map([
        [
          'FA:FB',
          {
            tempF: 60,
            precipProb: 92,
            windMph: 18,
            gustsMph: 24,
            observedAt: '2026-11-08T18:00:00Z',
          },
        ],
      ]),
    ),
}));

import { WeeklyRankingsPage } from './WeeklyRankingsPage';

const league: League = {
  id: 'test',
  name: 'Test League',
  platform: 'sleeper',
  season: 2026,
  draftType: 'snake',
  teams: [],
  scoringType: 'ppr',
  totalTeams: 10,
  currentWeek: 8,
  isLoaded: true,
  status: 'offseason',
  rosterSlots: {
    QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1,
  },
} as League;

function renderPage() {
  return render(
    <MemoryRouter>
      <WeeklyRankingsPage league={league} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          'sid-a1': { pts_ppr: 25, gp: 1 },
          'sid-c1': { pts_ppr: 18, gp: 1 },
        }),
    }),
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WeeklyRankingsPage weather-risk tag', () => {
  it('tags QB/WR rows in a flagged game and leaves the RB row untagged', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week \d+ rankings/i })).toBeInTheDocument();
    });
    const table = screen.getByRole('table', { name: /week \d+ rankings/i });
    const tags = await within(table).findAllByLabelText(/Weather risk: /);
    // Charlie (WR) and Delta (QB) are tagged; Alpha (RB) is not — wet
    // weather favors the run, so RBs carry no tag.
    expect(tags).toHaveLength(2);
    const rows = within(table).getAllByRole('row');
    const alpha = rows.find(r =>
      within(r).queryByRole('rowheader', { name: 'Alpha Aardvark' }),
    );
    expect(within(alpha!).queryByLabelText(/Weather risk: /)).toBeNull();
    expect(tags[0]).toHaveAttribute('aria-label', expect.stringContaining('92% rain'));
    expect(tags[0]).toHaveAttribute('aria-label', expect.stringContaining('wind 18 mph'));
  });

  it('prices the -25% weather downgrade into the tagged row projection (item 138)', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /week \d+ rankings/i })).toBeInTheDocument();
    });
    const table = screen.getByRole('table', { name: /week \d+ rankings/i });
    const tags = await within(table).findAllByLabelText(/Weather risk: /);
    // Charlie's base projection is his one completed week (18.0); the
    // flagged game folds it to 13.5 and the tag names the priced-in cut.
    expect(tags[0]).toHaveAttribute(
      'aria-label',
      expect.stringContaining('4.5 pts priced into the projection shown'),
    );
    const rows = within(table).getAllByRole('row');
    const charlie = rows.find(r =>
      within(r).queryByRole('rowheader', { name: /Charlie Cheetah/ }),
    );
    expect(within(charlie!).getByText('13.5')).toBeInTheDocument();
  });
});
