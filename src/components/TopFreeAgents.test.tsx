// TopFreeAgents rendering: unrostered filtering, position tabs, error/retry,
// empty state.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { TopFreeAgents } from './TopFreeAgents';
import { fetchWeeklyPprPoints, type WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperWeeklyPoints', () => ({
  fetchWeeklyPprPoints: vi.fn(),
}));
const mockFetch = vi.mocked(fetchWeeklyPprPoints);

function skill(id: string, name: string, pos: string, team: string): PoolPlayer {
  return {
    id,
    name,
    team,
    pos,
    posRank: 10,
    overallRank: 60,
    tier: 3,
    bye: 7,
    baseValue: null,
    projPtsPpr: 120,
    sleeperId: `sid-${id}`,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [
    skill('rb1', 'Alpha Back', 'RB', 'DAL'),
    skill('rb2', 'Beta Back', 'RB', 'KC'),
    skill('qb1', 'Alpha Arm', 'QB', 'BUF'),
  ],
};

function weeklyFor(ids: string[], pts: number): WeeklyPprPoints {
  const pointsBySleeperId: Record<string, Record<number, number>> = {};
  const gamesBySleeperId: Record<string, number[]> = {};
  for (const id of ids) {
    pointsBySleeperId[`sid-${id}`] = {};
    for (let w = 1; w <= 8; w++) pointsBySleeperId[`sid-${id}`][w] = pts;
    gamesBySleeperId[`sid-${id}`] = [1, 2, 3, 4, 5, 6, 7, 8];
  }
  return { season: 2026, weeks: [1, 2, 3, 4, 5, 6, 7, 8], pointsBySleeperId, gamesBySleeperId };
}

function leaguePlayer(id: string, name: string): Player {
  return { id, name, position: 'RB', team: 'KC' } as Player;
}

function makeLeague(rostered: Player[] = []): League {
  const team: Team = { id: 't1', name: 'Managers', roster: rostered } as Team;
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

describe('TopFreeAgents', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue(weeklyFor(['rb1', 'rb2', 'qb1'], 12));
  });

  it('shows unrostered players and hides rostered ones on the default RB tab', async () => {
    render(<TopFreeAgents league={makeLeague([leaguePlayer('rb2', 'Beta Back')])} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Top free agents' });
    expect(within(section).getByText('Alpha Back')).toBeInTheDocument();
    // Beta Back is rostered by Managers — not a free agent.
    expect(within(section).queryByText('Beta Back')).not.toBeInTheDocument();
    // Table ranks on this week's projection with the matchup column.
    expect(within(section).getByRole('columnheader', { name: /Wk 9 Proj/ })).toBeInTheDocument();
  });

  it('swaps positions in place via the tab group', async () => {
    render(<TopFreeAgents league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Top free agents' });
    fireEvent.click(within(section).getByRole('button', { name: 'QB', pressed: false }));
    expect(within(section).getByText('Alpha Arm')).toBeInTheDocument();
    expect(within(section).queryByText('Alpha Back')).not.toBeInTheDocument();
  });

  it('shows an error with a retry button when the fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'));
    render(<TopFreeAgents league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Top free agents' });
    expect(await within(section).findByRole('alert')).toBeInTheDocument();
    const retry = within(section).getByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // The retry succeeds: the board renders.
    expect(await within(section).findByText('Alpha Back')).toBeInTheDocument();
  });

  it('shows the empty state when every startable player is rostered', async () => {
    render(
      <TopFreeAgents
        league={makeLeague([leaguePlayer('rb1', 'Alpha Back'), leaguePlayer('rb2', 'Beta Back')])}
        pool={pool}
      />,
    );
    const section = await screen.findByRole('region', { name: 'Top free agents' });
    expect(
      await within(section).findByText(/No unrostered RBs with a projection/i),
    ).toBeInTheDocument();
  });
});
