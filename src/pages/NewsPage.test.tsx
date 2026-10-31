// NewsPage (backlog item 45): latest NFL headlines from ESPN's free public
// feed, with tagged players deep-linked into Player Journey.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NflNewsItem } from '@/api/espnNews';
import type { League, Player, Team } from '@/types';
import { POOL } from '@/data/draftPool';
import { NewsPage } from './NewsPage';

vi.mock('@/api/espnNews', () => ({ fetchNflNews: vi.fn() }));

import { fetchNflNews } from '@/api/espnNews';

const mockFetch = vi.mocked(fetchNflNews);

function newsItem(overrides: Partial<NflNewsItem> = {}): NflNewsItem {
  return {
    id: '1',
    headline: 'Star ruled out for Sunday',
    description: 'An ankle injury sidelines him.',
    published: '2026-10-30T20:00:00Z',
    url: 'https://www.espn.com/nfl/story/_/id/1/x',
    athletes: [],
    teams: [],
    ...overrides,
  };
}

function renderPage(league?: League) {
  return render(
    <MemoryRouter>
      <NewsPage league={league} />
    </MemoryRouter>,
  );
}

function leagueWithMyTeam(roster: Player[]): League {
  return {
    teams: [{ id: 't1', name: 'My Team', isMyTeam: true, roster } as Team],
  } as League;
}

function poolRosterPlayer(poolId: string): Player {
  const poolPlayer = POOL.players.find(p => p.id === poolId)!;
  return {
    id: poolPlayer.id,
    platformId: '',
    name: poolPlayer.name,
    position: poolPlayer.pos,
    team: '',
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  document.title = '';
});

describe('NewsPage', () => {
  it('shows a loading state, then the headlines', async () => {
    mockFetch.mockResolvedValue([newsItem()]);
    renderPage();
    expect(screen.getByText('Loading headlines…')).toBeInTheDocument();
    const headline = await screen.findByText('Star ruled out for Sunday');
    expect(headline.closest('a')).toHaveAttribute(
      'href',
      'https://www.espn.com/nfl/story/_/id/1/x',
    );
    expect(headline.closest('a')).toHaveAttribute('target', '_blank');
    expect(screen.getByText('An ankle injury sidelines him.')).toBeInTheDocument();
  });

  it('deep-links tagged pool players into Player Journey, leaves others as text', async () => {
    const poolPlayer = POOL.players.find(p => p.name && p.pos === 'RB');
    expect(poolPlayer).toBeDefined();
    mockFetch.mockResolvedValue([
      newsItem({
        id: '2',
        athletes: [poolPlayer!.name, 'Some Rookie'],
        teams: ['GB'],
      }),
    ]);
    renderPage();
    const playerLink = await screen.findByRole('link', {
      name: poolPlayer!.name,
    });
    expect(playerLink).toHaveAttribute(
      'href',
      `/players?player=${encodeURIComponent(poolPlayer!.id)}`,
    );
    // The unmatched name renders as plain text, not a link.
    expect(screen.getByText('Some Rookie').tagName).toBe('SPAN');
    expect(screen.getByText('GB')).toBeInTheDocument();
    // Headline links open ESPN in a new tab.
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('shows an error state with a retry button', async () => {
    mockFetch.mockRejectedValueOnce(new Error('down'));
    renderPage();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByText(/Couldn't load the headlines/)).toBeInTheDocument();
    mockFetch.mockResolvedValue([newsItem()]);
    fireEvent.click(retry);
    await screen.findByText('Star ruled out for Sunday');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('shows an empty state when the feed returns nothing', async () => {
    mockFetch.mockResolvedValue([]);
    renderPage();
    await screen.findByText(/No headlines right now/);
  });

  it('announces the load to screen readers', async () => {
    mockFetch.mockResolvedValue([newsItem(), newsItem({ id: '2' })]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Loaded 2 NFL headlines.')).toBeInTheDocument(),
    );
  });

  it('shows no scope toggle without a league', async () => {
    mockFetch.mockResolvedValue([newsItem()]);
    renderPage();
    await screen.findByText('Star ruled out for Sunday');
    expect(
      screen.queryByRole('button', { name: /My players/ }),
    ).not.toBeInTheDocument();
  });

  it('hides the scope toggle when the league has no my-team', async () => {
    mockFetch.mockResolvedValue([newsItem()]);
    renderPage({ teams: [] } as League);
    await screen.findByText('Star ruled out for Sunday');
    expect(
      screen.queryByRole('button', { name: /My players/ }),
    ).not.toBeInTheDocument();
  });

  it('filters headlines to the manager roster and announces the swap', async () => {
    const mine = POOL.players.find(p => p.name && p.pos === 'RB')!;
    const other = POOL.players.find(p => p.name && p.pos === 'WR' && p.id !== mine.id)!;
    mockFetch.mockResolvedValue([
      newsItem({ id: '1', headline: 'My guy hurt', athletes: [mine.name] }),
      newsItem({ id: '2', headline: 'Other guy fine', athletes: [other.name] }),
    ]);
    renderPage(leagueWithMyTeam([poolRosterPlayer(mine.id)]));
    await screen.findByText('My guy hurt');

    const allButton = screen.getByRole('button', { name: 'All news (2)' });
    const mineButton = screen.getByRole('button', { name: 'My players (1)' });
    expect(allButton).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(mineButton);
    expect(mineButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('My guy hurt')).toBeInTheDocument();
    expect(screen.queryByText('Other guy fine')).not.toBeInTheDocument();
    expect(
      screen.getByText('Showing 1 headline about your players.'),
    ).toBeInTheDocument();

    fireEvent.click(allButton);
    expect(screen.getByText('Other guy fine')).toBeInTheDocument();
    expect(screen.getByText('Showing all 2 headlines.')).toBeInTheDocument();
  });

  it('shows an empty state when no headlines tag the roster', async () => {
    const mine = POOL.players.find(p => p.name && p.pos === 'RB')!;
    const other = POOL.players.find(p => p.name && p.pos === 'WR' && p.id !== mine.id)!;
    mockFetch.mockResolvedValue([
      newsItem({ id: '1', headline: 'Other guy fine', athletes: [other.name] }),
    ]);
    renderPage(leagueWithMyTeam([poolRosterPlayer(mine.id)]));
    await screen.findByText('Other guy fine');
    fireEvent.click(screen.getByRole('button', { name: 'My players (0)' }));
    expect(
      screen.getByText('No headlines right now tag anyone on your roster.'),
    ).toBeInTheDocument();
  });
});
