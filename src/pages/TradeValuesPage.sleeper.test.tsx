// TradeValuesPage: Sleeper projection column (backlog item 142). The chart
// rows carry Sleeper's own week-N projection next to TraderApe's value;
// a pending or failed fetch just leaves dashes, and the chart never
// re-ranks on the market number.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { TradeValuesPage } from './TradeValuesPage';

vi.mock('@/api/sleeperWeeklyProjections', () => ({
  fetchSleeperWeekProjections: vi.fn(),
}));

import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';

const mockedProjections = vi.mocked(fetchSleeperWeekProjections);

function poolPlayer(over: Partial<PoolPlayer>): PoolPlayer {
  return {
    id: 'p1',
    name: 'Test Player',
    team: 'KC',
    pos: 'RB',
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: 8,
    baseValue: null,
    ...over,
  };
}

// Enough RB/WR depth to push replacement levels down so the top ones earn
// chart value, mirroring the main TradeValuesPage test pool.
const POOL: DraftPoolFile = {
  season: 2026,
  generatedAt: '2026-11-04',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    poolPlayer({ id: 'qb1', name: 'Elite QB', pos: 'QB', overallRank: 5, projPtsPpr: 330, sleeperId: '9002' }),
    poolPlayer({ id: 'rb1', name: 'Lead Back', pos: 'RB', overallRank: 10, projPtsPpr: 240, sleeperId: '9001' }),
    poolPlayer({ id: 'wr1', name: 'Top Wideout', pos: 'WR', overallRank: 8, projPtsPpr: 250 }),
    ...Array.from({ length: 60 }, (_, i) =>
      poolPlayer({
        id: `rbdepth${i}`,
        name: `Depth Back ${i}`,
        pos: 'RB',
        overallRank: 100 + i,
        projPtsPpr: 120 - i,
      }),
    ),
    ...Array.from({ length: 60 }, (_, i) =>
      poolPlayer({
        id: `wrdepth${i}`,
        name: `Depth Wideout ${i}`,
        pos: 'WR',
        overallRank: 150 + i,
        projPtsPpr: 110 - i,
      }),
    ),
    ...Array.from({ length: 20 }, (_, i) =>
      poolPlayer({
        id: `qbdepth${i}`,
        name: `Depth QB ${i}`,
        pos: 'QB',
        overallRank: 200 + i,
        projPtsPpr: 200 - i * 3,
      }),
    ),
  ],
};

const league: League = {
  id: 'guest',
  name: 'Guest draft prep',
  platform: 'sleeper',
  season: 2026,
  draftType: 'snake',
  teams: [],
  scoringType: 'ppr',
  totalTeams: 10,
  isLoaded: true,
  isGuest: true,
  status: 'preseason',
  currentWeek: 9,
  rosterSlots: {
    QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1,
  },
} as League;

function rowFor(name: string): HTMLElement {
  const table = screen.getByRole('table', { name: /trade value chart/i });
  const rows = within(table).getAllByRole('row').slice(1);
  const row = rows.find(r => (within(r).queryByText(name) ?? null) !== null);
  if (!row) throw new Error(`no chart row for ${name}`);
  return row;
}

describe('TradeValuesPage Sleeper column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Sleeper week-9 projections next to TraderApe values', async () => {
    mockedProjections.mockResolvedValue({ '9001': 18.4, '9002': 22.1 });
    render(
      <MemoryRouter>
        <TradeValuesPage league={league} pool={POOL} />
      </MemoryRouter>,
    );
    expect(mockedProjections).toHaveBeenCalledWith(2026, 9);
    const leadBackCell = await within(rowFor('Lead Back')).findByLabelText(
      'Sleeper projection 18.4 for week 9',
    );
    expect(leadBackCell).toHaveTextContent('18.4');
    expect(
      within(rowFor('Elite QB')).getByLabelText('Sleeper projection 22.1 for week 9'),
    ).toHaveTextContent('22.1');
  });

  it('dashes players with no Sleeper line', async () => {
    mockedProjections.mockResolvedValue({ '9001': 18.4 });
    render(
      <MemoryRouter>
        <TradeValuesPage league={league} pool={POOL} />
      </MemoryRouter>,
    );
    // Top Wideout has no sleeperId, so no line exists for it. Scoped to
    // the row: every unmapped depth row carries the same label.
    const cell = await within(rowFor('Top Wideout')).findByLabelText(
      'No Sleeper projection for this player',
    );
    expect(cell).toHaveTextContent('—');
  });

  it('dashes everything when the fetch fails', async () => {
    mockedProjections.mockRejectedValue(new Error('boom'));
    render(
      <MemoryRouter>
        <TradeValuesPage league={league} pool={POOL} />
      </MemoryRouter>,
    );
    // The chart still renders on its own values; Sleeper cells stay dashes.
    const table = await screen.findByRole('table', { name: /trade value chart/i });
    expect(within(table).getByText('Lead Back')).toBeInTheDocument();
    expect(
      within(rowFor('Lead Back')).getByLabelText('Sleeper projection not loaded'),
    ).toHaveTextContent('—');
  });
});
