// TeamsPage playoff race: the section renders with remaining schedule, SOS
// and odds when the sync fetched a future schedule, and hides without one.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TeamsPage } from './TeamsPage';
import type { League, Player, Team, WeeklyMatchup } from '@/types';

function team(
  id: string,
  name: string,
  wins: number,
  losses: number,
  pointsFor: number,
): Team {
  return { id, name, wins, losses, ties: 0, pointsFor } as Team;
}

function matchup(week: number, a: string, b: string): WeeklyMatchup {
  return { week, team1Id: a, team1Points: 0, team2Id: b, team2Points: 0 };
}

function league(overrides: Partial<League> = {}): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    draftType: 'snake',
    scoringType: 'ppr',
    totalTeams: 4,
    isLoaded: true,
    teams: [
      team('A', 'Alpha', 8, 0, 1200),
      team('B', 'Beta', 6, 2, 1000),
      team('C', 'Gamma', 3, 5, 900),
      team('D', 'Delta', 1, 7, 800),
    ],
    currentWeek: 9,
    playoffTeams: 2,
    futureSchedule: [
      matchup(9, 'A', 'D'),
      matchup(9, 'B', 'C'),
      matchup(10, 'A', 'D'),
      matchup(10, 'B', 'C'),
    ],
    ...overrides,
  } as League;
}

function renderPage(leagueArg: League) {
  return render(
    <MemoryRouter>
      <TeamsPage league={leagueArg} />
    </MemoryRouter>,
  );
}

describe('TeamsPage team injuries', () => {
  // Injury summary: TeamsPage takes a pool override (bundled pool carries
  // live Sleeper designations, unsuitable for assertions).
  const mkPool = (): import('@/types/draft').DraftPoolFile => {
    const player = (
      id: string,
      name: string,
      pos: 'QB' | 'RB' | 'WR' | 'TE',
      injury?: { injuryStatus: string; injuryBodyPart?: string },
    ): import('@/types/draft').PoolPlayer =>
      ({
        id,
        name,
        team: 'DAL',
        pos,
        posRank: 1,
        overallRank: 10,
        tier: 1,
        bye: 7,
        baseValue: null,
        projPtsPpr: 100,
        ...injury,
      }) as import('@/types/draft').PoolPlayer;
    return {
      season: 2026,
      generatedAt: 'test',
      baseline: { budget: 200, teams: 10, rounds: 15 },
      players: [
        player('wr1', 'Star Wideout', 'WR', { injuryStatus: 'IR', injuryBodyPart: 'Knee - ACL' }),
        player('q1', 'Q Back', 'QB', { injuryStatus: 'Questionable', injuryBodyPart: 'Hamstring' }),
        player('te1', 'Healthy Tight', 'TE'),
      ],
    };
  };

  const injuredLeague = (): League => {
    const mkRosterPlayer = (id: string, name: string, pos: string): Player =>
      ({ id, name, position: pos, team: 'DAL' }) as Player;
    const l = league();
    l.teams = l.teams.slice(0, 3).map(t => {
      if (t.id === 'A') {
        return { ...t, roster: [mkRosterPlayer('wr1', 'Star Wideout', 'WR')] };
      }
      if (t.id === 'B') {
        return { ...t, roster: [mkRosterPlayer('q1', 'Q Back', 'QB')] };
      }
      return { ...t, roster: [mkRosterPlayer('te1', 'Healthy Tight', 'TE')] };
    });
    return l;
  };

  const renderInjured = () =>
    render(
      <MemoryRouter>
        <TeamsPage league={injuredLeague()} pool={mkPool()} />
      </MemoryRouter>,
    );

  it('renders each team\'s injured players, worst severity first', () => {
    renderInjured();
    expect(screen.getByRole('heading', { name: 'Team Injuries' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /team injury summary/i })).toBeInTheDocument();
    // Alpha's star (IR, season-ending) sorts ahead of Beta's questionable QB.
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Alpha');
    expect(rows[1]).toHaveTextContent(/Star Wideout/);
    expect(rows[2]).toHaveTextContent('Beta');
    // Gamma's tight end is healthy: all clear.
    expect(rows[3]).toHaveTextContent('Gamma');
    expect(rows[3]).toHaveTextContent('All clear');
    // Full injury detail is in the accessible label.
    expect(screen.getByLabelText(/Star Wideout: Season-ending, Knee - ACL/)).toBeInTheDocument();
  });

  it('hides the section when teams have no rosters', () => {
    renderPage(league());
    expect(screen.queryByRole('heading', { name: 'Team Injuries' })).not.toBeInTheDocument();
  });
});

