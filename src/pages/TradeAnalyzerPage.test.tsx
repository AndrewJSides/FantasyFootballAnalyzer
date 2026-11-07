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

// Dynasty mode (item 182) reads the bundled ages file; pin ages for the
// mocked players so the toggle's re-pricing is deterministic: Alpha (QB,
// 23) holds full value, Charlie (RB, 29) is halved on the age curve.
vi.mock('@/data/playerAges', () => ({
  PLAYER_AGES: {
    season: 2026,
    asOf: '2026-09-01',
    generatedAt: 'test',
    ages: { 'sid-a1': 23, 'sid-b1': 34, 'sid-c1': 29 },
  },
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

describe('TradeAnalyzerPage draft picks (item 175)', () => {
  function addPick(side: 'A' | 'B') {
    fireEvent.click(
      screen.getByLabelText(
        `Add 2027 Round 1 pick to Side ${side === 'A' ? 'A gives' : 'B gives'}`,
      ),
    );
  }

  it('enables Analyze with a pick alone and renders the pick row in the verdict', async () => {
    mockSleeper.mockResolvedValue({});
    render(
      <MemoryRouter>
        <TradeAnalyzerPage league={null} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Analyze trade' })).toBeDisabled();
    addPick('A');
    // The pick lists on the builder side, and the trade can run on picks
    // alone — a pick-for-player deal is analyzable.
    expect(screen.getByLabelText('Side A gives draft picks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze trade' })).toBeEnabled();
    analyze();
    await waitFor(() =>
      expect(screen.getByLabelText('Trade verdict')).toBeInTheDocument(),
    );
    // The mocked pool is tiny, so the pick's expected VOR reads 0.0 — the
    // pricing itself is covered by the util tests; here the row must exist
    // with its label and value, and the totals must carry it.
    expect(
      screen.getByLabelText('2027 Round 1 pick, expected value 0.0 VOR'),
    ).toBeInTheDocument();
    // The pick rides the shareable link, so a recipient grades the same deal.
    expect(window.location.hash).toContain('pa');
  });

  it('removes a pick from the builder', () => {
    render(
      <MemoryRouter>
        <TradeAnalyzerPage league={null} />
      </MemoryRouter>,
    );
    addPick('B');
    expect(screen.getByLabelText('Side B gives draft picks')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Remove 2027 Round 1 pick'));
    expect(screen.queryByLabelText('Side B gives draft picks')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze trade' })).toBeDisabled();
  });

  it('restores picks from a shared link and auto-runs the verdict', async () => {
    mockSleeper.mockResolvedValue({});
    window.location.hash = `#trade=${encodeURIComponent(
      JSON.stringify({ a: [], b: [], pa: [{ s: 2027, r: 1 }] }),
    )}`;
    render(
      <MemoryRouter>
        <TradeAnalyzerPage league={null} />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText('2027 Round 1 pick, expected value 0.0 VOR'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Trade verdict')).toBeInTheDocument();
  });
});

describe('TradeAnalyzerPage dynasty mode (item 182)', () => {
  function addPick(side: 'A' | 'B') {
    fireEvent.click(
      screen.getByLabelText(
        `Add 2027 Round 1 pick to Side ${side === 'A' ? 'A gives' : 'B gives'}`,
      ),
    );
  }

  it('defaults to Redraft and re-prices the verdict on Dynasty', async () => {
    mockSleeper.mockResolvedValue({});
    render(
      <MemoryRouter>
        <TradeAnalyzerPage league={null} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('radio', { name: 'Redraft (VOR)' }),
    ).toBeChecked();
    addPlayer('A', 'Alpha', 'Alpha Aardvark');
    addPlayer('B', 'Charlie', 'Charlie Cheetah');
    analyze();
    await waitFor(() =>
      expect(screen.getByLabelText('Trade verdict')).toBeInTheDocument(),
    );
    // Both mock players project 250, so the redraft verdict is a VOR
    // call; the Dynasty toggle re-prices in place: Alpha (QB, 23) is on
    // the QB curve's ramp to its age-25 peak (factor 0.95, 237.5) while
    // Charlie (RB, 29) is halved to 125.
    fireEvent.click(
      screen.getByRole('radio', { name: 'Dynasty (age-adjusted)' }),
    );
    await waitFor(() =>
      expect(screen.getByText(/Side A wins/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/by 112.5 dynasty pts/)).toBeInTheDocument();
    expect(screen.getByText(/Values are dynasty values/)).toBeInTheDocument();
    // The VOR-priced counter-offers never appear under a dynasty verdict.
    expect(screen.queryByLabelText('Make it fair')).not.toBeInTheDocument();
  });

  it('excludes draft picks from dynasty totals', async () => {
    mockSleeper.mockResolvedValue({});
    render(
      <MemoryRouter>
        <TradeAnalyzerPage league={null} />
      </MemoryRouter>,
    );
    addPlayer('A', 'Alpha', 'Alpha Aardvark');
    addPick('B');
    fireEvent.click(
      screen.getByRole('radio', { name: 'Dynasty (age-adjusted)' }),
    );
    analyze();
    await waitFor(() =>
      expect(screen.getByLabelText('Trade verdict')).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/excluded from dynasty totals/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/expected value .* VOR/),
    ).not.toBeInTheDocument();
  });
});

describe('TradeAnalyzerPage dynasty deep link (backlog item 193)', () => {
  it('lands on the dynasty verdict from a shared link carrying the mode', async () => {
    mockSleeper.mockResolvedValue({});
    window.location.hash = `#trade=${encodeURIComponent(
      JSON.stringify({
        a: ['Alpha Aardvark'],
        b: ['Charlie Cheetah'],
        m: 'dynasty',
      }),
    )}`;
    render(
      <MemoryRouter>
        <TradeAnalyzerPage league={null} />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Trade verdict')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('radio', { name: 'Dynasty (age-adjusted)' }),
    ).toBeChecked();
    expect(screen.getByText(/by 112.5 dynasty pts/)).toBeInTheDocument();
  });
});
