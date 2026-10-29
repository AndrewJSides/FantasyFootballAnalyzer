// RB Handcuff Report rendering: rows from a synthetic pool, ownership
// statuses, owners hidden in guest mode, footnote present.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { HandcuffReport } from './HandcuffReport';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

function rb(
  id: string,
  name: string,
  team: string,
  posRank: number,
  overallRank: number,
  depthChartOrder: number
): PoolPlayer {
  return {
    id,
    name,
    team,
    pos: 'RB',
    posRank,
    overallRank,
    tier: 1,
    bye: 7,
    baseValue: null,
    projPtsPpr: 88.4,
    depthChartOrder,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [
    rb('dal1', 'Dal Lead', 'DAL', 1, 5, 1),
    rb('dal2', 'Dal Cuff', 'DAL', 2, 45, 2),
    rb('gb1', 'Gb Lead', 'GB', 1, 12, 1),
    rb('gb2', 'Gb Cuff', 'GB', 2, 60, 2),
  ],
};

function leaguePlayer(id: string, name: string): Player {
  // The pool index resolves by id first, so synthetic league entries can
  // reuse pool ids.
  return { id, platformId: '', name, position: 'RB', team: '' };
}

function leagueWithOwners(): League {
  const teamA: Team = {
    id: 't1',
    name: 'Team A',
    roster: [leaguePlayer('dal1', 'Dal Lead'), leaguePlayer('dal2', 'Dal Cuff')],
  } as Team;
  const teamB: Team = {
    id: 't2',
    name: 'Team B',
    roster: [leaguePlayer('gb1', 'Gb Lead')],
  } as Team;
  return { teams: [teamA, teamB], currentWeek: 8 } as League;
}

describe('HandcuffReport', () => {
  it('renders one row per backfield with secured and available statuses', () => {
    render(<HandcuffReport league={leagueWithOwners()} pool={pool} />);
    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rows).toHaveLength(2);

    const dalRow = rows.find(r =>
      within(r).getByRole('rowheader').textContent?.includes('Dal Lead')
    );
    expect(dalRow).toBeDefined();
    expect(within(dalRow!).getByText(/secured/i)).toBeInTheDocument();
    expect(within(dalRow!).getAllByText('Team A')).toHaveLength(2);

    const gbRow = rows.find(r =>
      within(r).getByRole('rowheader').textContent?.includes('Gb Lead')
    );
    expect(gbRow).toBeDefined();
    expect(within(gbRow!).getByText(/available on waivers/i)).toBeInTheDocument();
  });

  it('marks a handcuff held by another team as rival-held', () => {
    const league = leagueWithOwners();
    (league.teams as Team[]).push({
      id: 't3',
      name: 'Team C',
      roster: [leaguePlayer('gb2', 'Gb Cuff')],
    } as Team);
    render(<HandcuffReport league={league} pool={pool} />);
    expect(screen.getByText(/held by team c/i)).toBeInTheDocument();
  });

  it('hides owners in guest mode and shows the footnote', () => {
    render(<HandcuffReport league={{ teams: [], currentWeek: 8 } as League} pool={pool} />);
    expect(screen.queryByText('Team A')).not.toBeInTheDocument();
    expect(screen.getAllByText(/ownership unknown/i)).toHaveLength(2);
    expect(screen.getByText(/nothing here moves a roster/i)).toBeInTheDocument();
  });
});
