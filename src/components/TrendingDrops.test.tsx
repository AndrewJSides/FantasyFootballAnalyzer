// TrendingDrops rendering: a successful fetch renders the joined table
// with ownership and the cut-candidate flag; a rejected fetch renders the
// error state with a working retry; an empty join renders the empty note.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TrendingDrops } from './TrendingDrops';
import { fetchTrendingDrops } from '@/api/sleeperTrending';
import type { League, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperTrending', () => ({
  fetchTrendingDrops: vi.fn(),
}));
const mockFetch = vi.mocked(fetchTrendingDrops);

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
  generatedAt: '2026-10-30',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    player({ id: 'cut', name: 'Cut Receiver' }),
    player({ id: 'mine', name: 'My Receiver' }),
  ],
};

function leagueWith(opts: { mine: string[]; theirs: string[] }): League {
  const mineTeam: Team = {
    id: 't1',
    name: 'My Team',
    isMyTeam: true,
    roster: opts.mine.map(id => ({
      id,
      platformId: '',
      name: id === 'mine' ? 'My Receiver' : id,
      position: 'WR',
      team: 'DAL',
    })),
  } as Team;
  const theirTeam: Team = {
    id: 't2',
    name: 'Rival',
    roster: opts.theirs.map(id => ({
      id,
      platformId: '',
      name: id === 'cut' ? 'Cut Receiver' : id,
      position: 'WR',
      team: 'DAL',
    })),
  } as Team;
  return { teams: [mineTeam, theirTeam] } as League;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue([
    { playerId: 'sid-cut', count: 1500 },
    { playerId: 'sid-mine', count: 1200 },
  ]);
});

describe('TrendingDrops', () => {
  it('renders the drops table with owners and the cut-candidate flag', async () => {
    render(<TrendingDrops league={leagueWith({ mine: ['mine'], theirs: ['cut'] })} pool={pool} />);
    expect(screen.getByText('Loading trending drops…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Cut Receiver')).toBeInTheDocument());
    expect(screen.getByText('1,500')).toBeInTheDocument();
    expect(screen.getByText('Rival')).toBeInTheDocument();
    expect(screen.getByText(/cut candidate/)).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAccessibleName();
  });

  it('renders an empty note when nothing trending joins the pool', async () => {
    mockFetch.mockResolvedValue([{ playerId: 'sid-unknown', count: 100 }]);
    render(<TrendingDrops league={leagueWith({ mine: [], theirs: [] })} pool={pool} />);
    await waitFor(() =>
      expect(screen.getByText(/check back after the next sync/)).toBeInTheDocument(),
    );
  });

  it('renders the error state and retries on click', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Sleeper trending: HTTP 503'));
    render(<TrendingDrops league={leagueWith({ mine: [], theirs: [] })} pool={pool} />);
    await waitFor(() =>
      expect(screen.getByText(/Couldn't load trending drops/)).toBeInTheDocument(),
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('Cut Receiver')).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
