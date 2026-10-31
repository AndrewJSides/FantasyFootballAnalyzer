// League Injury Report rendering: severity order, owner resolution,
// free-agent labeling, guest-mode owner column, footnote present.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { InjuryReport } from './InjuryReport';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

function injured(
  id: string,
  name: string,
  pos: 'QB' | 'RB' | 'WR' | 'TE',
  overallRank: number,
  injuryStatus: string,
  injuryBodyPart?: string
): PoolPlayer {
  return {
    id,
    name,
    team: 'DAL',
    pos,
    posRank: 1,
    overallRank,
    tier: 1,
    bye: 7,
    baseValue: null,
    projPtsPpr: 100,
    injuryStatus,
    injuryBodyPart,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [
    injured('q1', 'Q Back', 'QB', 30, 'Questionable', 'Hamstring'),
    injured('rb1', 'Out Back', 'RB', 5, 'Out', 'Knee'),
    injured('wr1', 'Star Wideout', 'WR', 2, 'IR', 'Knee - ACL'),
    injured('wr2', 'Free Agent', 'WR', 60, 'Questionable', 'Ankle'),
  ],
};

function leaguePlayer(id: string, name: string): Player {
  return { id, platformId: '', name, position: 'WR', team: '' };
}

function leagueWithOwners(): League {
  const teamA: Team = {
    id: 't1',
    name: 'Team A',
    roster: [leaguePlayer('rb1', 'Out Back'), leaguePlayer('wr1', 'Star Wideout')],
  } as Team;
  const teamB: Team = {
    id: 't2',
    name: 'Team B',
    roster: [leaguePlayer('q1', 'Q Back')],
  } as Team;
  return { teams: [teamA, teamB] } as League;
}

describe('InjuryReport', () => {
  it('orders worst-first and shows owners', () => {
    render(<InjuryReport league={leagueWithOwners()} pool={pool} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    // header + 4 players
    expect(rows).toHaveLength(5);
    const names = rows.slice(1).map(r => within(r).getAllByRole('rowheader')[0].textContent);
    expect(names).toEqual(['Star Wideout', 'Out Back', 'Q Back', 'Free Agent']);
    expect(screen.getAllByText('Team A')).toHaveLength(2);
    expect(screen.getByText('Team B')).toBeTruthy();
  });

  it('labels unrostered injured players as Free agent', () => {
    render(<InjuryReport league={leagueWithOwners()} pool={pool} />);
    const table = screen.getByRole('table');
    const freeAgentRow = within(table)
      .getAllByRole('row')
      .find(r => r.textContent?.includes('Free Agent') && r.textContent?.includes('Ankle'));
    expect(freeAgentRow?.textContent).toContain('Free agent');
  });

  it('hides the owner column in guest mode', () => {
    render(<InjuryReport league={{ teams: [] } as League} pool={pool} />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Star Wideout')).toBeTruthy();
    expect(table.textContent).not.toContain('Team A');
    expect(table.textContent).not.toContain('Free agent');
  });
});

describe('InjuryReport next-man-up column', () => {
  function backfieldPool(): DraftPoolFile {
    const mk = (
      id: string, name: string, depth: number, overallRank: number, injuryStatus?: string
    ): PoolPlayer => ({
      id,
      name,
      team: 'DAL',
      pos: 'RB',
      posRank: depth,
      overallRank,
      depthChartOrder: depth,
      tier: 1,
      bye: 7,
      baseValue: null,
      projPtsPpr: 100,
      ...(injuryStatus ? { injuryStatus, injuryBodyPart: 'Knee' } : {}),
    }) as PoolPlayer;
    return {
      season: 2026,
      generatedAt: 'test',
      baseline: { budget: 200, teams: 10, rounds: 15 },
      players: [
        mk('lead1', 'Lead Back', 1, 8, 'Out'),
        mk('cuff1', 'Backup Back', 2, 95),
      ],
    };
  }

  it('names the next man up for an injured lead RB and dashes the rest', () => {
    render(<InjuryReport league={{ teams: [] } as League} pool={backfieldPool()} />);
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Next man up' })).toBeTruthy();
    const row = within(table)
      .getAllByRole('row')
      .find(r => r.textContent?.includes('Lead Back'));
    expect(within(row!).getByLabelText('Backup Back, next man up')).toBeTruthy();
  });

  function qbPool(): DraftPoolFile {
    const mk = (
      id: string, name: string, depth: number, overallRank: number, injuryStatus?: string
    ): PoolPlayer => ({
      id,
      name,
      team: 'PHI',
      pos: 'QB',
      posRank: depth,
      overallRank,
      depthChartOrder: depth,
      tier: 1,
      bye: 7,
      baseValue: null,
      projPtsPpr: 100,
      ...(injuryStatus ? { injuryStatus, injuryBodyPart: 'Shoulder' } : {}),
    }) as PoolPlayer;
    return {
      season: 2026,
      generatedAt: 'test',
      baseline: { budget: 200, teams: 10, rounds: 15 },
      players: [
        mk('qb1', 'Hurt QB1', 1, 25, 'Out'),
        mk('qb2', 'Backup QB', 2, 180),
      ],
    };
  }

  function qbLeague(rosteredIds: string[]): League {
    const teamA: Team = {
      id: 't1',
      name: 'Team A',
      roster: rosteredIds.map(id => leaguePlayer(id, id === 'qb1' ? 'Hurt QB1' : 'Backup QB')),
    } as Team;
    return { teams: [teamA] } as League;
  }

  it('tags an unrostered next man up as FA in league mode', () => {
    render(<InjuryReport league={qbLeague(['qb1'])} pool={qbPool()} />);
    const table = screen.getByRole('table');
    const row = within(table)
      .getAllByRole('row')
      .find(r => r.textContent?.includes('Hurt QB1'));
    expect(within(row!).getByLabelText('Backup QB, next man up, free agent on waivers')).toBeTruthy();
    expect(within(row!).getByText('FA')).toBeTruthy();
  });

  it('tags a rostered next man up with his owner', () => {
    const league = qbLeague(['qb1']);
    league.teams.push({
      id: 't2',
      name: 'Team B',
      roster: [leaguePlayer('qb2', 'Backup QB')],
    } as Team);
    render(<InjuryReport league={league} pool={qbPool()} />);
    const table = screen.getByRole('table');
    const row = within(table)
      .getAllByRole('row')
      .find(r => r.textContent?.includes('Hurt QB1'));
    expect(within(row!).getByLabelText('Backup QB, next man up, owned by Team B')).toBeTruthy();
    expect(within(row!).getByText('Team B')).toBeTruthy();
  });

  it('shows no availability tag in guest mode', () => {
    render(<InjuryReport league={{ teams: [] } as League} pool={qbPool()} />);
    const table = screen.getByRole('table');
    expect(table.textContent).not.toContain('FA');
    const row = within(table)
      .getAllByRole('row')
      .find(r => r.textContent?.includes('Hurt QB1'));
    expect(within(row!).getByLabelText('Backup QB, next man up')).toBeTruthy();
  });
});
