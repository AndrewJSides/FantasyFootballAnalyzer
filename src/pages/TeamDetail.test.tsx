// TeamDetail: the season Schedule section (backlog item 47).

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Team, WeeklyMatchup } from '@/types';
import { TeamDetail } from './TeamDetail';

function mkTeam(id: string, name: string, extra: Partial<Team> = {}): Team {
  return {
    id,
    name,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    roster: [],
    draftPicks: [],
    transactions: [],
    ...extra,
  } as Team;
}

function matchup(
  week: number,
  a: string,
  b: string,
  aPts = 0,
  bPts = 0,
): WeeklyMatchup {
  return { week, team1Id: a, team1Points: aPts, team2Id: b, team2Points: bPts };
}

const TEAMS = [
  mkTeam('a', 'Alpha', { wins: 2, losses: 0, pointsFor: 220 }),
  mkTeam('b', 'Bravo', { wins: 0, losses: 2, pointsFor: 180 }),
];

function league(): League {
  return {
    id: 'lg',
    platform: 'yahoo',
    name: 'League',
    season: 2026,
    draftType: 'snake',
    teams: TEAMS,
    matchups: [
      matchup(1, 'a', 'b', 110.5, 95.2),
      matchup(2, 'b', 'a', 84.8, 109.5),
    ],
    futureSchedule: [matchup(3, 'a', 'b')],
    status: 'live',
    currentWeek: 3,
  } as League;
}

describe('TeamDetail schedule section', () => {
  it('renders past results and upcoming opponents with win probabilities', () => {
    const lg = league();
    render(
      <MemoryRouter>
        <TeamDetail league={lg} team={TEAMS[0]} onBack={vi.fn()} />
      </MemoryRouter>,
    );
    const section = screen.getByRole('region', { name: 'Alpha season schedule' });
    expect(section).toBeTruthy();
    // Past games name the opponent with the score.
    expect(screen.getByText('110.5–95.2')).toBeTruthy();
    // Future game names the opponent with a win probability.
    const rows = section.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    expect(rows[2].textContent).toContain('Bravo');
    expect(rows[2].textContent).toContain('win probability');
    expect(screen.getByText('W1')).toBeTruthy();
    expect(screen.getByText('W3')).toBeTruthy();
  });
});
