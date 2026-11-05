// UsageRisers rendering: risers from mocked Sleeper usage, rostered
// exclusion in league mode, empty state, method footnote.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { UsageRisers } from './UsageRisers';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperUsage', () => ({ fetchWeeklyUsage: vi.fn() }));
const mockFetchUsage = vi.mocked(fetchWeeklyUsage);

function wr(id: string, name: string): PoolPlayer {
  return {
    id,
    name,
    team: 'DAL',
    pos: 'WR',
    posRank: 20,
    overallRank: 80,
    tier: 3,
    bye: 7,
    baseValue: null,
    projPtsPpr: 100,
    sleeperId: id,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [wr('a', 'Alpha Receiver'), wr('b', 'Beta Receiver'), wr('c', 'Gamma Receiver')],
};

function line(offSnaps: number, teamSnaps: number) {
  return { offSnaps, teamSnaps, targets: 0, rushAtt: 0, receptions: 0, rzOpps: 0 };
}

function leaguePlayer(id: string, name: string): Player {
  return { id, name, position: 'WR', team: 'DAL' };
}

function makeLeague(rostered: Player[] = []): League {
  const team: Team = {
    id: 't1',
    name: 'Managers',
    roster: rostered,
  } as Team;
  return {
    id: 'lg',
    name: 'Test League',
    season: 2026,
    teams: [team],
    totalTeams: 1,
    currentWeek: 9,
    isGuest: false,
  } as League;
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // Current week 9: recent window = weeks 6-8, earlier = weeks 1-5.
  // Alpha: 29% earlier -> 86% recent (riser). Beta: flat 86% (no jump).
  // Gamma: 14% earlier -> 40% recent (riser, at the floor).
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [1, 2, 6, 7, 8],
    usageBySleeperId: {
      a: { 1: line(20, 70), 2: line(20, 70), 6: line(60, 70), 7: line(60, 70), 8: line(60, 70) },
      b: { 1: line(60, 70), 2: line(60, 70), 6: line(60, 70), 7: line(60, 70), 8: line(60, 70) },
      c: { 1: line(10, 70), 2: line(10, 70), 6: line(28, 70), 7: line(28, 70), 8: line(28, 70) },
    },
  });
});

describe('UsageRisers', () => {
  it('renders risers and skips the flat player', async () => {
    render(<UsageRisers league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Usage risers' });
    expect(within(section).getByText('Alpha Receiver')).toBeInTheDocument();
    expect(within(section).getByText('Gamma Receiver')).toBeInTheDocument();
    // Beta Receiver: 86% all season — high role, no jump.
    expect(within(section).queryByText('Beta Receiver')).not.toBeInTheDocument();
    // Alpha's change column: +57 pts (86% - 29%).
    expect(within(section).getByText('+57 pts')).toBeInTheDocument();
  });

  it('excludes rostered players in league mode', async () => {
    const league = makeLeague([leaguePlayer('a', 'Alpha Receiver')]);
    render(<UsageRisers league={league} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Usage risers' });
    expect(within(section).queryByText('Alpha Receiver')).not.toBeInTheDocument();
    expect(within(section).getByText('Gamma Receiver')).toBeInTheDocument();
  });

  it('shows the empty state when nobody jumped', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [1, 2, 6, 7, 8],
      usageBySleeperId: {
        a: { 1: line(60, 70), 2: line(60, 70), 6: line(60, 70), 7: line(60, 70), 8: line(60, 70) },
      },
    });
    render(<UsageRisers league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Usage risers' });
    expect(
      within(section).getByText(/No usage risers right now/),
    ).toBeInTheDocument();
  });

  it('carries the method footnote', async () => {
    render(<UsageRisers league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Usage risers' });
    expect(within(section).getByText(/minimum 2 games/i)).toBeInTheDocument();
  });
});
