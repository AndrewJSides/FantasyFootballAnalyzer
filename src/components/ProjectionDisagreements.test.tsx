// ProjectionDisagreements rendering: a successful fetch renders both
// gap tables; a rejected fetch renders the error state with a working
// retry; a no-gap join renders the agreement note.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ProjectionDisagreements } from './ProjectionDisagreements';
import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';
import type { WeeklyRankRow } from '@/utils/weeklyRankings';
import type { PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperWeeklyProjections', () => ({
  fetchSleeperWeekProjections: vi.fn(),
}));
const mockFetch = vi.mocked(fetchSleeperWeekProjections);

function row(
  id: string,
  name: string,
  projection: number | null,
): WeeklyRankRow {
  return {
    player: {
      id,
      name,
      pos: 'WR',
      team: 'DAL',
      sleeperId: `sid-${id}`,
    } as PoolPlayer,
    total: null,
    games: null,
    ppg: null,
    last3: null,
    projection,
    matchup: null,
    consistency: null,
    owner: null,
    posRank: 1,
  };
}

const rows = [
  row('bull', 'Bull Receiver', 20),
  row('bear', 'Bear Receiver', 5),
  row('flat', 'Flat Receiver', 12),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ 'sid-bull': 14, 'sid-bear': 12, 'sid-flat': 12 });
});

describe('ProjectionDisagreements', () => {
  it('renders both gap tables with both numbers and the signed gap', async () => {
    render(<ProjectionDisagreements rows={rows} season={2026} week={9} />);
    await waitFor(() => {
      expect(screen.getByText('Bull Receiver')).toBeTruthy();
      expect(screen.getByText('Bear Receiver')).toBeTruthy();
    });
    expect(screen.getByText('TraderApe higher')).toBeTruthy();
    expect(screen.getByText('TraderApe lower')).toBeTruthy();
    expect(screen.getByText('+6.0')).toBeTruthy();
    expect(screen.getByText('-7.0')).toBeTruthy();
    expect(screen.queryByText('Flat Receiver')).toBeNull();
  });

  it('renders the error state with a working retry', async () => {
    mockFetch.mockRejectedValueOnce(new Error('HTTP 503'));
    render(<ProjectionDisagreements rows={rows} season={2026} week={9} />);
    await waitFor(() => {
      expect(screen.getByText(/Couldn't load Sleeper's projections/)).toBeTruthy();
    });
    mockFetch.mockResolvedValue({ 'sid-bull': 14, 'sid-bear': 12, 'sid-flat': 12 });
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(screen.getByText('Bull Receiver')).toBeTruthy();
    });
  });

  it('renders the agreement note when every gap is zero', async () => {
    mockFetch.mockResolvedValue({ 'sid-bull': 20, 'sid-bear': 5, 'sid-flat': 12 });
    render(<ProjectionDisagreements rows={rows} season={2026} week={9} />);
    await waitFor(() => {
      expect(screen.getByText(/No disagreements this week/)).toBeTruthy();
    });
  });
});
