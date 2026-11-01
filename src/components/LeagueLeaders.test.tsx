// LeagueLeaders rendering: position tabs, totals first, owner column in
// league mode, hidden without weekly data.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeagueLeaders } from './LeagueLeaders';
import type { WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

function player(id: string, name: string, pos: string, team: string): PoolPlayer {
  return {
    id,
    name,
    team,
    pos,
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: null,
    baseValue: null,
    sleeperId: `sid-${id}`,
  } as PoolPlayer;
}

function mkPool(): DraftPoolFile {
  return {
    season: 2026,
    generatedAt: 't',
    baseline: { budget: 200, teams: 10, rounds: 16 },
    players: [
      player('rb1', 'Runny Back', 'RB', 'DET'),
      player('rb2', 'Plodder Two', 'RB', 'KC'),
      player('qb1', 'Throwy Guy', 'QB', 'BUF'),
    ],
  };
}

function mkWeekly(): WeeklyPprPoints {
  const pts = {
    'sid-rb1': { 1: 20, 2: 24 },
    'sid-rb2': { 1: 12, 2: 10 },
    'sid-qb1': { 1: 28, 2: 30 },
  };
  return {
    season: 2026,
    weeks: [1, 2],
    pointsBySleeperId: pts,
    gamesBySleeperId: { 'sid-rb1': [1, 2], 'sid-rb2': [1, 2], 'sid-qb1': [1, 2] },
  };
}

describe('LeagueLeaders', () => {
  it('renders the default position leaders with totals first and owner flags', () => {
    render(
      <LeagueLeaders
        pool={mkPool()}
        weekly={mkWeekly()}
        currentWeek={3}
        ownerByPoolId={new Map([['rb1', 'Alpha']])}
      />,
    );
    expect(screen.getByRole('heading', { name: 'League Leaders' })).toBeInTheDocument();
    // Default tab is RB: Runny Back (44) ahead of Plodder Two (22).
    const table = screen.getByRole('table', { name: /season scoring leaders, rb/i });
    expect(table).toHaveTextContent('Runny Back');
    expect(table).toHaveTextContent('Alpha');
    expect(table).toHaveTextContent('Waivers');
    const rows = screen.getAllByRole('row');
    // header + 2 RB rows
    expect(rows).toHaveLength(3);
    expect(screen.getByText(/Biggest RB explosion/)).toHaveTextContent('Runny Back — 24 pts in week 2');
  });

  it('switches positions on tab click and announces the swap', () => {
    render(<LeagueLeaders pool={mkPool()} weekly={mkWeekly()} currentWeek={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'QB' }));
    expect(
      screen.getByRole('table', { name: /season scoring leaders, qb/i }),
    ).toHaveTextContent('Throwy Guy');
    // Guest mode: no Owner column.
    expect(screen.queryByRole('columnheader', { name: 'Owner' })).not.toBeInTheDocument();
  });

  it('hides entirely without weekly data', () => {
    const { container } = render(
      <LeagueLeaders pool={mkPool()} weekly={undefined} currentWeek={3} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