describe('TeamsPage playoff race', () => {
  it('renders remaining schedule, SOS rank, and odds when the schedule exists', () => {
    renderPage(league());
    expect(
      screen.getByRole('heading', { name: 'Playoff Race' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: /playoff race/i }),
    ).toBeInTheDocument();
    // Alpha's two remaining games are both vs Delta, each with a
    // game-by-game win probability from the same Monte Carlo.
    expect(
      screen.getByText(/W9 Delta [\d.]+% · W10 Delta [\d.]+%/),
    ).toBeInTheDocument();
    // Each row's remaining-schedule cell explains the game win
    // probabilities on hover — one such cell per team.
    expect(screen.getAllByTitle(/win probability/i)).toHaveLength(4);
    // The dominant team's row is first (sorted by odds).
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Alpha');
  });

  it('hides the section when there is no future schedule', () => {
    renderPage(league({ futureSchedule: undefined }));
    expect(
      screen.queryByRole('heading', { name: 'Playoff Race' }),
    ).not.toBeInTheDocument();
  });
});

describe('TeamsPage matchup preview', () => {
  // Teams need rosters + weekly points for a preview; the base factory has
  // neither, so the section stays hidden there.
  function rosteredLeague(): League {
    const mkPlayer = (id: string, pos: string, nfl: string): Player =>
      ({ id, platformId: id, name: id, position: pos, team: nfl }) as Player;
    const l = league();
    const weekly: Record<string, Record<number, number>> = {};
    l.teams = l.teams.slice(0, 2).map((t, ti) => {
      const roster = [
        mkPlayer(`${t.id}-qb`, 'QB', 'KC'),
        mkPlayer(`${t.id}-rb`, 'RB', 'SF'),
        mkPlayer(`${t.id}-wr`, 'WR', 'DAL'),
        mkPlayer(`${t.id}-te`, 'TE', 'KC'),
      ];
      for (const p of roster) {
        weekly[p.id] = { 1: 10 + ti * 5, 2: 10 + ti * 5, 3: 10 + ti * 5 };
      }
      return { ...t, roster };
    });
    // Week 9 in the factory pairs A-D and B-C; with only A and B rostered,
    // preview their head-to-head instead.
    return { ...l, playerWeeklyPoints: weekly, futureSchedule: [matchup(9, 'A', 'B')] };
  }

  it('renders this week\u2019s projected scores and win probability', () => {
    renderPage(rosteredLeague());
    expect(
      screen.getByRole('heading', { name: "This Week's Matchups" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: /matchup projections/i }),
    ).toBeInTheDocument();
    // Team B's players score 15/week vs team A's 10, so B is favored
    // (getAllByText: the Playoff Race row names the same pairing too).
    expect(screen.getAllByText(/Beta [\d.]+%/).length).toBeGreaterThan(0);
  });

  it('hides the section when teams have no rosters', () => {
    renderPage(league());
    expect(
      screen.queryByRole('heading', { name: "This Week's Matchups" }),
    ).not.toBeInTheDocument();
  });

  it('hides the section when there is no future schedule', () => {
    renderPage({ ...rosteredLeague(), futureSchedule: undefined });
    expect(
      screen.queryByRole('heading', { name: "This Week's Matchups" }),
    ).not.toBeInTheDocument();
  });
});
