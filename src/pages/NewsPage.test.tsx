// NewsPage (backlog item 45): latest NFL headlines from ESPN's free public
// feed, with tagged players deep-linked into Player Journey.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NflNewsItem } from '@/api/espnNews';
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

function renderPage() {
  return render(
    <MemoryRouter>
      <NewsPage />
    </MemoryRouter>,
  );
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
});
