// TrendingAdds rendering: a successful fetch renders the joined,
// availability-filtered table; a rejected fetch renders the error state
// with a working retry; an all-rostered trending list renders the
// all-clear note.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TrendingAdds } from './TrendingAdds';
import { fetchTrendingAdds } from '@/api/sleeperTrending';
import type { League, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperTrending', () => ({
  fetchTrendingAdds: vi.fn(),
}));
const mockFetch = vi.mocked(fetchTrendingAdds);

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
  generatedAt: '2026-10-29',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    player({ id: 'hot', name: 'Hot Receiver' }),
    player({ id: 'owned', name: 'Owned Receiver' }),
  ],
};

function leagueWith(rosteredIds: string[]): League {
  const team: Team = {
    id: 't1',
    name: 'Team 1',
    roster: rosteredIds.map(id => ({
      id,
      platformId: '',
      name: id === 'owned' ? 'Owned Receiver' : id,
      position: 'WR',
      team: 'DAL',
    })),
  } as Team;
  return { teams: [team] } as League;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue([
    { playerId: 'sid-hot', count: 1200 },
    { playerId: 'sid-owned', count: 900 },
  ]);
});

describe('TrendingAdds', () => {
  it('renders the trending table with add counts, excluding rostered players', async () => {
    render(<TrendingAdds league={leagueWith(['owned'])} pool={pool} />);
    expect(screen.getByText('Loading trending adds…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Hot Receiver')).toBeInTheDocument());
    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(screen.queryByText('Owned Receiver')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAccessibleName();
  });

  it('renders an all-rostered note when nothing trending is available', async () => {
    render(<TrendingAdds league={leagueWith(['hot', 'owned'])} pool={pool} />);
    await waitFor(() =>
      expect(screen.getByText(/already rostered here/)).toBeInTheDocument(),
    );
  });

  it('renders the error state and retries on click', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Sleeper trending: HTTP 503'));
    render(<TrendingAdds league={leagueWith([])} pool={pool} />);
    await waitFor(() =>
      expect(screen.getByText(/Couldn't load trending adds/)).toBeInTheDocument(),
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('Hot Receiver')).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
