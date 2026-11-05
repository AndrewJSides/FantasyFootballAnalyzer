// OpportunityWatch rendering: candidates from mocked Sleeper usage,
// rostered exclusion in league mode, empty state, method footnote.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { OpportunityWatch } from './OpportunityWatch';
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

function line(offSnaps: number, teamSnaps: number, targets = 0) {
  return { offSnaps, teamSnaps, targets, rushAtt: 0, receptions: 0, rzOpps: 0, airYards: 0, deepRec: 0, longRec: 0, yac: 0, recYards: 0, rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0 };
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
    currentWeek: 8,
    isGuest: false,
  } as League;
}

beforeEach(() => {
  mockFetchUsage.mockReset();
  // Weeks 5-7 completed (current week 8). Alpha: 70% snaps, 25% of team
  // targets. Beta: 20% snaps. Gamma: 70% snaps.
  mockFetchUsage.mockResolvedValue({
    season: 2026,
    weeks: [5, 6, 7],
    usageBySleeperId: {
      a: { 5: line(49, 70, 9), 6: line(49, 70, 9), 7: line(49, 70, 9) },
      b: { 5: line(14, 70, 2), 6: line(14, 70, 2), 7: line(14, 70, 2) },
      c: { 5: line(49, 70, 3), 6: line(49, 70, 3), 7: line(49, 70, 3) },
    },
  });
});

describe('OpportunityWatch', () => {
  it('renders high-usage candidates and skips the low-usage player', async () => {
    render(<OpportunityWatch league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Opportunity watch' });
    expect(within(section).getByText('Alpha Receiver')).toBeInTheDocument();
    expect(within(section).getByText('Gamma Receiver')).toBeInTheDocument();
    // Beta Receiver: 20% snaps — not an opportunity.
    expect(within(section).queryByText('Beta Receiver')).not.toBeInTheDocument();
    // Snap % column shows 70%.
    expect(within(section).getAllByText('70%').length).toBeGreaterThanOrEqual(2);
    // Target % column shows 64% for Alpha (27 of 42 team targets).
    expect(within(section).getByText('64%')).toBeInTheDocument();
  });

  it('excludes rostered players in league mode', async () => {
    const league = makeLeague([leaguePlayer('a', 'Alpha Receiver')]);
    render(<OpportunityWatch league={league} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Opportunity watch' });
    expect(within(section).queryByText('Alpha Receiver')).not.toBeInTheDocument();
    expect(within(section).getByText('Gamma Receiver')).toBeInTheDocument();
  });

  it('shows the empty state when nobody is earning a role', async () => {
    mockFetchUsage.mockResolvedValue({
      season: 2026,
      weeks: [5, 6, 7],
      usageBySleeperId: {
        a: { 5: line(14, 70), 6: line(14, 70), 7: line(14, 70) },
      },
    });
    render(<OpportunityWatch league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Opportunity watch' });
    expect(
      within(section).getByText(/No opportunity candidates right now/),
    ).toBeInTheDocument();
  });

  it('shows the error state with retry when the fetch fails', async () => {
    mockFetchUsage.mockRejectedValue(new Error('network down'));
    render(<OpportunityWatch league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Opportunity watch' });
    expect(
      within(section).getByText(/Couldn't load weekly usage/),
    ).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('carries the method footnote', async () => {
    render(<OpportunityWatch league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Opportunity watch' });
    expect(within(section).getByText(/minimum 2 games/i)).toBeInTheDocument();
  });
});
