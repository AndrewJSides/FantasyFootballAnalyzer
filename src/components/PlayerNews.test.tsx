// PlayerNews (backlog item 110): newest ESPN headlines tagging one player.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { fetchNflNews, type NflNewsItem } from '@/api/espnNews';
import { POOL } from '@/data/draftPool';
import { indexPoolNames } from '@/utils/newsPlayers';
import { matchKey } from '@/utils/playerNames';
import { PlayerNews } from './PlayerNews';

vi.mock('@/api/espnNews', () => ({ fetchNflNews: vi.fn() }));

const mockFetch = vi.mocked(fetchNflNews);

// A pool player whose normalized name is unambiguous, so the athlete→pool
// join resolves him instead of dropping the name.
const poolPlayer = POOL.players.find(
  p => indexPoolNames(POOL).get(matchKey(p.name)) === p,
)!;

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

beforeEach(() => {
  mockFetch.mockReset();
});

describe('PlayerNews', () => {
  it('renders headlines tagging the player, capped at 5', async () => {
    const tagged = Array.from({ length: 7 }, (_, i) =>
      newsItem({
        id: `n${i}`,
        headline: `Headline ${i}`,
        athletes: [poolPlayer.name],
      }),
    );
    mockFetch.mockResolvedValue(tagged);
    render(<PlayerNews playerName={poolPlayer.name} />);
    await waitFor(() =>
      expect(
        screen.getByRole('list', {
          name: `Latest news about ${poolPlayer.name}`,
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('Headline 0')).toBeInTheDocument();
    expect(screen.getByText('Headline 4')).toBeInTheDocument();
    expect(screen.queryByText('Headline 5')).not.toBeInTheDocument();
    const link = screen.getByText('Headline 0').closest('a');
    expect(link).toHaveAttribute(
      'href',
      'https://www.espn.com/nfl/story/_/id/1/x',
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders nothing when no headline tags the player', async () => {
    mockFetch.mockResolvedValue([
      newsItem({ athletes: ['Some Other Player'] }),
    ]);
    const { container } = render(<PlayerNews playerName={poolPlayer.name} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    // Let the state update flush, then confirm the section never appears.
    await waitFor(() =>
      expect(container.querySelector('ul')).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('list', {
        name: `Latest news about ${poolPlayer.name}`,
      }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing when the feed fails', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    const { container } = render(<PlayerNews playerName={poolPlayer.name} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(container.querySelector('ul')).not.toBeInTheDocument();
  });

  it('swaps headlines when the player changes', async () => {
    const other = POOL.players.find(
      p =>
        p !== poolPlayer &&
        indexPoolNames(POOL).get(matchKey(p.name)) === p,
    )!;
    mockFetch.mockResolvedValue([
      newsItem({ id: 'a', headline: 'First guy news', athletes: [poolPlayer.name] }),
      newsItem({ id: 'b', headline: 'Second guy news', athletes: [other.name] }),
    ]);
    const { rerender } = render(<PlayerNews playerName={poolPlayer.name} />);
    await waitFor(() =>
      expect(screen.getByText('First guy news')).toBeInTheDocument(),
    );
    rerender(<PlayerNews playerName={other.name} />);
    await waitFor(() =>
      expect(screen.getByText('Second guy news')).toBeInTheDocument(),
    );
    expect(screen.queryByText('First guy news')).not.toBeInTheDocument();
  });
});
