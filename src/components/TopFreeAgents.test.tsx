// TopFreeAgents rendering: unrostered filtering, position tabs, error/retry,
// empty state, and the per-player FAAB bid column (backlog item 5).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { TopFreeAgents } from './TopFreeAgents';
import { fetchWeeklyPprPoints, type WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';
import type { League, Team, Player, Transaction } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

vi.mock('@/api/sleeperWeeklyPoints', () => ({
  fetchWeeklyPprPoints: vi.fn(),
}));
const mockFetch = vi.mocked(fetchWeeklyPprPoints);

vi.mock('@/api/sleeperWeeklyProjections', () => ({
  fetchSleeperWeekProjections: vi.fn(),
}));
const mockSleeper = vi.mocked(fetchSleeperWeekProjections);

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
    mockSleeper.mockResolvedValue({});
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

// Per-player FAAB bid column: the same league-norms + need-priced engine as
// the FAAB Bid Guidance panel, priced for the selected team.
function waiverTx(
  teamId: string,
  week: number,
  bid: number,
  adds: Array<{ id: string; pos: string }>,
): Transaction {
  return {
    id: `${teamId}-w${week}`,
    type: 'waiver',
    timestamp: week,
    week,
    teamId,
    teamName: teamId,
    adds: adds.map(a => leaguePlayer(a.id, a.id)),
    drops: [],
    waiverBudgetSpent: bid,
  } as Transaction;
}

function makeBidsLeague(): League {
  const mine: Team = { id: 't1', name: 'Managers', isMyTeam: true, roster: [] } as Team;
  // Rivals spent their whole assumed $100 budget: their suggested bids are $0–$0.
  const rivals: Team = {
    id: 't2',
    name: 'Rivals',
    roster: [],
    transactions: [
      waiverTx('t2', 2, 60, [{ id: 'rb1', pos: 'RB' }]),
      waiverTx('t2', 3, 40, [{ id: 'rb2', pos: 'RB' }]),
    ],
  } as Team;
  return {
    id: 'lg',
    name: 'Test League',
    season: 2026,
    teams: [mine, rivals],
    totalTeams: 2,
    currentWeek: 9,
    isGuest: false,
  } as League;
}

describe('TopFreeAgents FAAB bid column', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue(weeklyFor(['rb1', 'rb2', 'qb1'], 12));
    mockSleeper.mockResolvedValue({});
  });

  it('renders a Bid column with suggested ranges when the league recorded FAAB bids', async () => {
    render(<TopFreeAgents league={makeBidsLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Top free agents' });
    // Column header with the accessible name.
    expect(within(section).getByRole('columnheader', { name: /Bid/ })).toBeInTheDocument();
    // Median winning bid is $50 (60, 40); value and need multipliers are 1,
    // so the band is $50 × 0.65–1.35 → $33–$68.
    const cell = within(section).getByRole('cell', {
      name: 'Suggested bid $33 to $68 for Alpha Back',
    });
    expect(cell).toHaveTextContent('$33–$68');
    expect(cell).toHaveAttribute('title');
    // The team picker prices bids for the selected team.
    expect(within(section).getByLabelText(/Pricing bids for/i)).toBeInTheDocument();
  });

  it('re-prices bids when the team changes: a spent budget gets $0–$0', async () => {
    render(<TopFreeAgents league={makeBidsLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Top free agents' });
    expect(
      await within(section).findByRole('cell', {
        name: 'Suggested bid $33 to $68 for Alpha Back',
      }),
    ).toBeInTheDocument();
    fireEvent.change(within(section).getByLabelText(/Pricing bids for/i), {
      target: { value: 't2' },
    });
    expect(
      within(section).getByRole('cell', {
        name: 'Suggested bid $0 to $0 for Alpha Back',
      }),
    ).toHaveTextContent('$0–$0');
  });

  it('hides the Bid column and pricing select when the league recorded no FAAB bids', async () => {
    render(<TopFreeAgents league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Top free agents' });
    await within(section).findByText('Alpha Back');
    expect(
      within(section).queryByRole('columnheader', { name: /Bid/ }),
    ).not.toBeInTheDocument();
    expect(
      within(section).queryByLabelText(/Pricing bids for/i),
    ).not.toBeInTheDocument();
  });
});

// Sleeper projection column (backlog item 128): Sleeper's own week-N number
// next to TraderApe's, with a dash where Sleeper published no line and a
// table-unaffecting dash state when the fetch fails.
describe('TopFreeAgents Sleeper projection column', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue(weeklyFor(['rb1', 'rb2', 'qb1'], 12));
    mockSleeper.mockResolvedValue({ 'sid-rb1': 14.2 });
  });

  it('renders a Sleeper column with values where Sleeper published a line', async () => {
    render(<TopFreeAgents league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Top free agents' });
    expect(within(section).getByRole('columnheader', { name: /Sleeper/ })).toBeInTheDocument();
    const cell = within(section).getByRole('cell', {
      name: 'Sleeper projection 14.2 for week 9',
    });
    expect(cell).toHaveTextContent('14.2');
  });

  it('shows a dash where Sleeper published no line for a player', async () => {
    render(<TopFreeAgents league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Top free agents' });
    await within(section).findByText('Alpha Back');
    expect(
      within(section).getByRole('cell', {
        name: 'No Sleeper projection for this player',
      }),
    ).toHaveTextContent('—');
  });

  it('leaves the table intact when the Sleeper fetch fails', async () => {
    mockSleeper.mockRejectedValueOnce(new Error('boom'));
    render(<TopFreeAgents league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Top free agents' });
    expect(await within(section).findByText('Alpha Back')).toBeInTheDocument();
    expect(within(section).getByRole('columnheader', { name: /Sleeper/ })).toBeInTheDocument();
    // Both free-agent rows dash — the failure never takes the table down.
    const cells = within(section).getAllByRole('cell', {
      name: 'Sleeper projection not loaded',
    });
    expect(cells).toHaveLength(2);
    for (const cell of cells) expect(cell).toHaveTextContent('—');
  });
});
