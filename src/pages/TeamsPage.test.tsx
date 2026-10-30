// TeamsPage playoff race: the section renders with remaining schedule, SOS
// and odds when the sync fetched a future schedule, and hides without one.

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  it('renders a projected final W-L column from the same simulations', () => {
    renderPage(league());
    const table = screen.getByRole('table', { name: /playoff race/i });
    // New column header sits after the current W-L.
    const headers = screen.getAllByRole('columnheader');
    const names = headers.map(h => h.textContent);
    expect(names).toContain('Proj. W-L');
    // The dominant team's row names its projected final record, one decimal,
    // in an accessible label and a hover title.
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent(/9\.[5-9]-[01]\.[0-9]/);
    expect(
      screen.getAllByLabelText(/Projected final record: [\d.]+ wins, [\d.]+ losses/),
    ).toHaveLength(4);
  });
});

describe('TeamsPage matchup preview', () => {
  // The full matchup table folded into the dedicated Matchup view
  // (backlog item 24a): the Teams page now just links to it. The base
  // factory has neither rosters nor a schedule, so the section stays
  // hidden there.
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

  it('links to the Matchup view when previews exist', () => {
    renderPage(rosteredLeague());
    expect(
      screen.getByRole('heading', { name: "This Week's Matchups" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Matchup view' }),
    ).toHaveAttribute('href', '/matchup');
    // The table itself moved to /matchup.
    expect(
      screen.queryByRole('table', { name: /matchup projections/i }),
    ).not.toBeInTheDocument();
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

describe('TeamsPage team grades', () => {
  // Team Grades: TeamsPage takes a pool override (bundled pool carries
  // live Sleeper designations, unsuitable for assertions).
  const mkPool = (): import('@/types/draft').DraftPoolFile => {
    const player = (
      id: string,
      name: string,
      pos: 'QB' | 'RB' | 'WR' | 'TE',
      proj: number,
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
        projPtsPpr: proj,
      }) as import('@/types/draft').PoolPlayer;
    return {
      season: 2026,
      generatedAt: 'test',
      baseline: { budget: 200, teams: 2, rounds: 16 },
      players: [
        player('qb1', 'Elite QB', 'QB', 340),
        player('qb2', 'Scrub QB', 'QB', 180),
        player('rb1', 'Lead Back', 'RB', 260),
        player('rb2', 'Backup Back', 'RB', 220),
        player('rb3', 'Waiver Back', 'RB', 120),
        player('rb4', 'Bench Back', 'RB', 100),
        player('wr1', 'Top Wideout', 'WR', 270),
        player('wr2', 'Second Wideout', 'WR', 230),
        player('wr3', 'Third Wideout', 'WR', 150),
        player('wr4', 'Scrub Wideout', 'WR', 110),
        player('te1', 'Top Tight End', 'TE', 170),
        player('te2', 'Scrub Tight End', 'TE', 90),
      ],
    };
  };

  const gradedLeague = (): League => {
    const mk = (id: string, name: string, pos: string): Player =>
      ({ id, name, position: pos, team: 'DAL' }) as Player;
    const l = league();
    l.teams = [
      {
        ...team('A', 'Alpha', 8, 0, 1200),
        roster: [
          mk('qb1', 'Elite QB', 'QB'),
          mk('rb1', 'Lead Back', 'RB'),
          mk('rb2', 'Backup Back', 'RB'),
          mk('wr1', 'Top Wideout', 'WR'),
          mk('wr2', 'Second Wideout', 'WR'),
          mk('te1', 'Top Tight End', 'TE'),
        ],
      },
      {
        ...team('B', 'Beta', 1, 7, 800),
        roster: [
          mk('qb2', 'Scrub QB', 'QB'),
          mk('rb3', 'Waiver Back', 'RB'),
          mk('rb4', 'Bench Back', 'RB'),
          mk('wr3', 'Third Wideout', 'WR'),
          mk('wr4', 'Scrub Wideout', 'WR'),
          mk('te2', 'Scrub Tight End', 'TE'),
        ],
      },
    ];
    return { ...l, status: 'live', totalTeams: 2 } as League;
  };

  const renderGraded = () =>
    render(
      <MemoryRouter>
        <TeamsPage league={gradedLeague()} pool={mkPool()} />
      </MemoryRouter>,
    );

  it('renders per-team grades with the stronger roster first', () => {
    renderGraded();
    expect(screen.getByRole('heading', { name: 'Team Grades' })).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: /team grades by position group/i }),
    ).toBeInTheDocument();
    // Scope rows to the grades table — the page also renders injury and
    // matchup tables. Two teams: best ranks first at percentile 1.0 -> A+,
    // the other at 0.5 -> C+. Alpha's roster is stronger everywhere.
    const table = screen.getByRole('table', { name: /team grades by position group/i });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Alpha');
    expect(rows[1]).toHaveTextContent('A');
    expect(rows[2]).toHaveTextContent('Beta');
    expect(rows[2]).toHaveTextContent('C+');
    // Grade cells carry accessible labels and the strength/weakness note.
    expect(screen.getByLabelText(/Overall grade A\+/)).toBeInTheDocument();
    expect(screen.getByLabelText(/QB grade A\+/)).toBeInTheDocument();
    expect(screen.getAllByText(/Strongest:/).length).toBe(2);
  });

  it('hides the section when teams have no rosters', () => {
    renderPage(league());
    expect(screen.queryByRole('heading', { name: 'Team Grades' })).not.toBeInTheDocument();
  });
});

describe('TeamsPage projected bracket', () => {
  it('renders the bracket from projected seeds when a future schedule exists', () => {
    renderPage(league({ playoffTeams: 4 }));
    expect(
      screen.getByRole('heading', { name: 'Projected Bracket' }),
    ).toBeInTheDocument();
    const semis = screen.getByRole('list', { name: 'Semifinals matchups' });
    expect(within(semis).getAllByRole('listitem')).toHaveLength(2);
    // Alpha is 8-0, so it holds a top-two projected seed and appears in a
    // semifinal with a favored-higher-seed marker.
    expect(within(semis).getAllByText(/Alpha/)[0]).toBeInTheDocument();
    expect(within(semis).getAllByText(/favored/)[0]).toBeInTheDocument();
  });

  it('hides the bracket when the sync fetched no future schedule', () => {
    renderPage(league({ futureSchedule: [], playoffTeams: 4 }));
    expect(
      screen.queryByRole('heading', { name: 'Projected Bracket' }),
    ).not.toBeInTheDocument();
  });
});
