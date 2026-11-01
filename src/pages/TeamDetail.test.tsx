// TeamDetail: the season Schedule section (backlog item 47).

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    playoffTeams: 2,
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

describe('TeamDetail playoff scenarios (backlog item 72)', () => {
  // Bubble league: Alpha and Bravo race for the second playoff spot.
  function scenarioLeague(): League {
    const teams = [
      mkTeam('a', 'Alpha', { wins: 5, losses: 3, pointsFor: 1000 }),
      mkTeam('b', 'Bravo', { wins: 5, losses: 3, pointsFor: 900 }),
      mkTeam('c', 'Charlie', { wins: 8, losses: 0, pointsFor: 1200 }),
      mkTeam('d', 'Delta', { wins: 1, losses: 7, pointsFor: 800 }),
    ];
    return {
      id: 'lg2',
      platform: 'yahoo',
      name: 'League',
      season: 2026,
      draftType: 'snake',
      teams,
      matchups: [],
      futureSchedule: [
        matchup(9, 'a', 'b'),
        matchup(9, 'c', 'd'),
        matchup(10, 'a', 'd'),
        matchup(10, 'b', 'c'),
      ],
      status: 'live',
      currentWeek: 9,
      playoffTeams: 2,
    } as League;
  }

  function renderAlpha(lg: League) {
    return render(
      <MemoryRouter>
        <TeamDetail league={lg} team={lg.teams[0]} onBack={vi.fn()} />
      </MemoryRouter>,
    );
  }

  function scenarioOdds(): number {
    const text = screen
      .getByRole('region', { name: 'Alpha season schedule' })
      .textContent!;
    return parseFloat(text.match(/Playoffs: ([\d.]+)%/)![1]);
  }

  it('win-out preset prices the scenario against a modeled base', () => {
    renderAlpha(scenarioLeague());
    const section = screen.getByRole('region', { name: 'Alpha season schedule' });
    // Per-week force toggles have accessible names.
    const winBtn = screen.getByRole('button', {
      name: 'Force a win in week 9 against Bravo',
    });
    expect(winBtn).toHaveProperty('tagName', 'BUTTON');
    // No scenario panel before any pick.
    expect(section.textContent).not.toContain('Playoff scenario —');
    // Win-out forces Alpha's remaining games and shows the modeled result.
    fireEvent.click(screen.getByRole('button', { name: 'Win out' }));
    expect(section.textContent).toContain('Playoff scenario —');
    expect(section.textContent).toContain('2 of 2 remaining games picked');
    expect(section.textContent).toContain('modeled base');
    // The aria-live panel announces the result.
    expect(section.querySelector('[aria-live="polite"]')).toBeTruthy();
    // Clicking a picked toggle again unpicks that week only.
    fireEvent.click(winBtn);
    expect(section.textContent).toContain('1 of 2 remaining games picked');
    // Unpicking the last week clears the panel.
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Force a win in week 10 against Delta',
      }),
    );
    expect(section.textContent).not.toContain('Playoff scenario —');
  });

  it('lose-out preset drops the modeled playoff odds vs win-out', () => {
    const lg = scenarioLeague();
    const { unmount } = renderAlpha(lg);
    fireEvent.click(screen.getByRole('button', { name: 'Win out' }));
    const winOdds = scenarioOdds();
    unmount();
    renderAlpha(lg);
    fireEvent.click(screen.getByRole('button', { name: 'Lose out' }));
    const loseOdds = scenarioOdds();
    expect(loseOdds).toBeLessThan(winOdds);
    // Clear resets the panel.
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(
      screen.getByRole('region', { name: 'Alpha season schedule' }).textContent,
    ).not.toContain('Playoff scenario —');
  });
});
