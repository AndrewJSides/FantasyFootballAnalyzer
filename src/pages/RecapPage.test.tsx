// RecapPage rendering: the default recap picks the latest completed week,
// the week selector swaps the story in place (aria-live region), and an
// empty league shows the graceful empty state.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Team } from '@/types';
import { RecapPage } from './RecapPage';

function mkTeam(id: string, name: string, wins: number, losses: number): Team {
  return {
    id,
    name,
    roster: [
      { id: 'p1', platformId: 'p1', name: 'Hero Back', position: 'RB', team: 'NFL' },
      { id: 'p2', platformId: 'p2', name: 'Mid Guy', position: 'WR', team: 'NFL' },
    ],
    draftPicks: [],
    wins,
    losses,
    ties: 0,
    pointsFor: 0,
  } as Team;
}

function league(): League {
  const alpha = mkTeam('t1', 'Alpha', 2, 1);
  const beta = mkTeam('t2', 'Beta', 1, 2);
  alpha.draftPicks = [
    {
      pickNumber: 8,
      round: 1,
      player: { id: 'bust', platformId: 'bust', name: 'Bust Guy', position: 'RB', team: 'NFL' },
      teamId: 't1',
      teamName: 'Alpha',
      seasonPoints: 40,
    },
  ] as Team['draftPicks'];
  beta.draftPicks = [
    {
      pickNumber: 64,
      round: 8,
      player: { id: 'steel', platformId: 'steel', name: 'Steel Find', position: 'RB', team: 'NFL' },
      teamId: 't2',
      teamName: 'Beta',
      seasonPoints: 160,
    },
    {
      pickNumber: 65,
      round: 9,
      player: { id: 'avg', platformId: 'avg', name: 'Average Joe', position: 'RB', team: 'NFL' },
      teamId: 't2',
      teamName: 'Beta',
      seasonPoints: 80,
    },
  ] as Team['draftPicks'];
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    season: 2026,
    draftType: 'snake',
    teams: [alpha, beta],
    matchups: [
      { week: 1, team1Id: 't1', team1Points: 150, team2Id: 't2', team2Points: 100 },
      { week: 2, team1Id: 't1', team1Points: 120, team2Id: 't2', team2Points: 110 },
      { week: 3, team1Id: 't1', team1Points: 90, team2Id: 't2', team2Points: 140 },
    ],
    playerWeeklyPoints: {
      p1: { 1: 10, 2: 11, 3: 30 }, // big week 3 vs a ~10.5 projection
      p2: { 1: 20, 2: 21, 3: 5 }, // big week-3 miss
    },
    scoringType: 'ppr',
    totalTeams: 2,
    currentWeek: 4,
    status: 'live',
    isLoaded: true,
  } as League;
}

function renderPage(l: League) {
  return render(
    <MemoryRouter>
      <RecapPage league={l} />
    </MemoryRouter>,
  );
}

describe('RecapPage', () => {
  it('opens on the latest completed week with a headline', () => {
    renderPage(league());
    // Week 3: 140-90 is a 50-point blowout.
    expect(screen.getByRole('heading', { name: /Week 3: Beta massacres Alpha/ })).toBeTruthy();
    const select = screen.getByLabelText('Week') as HTMLSelectElement;
    expect(select.value).toBe('3');
    expect(within(select).getAllByRole('option')).toHaveLength(3);
  });

  it('grades players against the TraderApe projection', () => {
    renderPage(league());
    const section = screen.getByRole('region', { name: "Against TraderApe's projection" });
    expect(within(section).getByText('Hero Back')).toBeTruthy();
    expect(within(section).getByText('Mid Guy')).toBeTruthy();
  });

  it('names the weekly lucky escape and cruel beat', () => {
    renderPage(league());
    const section = screen.getByRole('region', { name: 'Luck' });
    // Week 3's only game: Beta won big (not an escape), Alpha lost big.
    expect(within(section).getByText('Cruelest beat')).toBeTruthy();
  });

  it('names the best and worst draft picks to date', () => {
    renderPage(league());
    const section = screen.getByRole('region', { name: 'Draft picks to date' });
    expect(within(section).getByText('Steel Find')).toBeTruthy();
    expect(within(section).getByText('Bust Guy')).toBeTruthy();
  });

  it('swapping the week re-renders the story', () => {
    renderPage(league());
    const select = screen.getByLabelText('Week') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '1' } });
    // Week 1: 150-100, another 50-point blowout, the other way.
    expect(screen.getByRole('heading', { name: /Week 1: Alpha massacres Beta/ })).toBeTruthy();
  });

  it('shows an empty state before week 1', () => {
    const l = league();
    l.matchups = [];
    renderPage(l);
    expect(screen.getByText(/No completed weeks yet/)).toBeTruthy();
  });
});
