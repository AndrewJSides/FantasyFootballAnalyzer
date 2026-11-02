// NextWeekTargets rendering: next-week pricing, unrostered filtering,
// position tabs, error/retry, empty state, end-of-season note.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { NextWeekTargets } from './NextWeekTargets';
import { fetchWeeklyPprPoints, type WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperWeeklyPoints', () => ({
  fetchWeeklyPprPoints: vi.fn(),
}));
const mockFetch = vi.mocked(fetchWeeklyPprPoints);

function skill(id: string, name: string, pos: string, team: string, bye = 7): PoolPlayer {
  return {
    id,
    name,
    team,
    pos,
    posRank: 10,
    overallRank: 60,
    tier: 3,
    bye,
    baseValue: null,
    projPtsPpr: 120,
    sleeperId: `sid-${id}`,
  } as PoolPlayer;
}

// rb-bye sits on bye in week 9 (the target week when currentWeek is 8) —
// he must not appear even though he scores.
const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [
    skill('rb1', 'Alpha Back', 'RB', 'DAL'),
    skill('rb2', 'Beta Back', 'RB', 'KC'),
    skill('rb-bye', 'Bye Week Back', 'RB', 'BUF', 9),
    skill('qb1', 'Alpha Arm', 'QB', 'BUF'),
  ],
};

function weeklyFor(ids: string[], pts: number): WeeklyPprPoints {
  const pointsBySleeperId: Record<string, Record<number, number>> = {};
  const gamesBySleeperId: Record<string, number[]> = {};
  for (const id of ids) {
    pointsBySleeperId[`sid-${id}`] = {};
    for (let w = 1; w <= 7; w++) pointsBySleeperId[`sid-${id}`][w] = pts;
    gamesBySleeperId[`sid-${id}`] = [1, 2, 3, 4, 5, 6, 7];
  }
  return { season: 2026, weeks: [1, 2, 3, 4, 5, 6, 7], pointsBySleeperId, gamesBySleeperId };
}

function leaguePlayer(id: string, name: string): Player {
  return { id, name, position: 'RB', team: 'KC' } as Player;
}

function makeLeague(rostered: Player[] = [], currentWeek = 8): League {
  const team: Team = { id: 't1', name: 'Managers', roster: rostered } as Team;
  return {
    id: 'lg',
    name: 'Test League',
    season: 2026,
    teams: [team],
    totalTeams: 1,
    currentWeek,
    isGuest: false,
  } as League;
}

describe('NextWeekTargets', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue(weeklyFor(['rb1', 'rb2', 'rb-bye', 'qb1'], 12));
  });

  it('prices the next week and excludes players on bye that week', async () => {
    render(<NextWeekTargets league={makeLeague([leaguePlayer('rb2', 'Beta Back')])} pool={pool} />);
    const section = await screen.findByRole('region', { name: "Next week's waiver targets" });
    expect(within(section).getByText('Alpha Back')).toBeInTheDocument();
    // Beta Back is rostered — not a target. Bye Week Back sits in week 9.
    expect(within(section).queryByText('Beta Back')).not.toBeInTheDocument();
    expect(within(section).queryByText('Bye Week Back')).not.toBeInTheDocument();
    // The board is priced on week 9, not the current week 8.
    expect(within(section).getByRole('columnheader', { name: /Wk 9 Proj/ })).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith(2026, 7);
  });

  it('swaps positions in place via the tab group', async () => {
    render(<NextWeekTargets league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: "Next week's waiver targets" });
    fireEvent.click(within(section).getByRole('button', { name: 'QB', pressed: false }));
    expect(within(section).getByText('Alpha Arm')).toBeInTheDocument();
    expect(within(section).queryByText('Alpha Back')).not.toBeInTheDocument();
  });

  it('shows an error with a retry button when the fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'));
    render(<NextWeekTargets league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: "Next week's waiver targets" });
    expect(await within(section).findByRole('alert')).toBeInTheDocument();
    const retry = within(section).getByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // The retry succeeds: the board renders.
    expect(await within(section).findByText('Alpha Back')).toBeInTheDocument();
  });

  it('shows the empty state when every startable player is rostered', async () => {
    render(
      <NextWeekTargets
        league={makeLeague([leaguePlayer('rb1', 'Alpha Back'), leaguePlayer('rb2', 'Beta Back')])}
        pool={pool}
      />,
    );
    const section = await screen.findByRole('region', { name: "Next week's waiver targets" });
    expect(
      await within(section).findByText(/No unrostered RBs with a projection for week 9/i),
    ).toBeInTheDocument();
  });

  it('shows the end-of-season note when the current week is 18', async () => {
    render(<NextWeekTargets league={makeLeague([], 18)} pool={pool} />);
    const section = await screen.findByRole('region', { name: "Next week's waiver targets" });
    expect(
      within(section).getByText(/no next week to rank/i),
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
