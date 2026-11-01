// NewsWaiverTargets rendering: a successful fetch renders the
// availability-filtered headline table; a rejected fetch renders the error
// state with a working retry; an all-rostered result renders the empty note.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NewsWaiverTargets } from './NewsWaiverTargets';
import { fetchNflNews } from '@/api/espnNews';
import type { League, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { NflNewsItem } from '@/api/espnNews';

vi.mock('@/api/espnNews', () => ({
  fetchNflNews: vi.fn(),
}));
const mockFetch = vi.mocked(fetchNflNews);

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
  generatedAt: '2026-10-31',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    player({ id: 'free', name: 'Free Agent' }),
    player({ id: 'owned', name: 'Owned Receiver' }),
  ],
};

function newsItem(headline: string, athletes: string[]): NflNewsItem {
  return {
    id: headline,
    headline,
    description: '',
    published: '2026-10-31T14:00:00Z',
    url: 'https://www.espn.com/story',
    athletes,
    teams: [],
  };
}

function leagueWith(rosteredNames: string[]): League {
  const team: Team = {
    id: 't1',
    name: 'Team 1',
    roster: rosteredNames.map((name, i) => ({
      id: `r-${i}`,
      platformId: '',
      name,
      position: 'WR',
      team: 'DAL',
    })),
  } as Team;
  return { teams: [team] } as League;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue([
    newsItem('Free Agent named starter', ['Free Agent']),
    newsItem('Owned Receiver extended', ['Owned Receiver']),
  ]);
});

describe('NewsWaiverTargets', () => {
  it('renders the headline table for available players, excluding rostered ones', async () => {
    render(<NewsWaiverTargets league={leagueWith(['Owned Receiver'])} pool={pool} />);
    expect(screen.getByText('Loading the latest headlines…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Free Agent')).toBeInTheDocument());
    expect(screen.getByText('Free Agent named starter')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Free Agent named starter' }),
    ).toHaveAttribute('href', 'https://www.espn.com/story');
    expect(screen.queryByText('Owned Receiver')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAccessibleName();
  });

  it('renders an all-rostered note when nothing in the headlines is available', async () => {
    render(
      <NewsWaiverTargets
        league={leagueWith(['Free Agent', 'Owned Receiver'])}
        pool={pool}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/already rostered here/)).toBeInTheDocument(),
    );
  });

  it('renders the error state and retries on click', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ESPN news: HTTP 503'));
    render(<NewsWaiverTargets league={leagueWith([])} pool={pool} />);
    await waitFor(() =>
      expect(screen.getByText(/Couldn't load the latest headlines/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('Free Agent')).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
