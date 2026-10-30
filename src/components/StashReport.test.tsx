// Waiver Stash Report rendering: stash rows with reasons, roster
// exclusion, empty state, guest-mode availability.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { StashReport } from './StashReport';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

function poolPlayer(over: Partial<PoolPlayer>): PoolPlayer {
  return {
    id: 'p1',
    name: 'Test Player',
    team: 'KC',
    pos: 'RB',
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: 8,
    baseValue: null,
    ...over,
  };
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    poolPlayer({ id: 'rb1', name: 'Lead Back', pos: 'RB', overallRank: 10, projPtsPpr: 240, team: 'DAL', depthChartOrder: 1 }),
    poolPlayer({ id: 'rb2', name: 'Backup', pos: 'RB', overallRank: 40, projPtsPpr: 130, team: 'DAL', depthChartOrder: 2 }),
    poolPlayer({ id: 'wr1', name: 'Hurt Wideout', pos: 'WR', overallRank: 15, projPtsPpr: 250,
      injuryStatus: 'Questionable', injuryBodyPart: 'Hamstring', bye: 10 }),
    poolPlayer({ id: 'wr2', name: 'Bye Wideout', pos: 'WR', overallRank: 18, projPtsPpr: 230, bye: 9 }),
    poolPlayer({ id: 'wr3', name: 'Plain Wideout', pos: 'WR', overallRank: 20, projPtsPpr: 220, bye: 10 }),
  ],
};

function leaguePlayer(id: string, name: string, position: string): Player {
  return { id, platformId: '', name, position, team: '' };
}

function liveLeague(rosters: Player[][] = []): League {
  const teams = rosters.map((roster, i) => ({ id: `t${i}`, name: `Team ${i}`, roster }) as Team);
  return { teams, status: 'live', currentWeek: 9, scoringType: 'ppr' } as League;
}

describe('StashReport', () => {
  it('renders available stash rows with their cheap-now reasons', () => {
    render(<StashReport league={liveLeague()} pool={pool} />);
    const rows = screen.getAllByRole('row').slice(1);
    const names = rows.map(r => within(r).getByRole('rowheader').textContent);
    expect(names.some(t => t?.includes('Backup'))).toBe(true);
    expect(names.some(t => t?.includes('Hurt Wideout'))).toBe(true);
    expect(names.some(t => t?.includes('Bye Wideout'))).toBe(true);
    expect(names.some(t => t?.includes('Plain Wideout'))).toBe(false);

    const cuffRow = rows.find(r => within(r).getByRole('rowheader').textContent?.includes('Backup'));
    expect(within(cuffRow!).getByText('Handcuff')).toBeInTheDocument();
    const hurtRow = rows.find(r => within(r).getByRole('rowheader').textContent?.includes('Hurt Wideout'));
    expect(within(hurtRow!).getByText('Injury return')).toBeInTheDocument();
    const byeRow = rows.find(r => within(r).getByRole('rowheader').textContent?.includes('Bye Wideout'));
    expect(within(byeRow!).getByText('Bye discount')).toBeInTheDocument();
  });

  it('excludes rostered players and shows the footnote', () => {
    const league = liveLeague([
      [leaguePlayer('rb2', 'Backup', 'RB'), leaguePlayer('wr1', 'Hurt Wideout', 'WR'), leaguePlayer('wr2', 'Bye Wideout', 'WR')],
    ]);
    render(<StashReport league={league} pool={pool} />);
    expect(screen.getByText(/no stash candidates/i)).toBeInTheDocument();
    expect(screen.getByText(/waiver research only/i)).toBeInTheDocument();
  });

  it('treats everything as available in guest mode', () => {
    render(<StashReport league={{ teams: [] } as League} pool={pool} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    expect(screen.queryByText('Team 0')).not.toBeInTheDocument();
  });

  it('shows the ROS positional rank per row', () => {
    render(<StashReport league={liveLeague()} pool={pool} />);
    const rows = screen.getAllByRole('row').slice(1);
    const hurtRow = rows.find(r => within(r).getByRole('rowheader').textContent?.includes('Hurt Wideout'));
    const cells = within(hurtRow!).getAllByRole('cell');
    // ROS rank cell reads like "WR1".
    expect(cells.some(c => /^WR\d+$/.test(c.textContent ?? ''))).toBe(true);
  });
});
