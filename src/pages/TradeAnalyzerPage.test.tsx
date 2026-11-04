// TradeAnalyzerPage rendering: analyzing a trade renders the verdict
// breakdown with Sleeper's week-N projection beside each VOR value, a dash
// where Sleeper published no line, and an intact verdict when the Sleeper
// fetch fails (backlog item 129).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PoolPlayer } from '@/types/draft';

const h = vi.hoisted(() => {
  const players: PoolPlayer[] = [];
  const add = (id: string, name: string, pos: string, team: string) => {
    players.push({
      id,
      name,
      team,
      pos,
      posRank: 1,
      overallRank: players.length + 1,
      tier: 1,
      bye: null,
      baseValue: null,
      sleeperId: `sid-${id}`,
      projPtsPpr: 250,
      projPts: 240,
      projPtsStd: 230,
    } as PoolPlayer);
  };
  add('a1', 'Alpha Aardvark', 'QB', 'BUF');
  add('b1', 'Beta Badger', 'QB', 'KC');
  add('c1', 'Charlie Cheetah', 'RB', 'WAS');
  return { players };
});

vi.mock('@/data/draftPool', () => ({
  POOL: { players: h.players, season: 2026 },
}));

vi.mock('@/api/sleeperWeeklyProjections', () => ({
  fetchSleeperWeekProjections: vi.fn(),
}));

import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';
import { TradeAnalyzerPage } from './TradeAnalyzerPage';

const mockSleeper = vi.mocked(fetchSleeperWeekProjections);

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no scrollIntoView, and Analyze writes a #trade= hash that a
  // later mount would otherwise auto-run — keep each test isolated.
  window.location.hash = '';
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
});

function addPlayer(side: 'A' | 'B', query: string, name: string) {
  const title = side === 'A' ? 'Side A gives' : 'Side B gives';
  fireEvent.change(
    screen.getByLabelText(`${title}: search any player`),
    { target: { value: query } },
  );
  fireEvent.click(
    within(screen.getByLabelText(`${title} search results`)).getByLabelText(
      `Add ${name}`,
    ),
  );
}

function analyze() {
  fireEvent.click(screen.getByRole('button', { name: 'Analyze trade' }));
}

describe('TradeAnalyzerPage Sleeper values (item 129)', () => {
  it('shows Sleeper projections beside VOR in both breakdowns', async () => {
    mockSleeper.mockResolvedValue({ 'sid-a1': 22.4, 'sid-b1': 18.1 });
    render(
      <MemoryRouter>
        <TradeAnalyzerPage league={null} />
      </MemoryRouter>,
    );
    addPlayer('A', 'Alpha', 'Alpha Aardvark');
    addPlayer('B', 'Beta', 'Beta Badger');
    analyze();
    await waitFor(() =>
      expect(
        screen.getByLabelText(/Sleeper projection 22\.4 for week/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByLabelText(/Sleeper projection 18\.1 for week/),
    ).toBeInTheDocument();
    // The verdict itself still grades on VOR, not the market number.
    expect(screen.getByLabelText('Trade verdict')).toBeInTheDocument();
  });

  it('dashes a player with no Sleeper line', async () => {
    mockSleeper.mockResolvedValue({ 'sid-a1': 22.4 });
    render(
      <MemoryRouter>
        <TradeAnalyzerPage league={null} />
      </MemoryRouter>,
    );
    addPlayer('A', 'Alpha', 'Alpha Aardvark');
    addPlayer('B', 'Charlie', 'Charlie Cheetah');
    analyze();
    await waitFor(() =>
      expect(
        screen.getByLabelText('No Sleeper projection for this player'),
      ).toBeInTheDocument(),
    );
  });

  it('leaves the verdict intact when the Sleeper fetch fails', async () => {
    mockSleeper.mockRejectedValue(new Error('boom'));
    render(
      <MemoryRouter>
        <TradeAnalyzerPage league={null} />
      </MemoryRouter>,
    );
    addPlayer('A', 'Alpha', 'Alpha Aardvark');
    addPlayer('B', 'Beta', 'Beta Badger');
    analyze();
    await waitFor(() =>
      expect(
        screen.getAllByLabelText('Sleeper projection not loaded').length,
      ).toBe(2),
    );
    expect(screen.getByLabelText('Trade verdict')).toBeInTheDocument();
  });
});
