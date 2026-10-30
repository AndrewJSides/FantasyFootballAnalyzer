// TradeValuesPage value-change deltas: with two chart snapshots in the
// bundled history, the Δ column renders signed per-player deltas vs the
// baseline; players missing from the baseline get a dash.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { TradeValuesPage } from './TradeValuesPage';

vi.mock('@/data/tradeValueSnapshots.2026.json', () => ({
  default: {
    snapshots: [
      { date: '2026-10-29', values: { qb1: 90, rb1: 80, wr1: 85 } },
      { date: '2026-10-30', values: { qb1: 95, rb1: 78, wr1: 85 } },
    ],
  },
}));

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

// Enough depth to push replacement levels down so the named players earn value.
const POOL: DraftPoolFile = {
  season: 2026,
  generatedAt: '2026-10-30',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    poolPlayer({ id: 'qb1', name: 'Elite QB', pos: 'QB', overallRank: 5, projPtsPpr: 330 }),
    poolPlayer({ id: 'rb1', name: 'Lead Back', pos: 'RB', overallRank: 10, projPtsPpr: 240 }),
    poolPlayer({ id: 'rb2', name: 'Second Back', pos: 'RB', overallRank: 12, projPtsPpr: 235 }),
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

const guestLeague = {
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
  rosterSlots: {
    QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1,
  },
} as League;

function renderPage() {
  return render(
    <MemoryRouter>
      <TradeValuesPage league={guestLeague} pool={POOL} />
    </MemoryRouter>,
  );
}

describe('TradeValuesPage value-change deltas', () => {
  it('renders the delta column with an accessible name', () => {
    renderPage();
    expect(
      screen.getByRole('columnheader', { name: 'Change since October 29, 2026' }),
    ).toBeInTheDocument();
  });

  it('shows signed deltas per player vs the baseline', () => {
    renderPage();
    const table = screen.getByRole('table', { name: /trade value chart/i });
    const qbRow = within(table).getByRole('row', { name: /elite qb/i });
    expect(within(qbRow).getByText('+5.0')).toBeInTheDocument();
    const rbRow = within(table).getByRole('row', { name: /lead back/i });
    expect(within(rbRow).getByText('-2.0')).toBeInTheDocument();
    const wrRow = within(table).getByRole('row', { name: /top wideout/i });
    expect(within(wrRow).getByText('0.0')).toBeInTheDocument();
  });

  it('shows a dash for players missing from the baseline', () => {
    renderPage();
    const table = screen.getByRole('table', { name: /trade value chart/i });
    const row = within(table).getByRole('row', { name: /second back/i });
    expect(within(row).getByText('—')).toBeInTheDocument();
  });
});
