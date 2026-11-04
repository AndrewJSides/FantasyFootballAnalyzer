// FaabGuidance rendering: bid ranges price off league FAAB norms, and the
// item-135 Sleeper column shows Sleeper's own week-N projection next to the
// pool season projection — a value where published, a dash where not, and
// dashes (with the bid ranges intact) when the fetch fails.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FaabGuidance } from './FaabGuidance';
import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';
import type { League, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperWeeklyProjections', () => ({
  fetchSleeperWeekProjections: vi.fn(),
}));
const mockProjections = vi.mocked(fetchSleeperWeekProjections);

function player(overrides: Partial<PoolPlayer> & { id: string; name: string }): PoolPlayer {
  return {
    pos: 'WR',
    team: 'DAL',
    projPtsPpr: 150,
    sleeperId: `sid-${overrides.id}`,
    ...overrides,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: '2026-11-04',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    player({ id: 'alpha', name: 'Alpha Receiver', projPtsPpr: 200 }),
    player({ id: 'beta', name: 'Beta Receiver', projPtsPpr: 150 }),
  ],
};

function leagueWithBids(): League {
  const team: Team = {
    id: 't1',
    name: 'Team 1',
    isMyTeam: true,
    roster: [],
    transactions: [
      {
        type: 'waiver',
        waiverBudgetSpent: 20,
        adds: [{ name: 'Alpha Receiver', position: 'WR' }],
      },
    ],
  } as unknown as Team;
  return { season: 2026, teams: [team] } as unknown as League;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockProjections.mockResolvedValue({ 'sid-alpha': 18.5 });
});

describe('FaabGuidance', () => {
  it('renders bid ranges with the Sleeper week projection where published', async () => {
    render(<FaabGuidance league={leagueWithBids()} pool={pool} />);
    await waitFor(() =>
      expect(screen.getByLabelText(/Sleeper projection 18\.5 for week/)).toBeInTheDocument(),
    );
    // Both targets render; the one without a Sleeper line gets a dash.
    expect(screen.getByText('Alpha Receiver')).toBeInTheDocument();
    expect(screen.getByText('Beta Receiver')).toBeInTheDocument();
    expect(screen.getByLabelText('No Sleeper projection for this player')).toBeInTheDocument();
    // Bid ranges still price off the league's $20 median winning bid.
    expect(screen.getAllByLabelText(/Suggested bid \$\d+ to \$\d+ for /)).toHaveLength(2);
  });

  it('leaves the bid ranges intact when the Sleeper fetch fails', async () => {
    mockProjections.mockRejectedValue(new Error('network down'));
    render(<FaabGuidance league={leagueWithBids()} pool={pool} />);
    await waitFor(() =>
      expect(screen.getAllByLabelText(/Suggested bid \$\d+ to \$\d+ for /)).toHaveLength(2),
    );
    expect(screen.getAllByLabelText('Sleeper projection not loaded')).toHaveLength(2);
  });

  it('shows the no-bids note when the league has no FAAB data', () => {
    const team: Team = { id: 't1', name: 'Team 1', roster: [] } as unknown as Team;
    render(<FaabGuidance league={{ teams: [team] } as unknown as League} pool={pool} />);
    expect(screen.getByText(/No FAAB bids recorded/)).toBeInTheDocument();
  });
});
