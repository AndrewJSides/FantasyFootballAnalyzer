// BreakoutWatch rendering: league-mode candidates from playerWeeklyPoints,
// empty state, rostered exclusion.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BreakoutWatch } from './BreakoutWatch';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

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

// Baseline weeks 1-5, recent weeks 6-8, current week 9. Keyed by pool id
// (no platform ids when nobody is rostered — the lookup falls back to
// sleeperId/pool id).
const weekly: Record<string, Record<number, number>> = {
  'a': { 1: 4, 2: 5, 3: 6, 4: 5, 5: 6, 6: 18, 7: 16, 8: 20 },
  'b': { 1: 14, 2: 14, 3: 14, 4: 14, 5: 14, 6: 14, 7: 14, 8: 14 },
  'c': { 1: 4, 2: 5, 3: 6, 4: 5, 5: 6, 6: 18, 7: 16, 8: 20 },
};

function leaguePlayer(id: string, platformId: string, name: string): Player {
  return { id, platformId, name, position: 'WR', team: 'DAL' };
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
    playerWeeklyPoints: weekly,
    isGuest: false,
  } as League;
}

describe('BreakoutWatch', () => {
  it('renders breakout candidates from the league weekly points', async () => {
    render(<BreakoutWatch league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Breakout watch' });
    expect(within(section).getByText('Alpha Receiver')).toBeInTheDocument();
    expect(within(section).getByText('Gamma Receiver')).toBeInTheDocument();
    // Beta Receiver: flat 14s — not a breakout.
    expect(within(section).queryByText('Beta Receiver')).not.toBeInTheDocument();
    // Surge column shows 3.5x.
    expect(within(section).getAllByText('3.5x')).toHaveLength(2);
  });

  it('excludes rostered players in league mode', async () => {
    const league = makeLeague([leaguePlayer('a', 'a', 'Alpha Receiver')]);
    render(<BreakoutWatch league={league} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Breakout watch' });
    expect(within(section).queryByText('Alpha Receiver')).not.toBeInTheDocument();
    expect(within(section).getByText('Gamma Receiver')).toBeInTheDocument();
  });

  it('shows the empty state when nobody is surging', async () => {
    const flatSeries = { 1: 14, 2: 14, 3: 14, 4: 14, 5: 14, 6: 14, 7: 14, 8: 14 };
    const flat = { a: flatSeries, b: flatSeries, c: flatSeries };
    const league = makeLeague();
    league.playerWeeklyPoints = flat;
    render(<BreakoutWatch league={league} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Breakout watch' });
    expect(
      within(section).getByText(/No breakout candidates right now/),
    ).toBeInTheDocument();
  });

  it('carries the method footnote', async () => {
    render(<BreakoutWatch league={makeLeague()} pool={pool} />);
    const section = await screen.findByRole('region', { name: 'Breakout watch' });
    expect(within(section).getByText(/minimum 3 earlier games/i)).toBeInTheDocument();
  });
});
