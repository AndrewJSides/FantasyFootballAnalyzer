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

const lp = (
  id: string,
  name: string,
  pos: string,
  points: number,
): import('@/types').LineupPlayer => ({ id, name, pos, points });

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

  it('renders championship odds column and a projected-champion callout', () => {
    renderPage(league());
    const table = screen.getByRole('table', { name: /playoff race/i });
    const headers = screen.getAllByRole('columnheader');
    const names = headers.map(h => h.textContent);
    expect(names).toContain('Champ %');
    // The projected champion is named above the table (Alpha is the
    // runaway favorite in the fixture league).
    expect(
      screen.getByText(/Projected champion:/, { exact: false }),
    ).toHaveTextContent(/Projected champion: Alpha \([\d.]+%\)/);
    // Every row names its championship odds in an accessible label.
    expect(
      screen.getAllByLabelText(/Championship odds: [\d.]+%/),
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

describe('TeamsPage stack report', () => {
  // Stack Report: TeamsPage takes a pool override (bundled pool carries
  // live Sleeper designations, unsuitable for assertions).
  const mkPool = (): import('@/types/draft').DraftPoolFile => {
    const player = (
      id: string,
      name: string,
      pos: 'QB' | 'WR' | 'TE',
      proj: number,
      nfl: string,
    ): import('@/types/draft').PoolPlayer =>
      ({
        id,
        name,
        team: nfl,
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
        player('qb1', 'Elite QB', 'QB', 340, 'KC'),
        player('wr1', 'Top Wideout', 'WR', 270, 'KC'),
        player('te1', 'Top Tight End', 'TE', 170, 'KC'),
        player('wr9', 'Waiver Wideout', 'WR', 150, 'KC'),
        player('qb2', 'Scrub QB', 'QB', 180, 'BUF'),
        player('wr2', 'Second Wideout', 'WR', 120, 'BUF'),
      ],
    };
  };

  const stackedLeague = (): League => {
    const mk = (id: string, name: string, pos: string): Player =>
      ({ id, name, position: pos, team: 'KC' }) as Player;
    const l = league();
    l.teams = [
      {
        ...team('A', 'Alpha', 8, 0, 1200),
        roster: [
          mk('qb1', 'Elite QB', 'QB'),
          mk('wr1', 'Top Wideout', 'WR'),
          mk('te1', 'Top Tight End', 'TE'),
        ],
      },
      {
        ...team('B', 'Beta', 1, 7, 800),
        roster: [mk('qb2', 'Scrub QB', 'QB'), mk('wr2', 'Second Wideout', 'WR')],
      },
    ];
    return { ...l, status: 'live', totalTeams: 2 } as League;
  };

  const renderStacked = () =>
    render(
      <MemoryRouter>
        <TeamsPage league={stackedLeague()} pool={mkPool()} />
      </MemoryRouter>,
    );

  it('renders ranked league stacks with the stronger stack first', () => {
    renderStacked();
    expect(screen.getByRole('heading', { name: 'Stack Report' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /league stacks ranked/i });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 stacks
    expect(rows[1]).toHaveTextContent('Alpha');
    expect(rows[1]).toHaveTextContent('KC: Elite QB + Top Wideout (WR) + Top Tight End (TE)');
    expect(rows[2]).toHaveTextContent('Beta');
  });

  it('names unrostered pass-catchers that would stack with a rostered QB', () => {
    renderStacked();
    const table = screen.getByRole('table', { name: /waiver stack-mates/i });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Waiver Wideout');
    expect(rows[1]).toHaveTextContent("Alpha's Elite QB");
  });

  it('hides the section when teams have no rosters', () => {
    render(
      <MemoryRouter>
        <TeamsPage league={league()} pool={mkPool()} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('heading', { name: 'Stack Report' })).not.toBeInTheDocument();
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

  it('shows modeled round-by-round advancement odds on each bracket team', () => {
    renderPage(league({ playoffTeams: 4 }));
    const semis = screen.getByRole('list', { name: 'Semifinals matchups' });
    const items = within(semis).getAllByRole('listitem');
    // Every known team slot carries its SF/Title advancement line, priced
    // on the same 10,000 simulated seasons as Champ %.
    for (const item of items) {
      expect(item.textContent).toMatch(/SF \d+(\.\d+)?% · Title \d+(\.\d+)?%/);
    }
    // The odds are explained on hover and to assistive tech.
    const alpha = items.find(i => i.textContent?.includes('Alpha'))!;
    expect(alpha.getAttribute('aria-label')).toMatch(
      /Modeled chance to win each playoff round/,
    );
  });
});

describe('TeamsPage lineup efficiency', () => {
  const efficiencyLeague = (): League =>
    league({
      status: 'live',
      currentWeek: 3,
      weeklyLineups: [
        // Alpha week 1: 15 started, 30 possible = 50%.
        {
          week: 1,
          teamId: 'A',
          slots: ['RB', 'FLEX'],
          starters: [lp('r1', 'RB One', 'RB', 10), lp('w1', 'WR One', 'WR', 5)],
          bench: [lp('w2', 'WR Two', 'WR', 20)],
        },
        // Alpha week 2 (current week): excluded as in-progress.
        {
          week: 3,
          teamId: 'A',
          slots: ['RB', 'FLEX'],
          starters: [lp('r1', 'RB One', 'RB', 1), lp('w1', 'WR One', 'WR', 1)],
          bench: [lp('w2', 'WR Two', 'WR', 99)],
        },
        // Beta week 1: already optimal, 30/30 = 100%.
        {
          week: 1,
          teamId: 'B',
          slots: ['RB', 'FLEX'],
          starters: [lp('r2', 'RB Two', 'RB', 18), lp('w3', 'WR Three', 'WR', 12)],
          bench: [lp('w4', 'WR Four', 'WR', 8)],
        },
      ] as import('@/types').WeeklyLineup[],
    });

  it('ranks teams by actual vs best-legal lineup, excluding the live week', () => {
    renderPage(efficiencyLeague());
    expect(screen.getByRole('heading', { name: 'Lineup Efficiency' })).toBeInTheDocument();
    const table = screen.getByRole('table', {
      name: /lineup efficiency/i,
    });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 teams
    // Beta first at 100%, Alpha second at 50% — week 3's partial scores
    // never enter the math.
    expect(rows[1]).toHaveTextContent('Beta');
    expect(rows[1]).toHaveTextContent('100.0%');
    expect(rows[2]).toHaveTextContent('Alpha');
    expect(rows[2]).toHaveTextContent('50.0%');
    expect(rows[2]).toHaveTextContent('15.0'); // left on bench
    // The efficiency cell explains itself on hover.
    const betaEff = within(rows[1]).getByTitle(/30 of a possible 30/);
    expect(betaEff).toHaveTextContent('100.0%');
  });

  it('hides the section when the sync fetched no weekly lineups', () => {
    renderPage(league());
    expect(
      screen.queryByRole('heading', { name: 'Lineup Efficiency' }),
    ).not.toBeInTheDocument();
  });

  it('hides the section in best-ball leagues', () => {
    const l = efficiencyLeague();
    l.isBestBall = true;
    renderPage(l);
    expect(
      screen.queryByRole('heading', { name: 'Lineup Efficiency' }),
    ).not.toBeInTheDocument();
  });
});

describe('TeamsPage perfect-lineup record', () => {
  function perfectLeague(): League {
    // Two completed weeks (currentWeek 3 is excluded as live). Alpha wins
    // W1 actually 10-8 but would lose it on best lineups (10 < 20); W2 is
    // won both ways. So Alpha is 2-0 actual / 1-1 perfect (swing -1),
    // Beta is 0-2 actual / 1-1 perfect (swing +1).
    return league({
      status: 'live',
      currentWeek: 3,
      matchups: [
        { week: 1, team1Id: 'A', team1Points: 10, team2Id: 'B', team2Points: 8 },
        { week: 2, team1Id: 'A', team1Points: 15, team2Id: 'B', team2Points: 12 },
      ],
      weeklyLineups: [
        {
          week: 1,
          teamId: 'A',
          slots: ['QB'],
          starters: [lp('a1', 'Alpha QB', 'QB', 10)],
          bench: [lp('a2', 'Alpha B', 'QB', 5)],
        },
        {
          week: 1,
          teamId: 'B',
          slots: ['QB'],
          starters: [lp('b1', 'Beta QB', 'QB', 8)],
          bench: [lp('b2', 'Beta B', 'QB', 20)],
        },
        {
          week: 2,
          teamId: 'A',
          slots: ['QB'],
          starters: [lp('a1', 'Alpha QB', 'QB', 15)],
          bench: [lp('a2', 'Alpha B', 'QB', 3)],
        },
        {
          week: 2,
          teamId: 'B',
          slots: ['QB'],
          starters: [lp('b1', 'Beta QB', 'QB', 12)],
          bench: [lp('b2', 'Beta B', 'QB', 4)],
        },
      ] as import('@/types').WeeklyLineup[],
    });
  }

  it('re-decides completed matchups on best-possible lineups and shows the swing', () => {
    renderPage(perfectLeague());
    expect(
      screen.getByRole('heading', { name: 'Perfect-Lineup Record' }),
    ).toBeInTheDocument();
    const table = screen.getByRole('table', {
      name: /perfect-lineup record/i,
    });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 teams
    // Both are 1-1 perfectly; Beta's bigger swing (more wins left on the
    // bench) breaks the tie.
    expect(rows[1]).toHaveTextContent('Beta');
    expect(rows[1]).toHaveTextContent('1-1');
    expect(rows[1]).toHaveTextContent('0-2');
    expect(rows[1]).toHaveTextContent('+1.0');
    expect(rows[2]).toHaveTextContent('Alpha');
    expect(rows[2]).toHaveTextContent('2-0');
    expect(rows[2]).toHaveTextContent('-1.0');
    // The swing cell explains itself on hover.
    const betaSwing = within(rows[1]).getByTitle(/left on the bench/);
    expect(betaSwing).toHaveTextContent('+1.0');
  });

  it('hides the section when the sync fetched no weekly lineups', () => {
    renderPage(league());
    expect(
      screen.queryByRole('heading', { name: 'Perfect-Lineup Record' }),
    ).not.toBeInTheDocument();
  });
});

describe('TeamsPage all-play record', () => {
  function allPlayLeague(): League {
    // 4 teams, two completed weeks (currentWeek 9 is excluded as live).
    return league({
      status: 'live',
      teams: [
        team('A', 'Alpha', 2, 0, 260),
        team('B', 'Beta', 0, 2, 180),
        team('C', 'Gamma', 1, 1, 220),
        team('D', 'Delta', 1, 1, 240),
      ],
      matchups: [
        { week: 7, team1Id: 'A', team1Points: 130, team2Id: 'B', team2Points: 90 },
        { week: 7, team1Id: 'C', team1Points: 110, team2Id: 'D', team2Points: 120 },
        { week: 8, team1Id: 'A', team1Points: 130, team2Id: 'C', team2Points: 110 },
        { week: 8, team1Id: 'B', team1Points: 90, team2Id: 'D', team2Points: 120 },
        // Week 9 (live): partial scores never count.
        { week: 9, team1Id: 'A', team1Points: 999, team2Id: 'B', team2Points: 1 },
      ],
    });
  }

  it('ranks teams by all-play win rate and prices schedule luck', () => {
    renderPage(allPlayLeague());
    expect(screen.getByRole('heading', { name: 'All-Play Record' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /all-play record/i });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(5); // header + 4 teams
    // Alpha beat everyone both weeks: 6-0 all-play, 2-0 actual → even.
    expect(rows[1]).toHaveTextContent('Alpha');
    expect(rows[1]).toHaveTextContent('6-0');
    expect(rows[1]).toHaveTextContent('2-0');
    expect(rows[1]).toHaveTextContent('even');
    // Beta lost to everyone both weeks: 0-6 all-play, 0-2 actual → even.
    expect(rows[4]).toHaveTextContent('Beta');
    expect(rows[4]).toHaveTextContent('0-6');
    expect(rows[4]).toHaveTextContent('even');
  });

  it('shows a strength-of-victory column per team', () => {
    renderPage(allPlayLeague());
    const table = screen.getByRole('table', { name: /all-play record/i });
    expect(
      within(table).getByRole('columnheader', { name: /^SOV$/ }),
    ).toBeInTheDocument();
    const rows = within(table).getAllByRole('row');
    // Alpha beat Beta and Gamma, both winless → 0.0% SOV, soft schedule.
    expect(
      within(rows[1]).getByRole('cell', {
        name: /Strength of victory 0\.0%: beat teams with a combined 0-4 record — soft schedule/i,
      }),
    ).toBeInTheDocument();
    // Beta beat nobody → no strength of victory.
    expect(
      within(rows[4]).getByRole('cell', {
        name: /No wins yet — no strength of victory/i,
      }),
    ).toBeInTheDocument();
  });

  it('hides the section when the sync fetched no matchups', () => {
    renderPage(league());
    expect(
      screen.queryByRole('heading', { name: 'All-Play Record' }),
    ).not.toBeInTheDocument();
  });
});

describe('TeamsPage record book', () => {
  function recordLeague(): League {
    // Weeks 7-8 completed; week 9 is live and excluded.
    return league({
      status: 'live',
      teams: [
        team('A', 'Alpha', 2, 0, 260),
        team('B', 'Beta', 0, 2, 180),
        team('C', 'Gamma', 1, 1, 220),
        team('D', 'Delta', 1, 1, 240),
      ],
      matchups: [
        { week: 7, team1Id: 'A', team1Points: 150, team2Id: 'B', team2Points: 100 },
        { week: 7, team1Id: 'C', team1Points: 120, team2Id: 'D', team2Points: 110 },
        { week: 8, team1Id: 'A', team1Points: 160, team2Id: 'C', team2Points: 90 },
        { week: 8, team1Id: 'B', team1Points: 105, team2Id: 'D', team2Points: 104.5 },
        // Week 9 (live): partial scores never count.
        { week: 9, team1Id: 'B', team1Points: 999, team2Id: 'D', team2Points: 1 },
      ],
    });
  }

  it('renders the season extremes from completed weeks', () => {
    renderPage(recordLeague());
    expect(screen.getByRole('heading', { name: 'Record Book' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /record book/i });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(7); // header + 6 records
    // Alpha holds the high score (160, W8) and the 4-game... 2-game win streak.
    expect(rows[1]).toHaveTextContent('Alpha');
    expect(rows[1]).toHaveTextContent('160.0 pts');
    expect(rows[1]).toHaveTextContent('W8');
    // Biggest blowout: Alpha 160 over Gamma 90, won by 70.
    expect(rows[3]).toHaveTextContent('Alpha over Gamma');
    expect(rows[3]).toHaveTextContent('won by 70.0');
    // Closest game: Beta 105 over Delta 104.5, won by 0.5 (the live 998-pt blowout is excluded).
    expect(rows[4]).toHaveTextContent('Beta over Delta');
    expect(rows[4]).toHaveTextContent('won by 0.5');
    // Alpha won W7 and W8: the longest win streak, 2 games.
    expect(rows[5]).toHaveTextContent('Alpha');
    expect(rows[5]).toHaveTextContent('2 games');
    // Delta lost W7 and W8: the longest losing streak, 2 games.
    expect(rows[6]).toHaveTextContent('Delta');
    expect(rows[6]).toHaveTextContent('2 games');
  });

  it('hides the section when the sync fetched no matchups', () => {
    renderPage(league());
    expect(
      screen.queryByRole('heading', { name: 'Record Book' }),
    ).not.toBeInTheDocument();
  });
});

describe('TeamsPage rivalry matrix', () => {
  function rivalryLeague(): League {
    // Weeks 7-8 completed; week 9 is live and excluded.
    return league({
      status: 'live',
      teams: [
        team('A', 'Alpha', 2, 0, 260),
        team('B', 'Beta', 0, 2, 180),
        team('C', 'Gamma', 1, 1, 220),
      ],
      matchups: [
        { week: 7, team1Id: 'A', team1Points: 130, team2Id: 'B', team2Points: 90 },
        // Week 9 (live): partial scores never count in a season series.
        { week: 9, team1Id: 'A', team1Points: 999, team2Id: 'B', team2Points: 1 },
      ],
    });
  }

  it('renders every pair\u2019s head-to-head record from completed weeks', () => {
    renderPage(rivalryLeague());
    expect(screen.getByRole('heading', { name: 'Rivalry Matrix' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /rivalry matrix/i });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 3 teams
    // Alpha beat Beta in week 7; the live week-9 blowout is excluded.
    expect(rows[1]).toHaveTextContent('Alpha');
    const alphaBeta = within(rows[1]).getByLabelText('Alpha leads Beta 1-0');
    expect(alphaBeta).toHaveTextContent('1-0');
    // Beta's row reads from Beta's side.
    const betaAlpha = within(rows[2]).getByLabelText('Beta trails Alpha 0-1');
    expect(betaAlpha).toHaveTextContent('0-1');
    // Gamma never met anyone: dashes, and the diagonal is a dash too.
    const gammaAlpha = within(rows[3]).getByLabelText("Gamma and Alpha haven't met yet this season");
    expect(gammaAlpha).toHaveTextContent('—');
  });

  it('hides the section when the sync fetched no matchups', () => {
    renderPage(league());
    expect(
      screen.queryByRole('heading', { name: 'Rivalry Matrix' }),
    ).not.toBeInTheDocument();
  });
});

describe('TeamsPage power rankings', () => {
  function powerLeague(): League {
    // Weeks 6-8 completed; week 9 is live and excluded.
    return league({
      status: 'live',
      teams: [
        team('A', 'Alpha', 2, 0, 390),
        team('B', 'Beta', 0, 2, 270),
      ],
      matchups: [
        { week: 6, team1Id: 'A', team1Points: 120, team2Id: 'B', team2Points: 90 },
        { week: 7, team1Id: 'A', team1Points: 130, team2Id: 'B', team2Points: 90 },
        { week: 8, team1Id: 'A', team1Points: 140, team2Id: 'B', team2Points: 90 },
        // Week 9 (live): partial scores never count.
        { week: 9, team1Id: 'A', team1Points: 999, team2Id: 'B', team2Points: 1 },
      ],
    });
  }

  it('ranks teams by the shrunk scoring rating with a form trend', () => {
    renderPage(powerLeague());
    expect(screen.getByRole('heading', { name: 'Power Rankings' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /power rankings/i });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 teams
    // Alpha: season avg 130 over 3 completed weeks, shrunk toward the
    // league mean — still ahead of Beta's 90.
    expect(rows[1]).toHaveTextContent('Alpha');
    expect(rows[1]).toHaveTextContent('130.0');
    // Last-3 equals the season average → Steady.
    expect(rows[1]).toHaveTextContent('Steady');
    expect(rows[2]).toHaveTextContent('Beta');
  });

  it('hides the section when the sync fetched no matchups', () => {
    renderPage(league());
    expect(
      screen.queryByRole('heading', { name: 'Power Rankings' }),
    ).not.toBeInTheDocument();
  });

  it('renders a Rank Δ column showing week-over-week rank movement', () => {
    // Weeks 6-8 completed; week 9 is live and excluded. Alpha surges in
    // week 8 and takes rank 1 from Beta.
    const moving = league({
      status: 'live',
      teams: [team('A', 'Alpha', 1, 2, 0), team('B', 'Beta', 2, 1, 0)],
      matchups: [
        { week: 6, team1Id: 'A', team1Points: 90, team2Id: 'B', team2Points: 120 },
        { week: 7, team1Id: 'A', team1Points: 90, team2Id: 'B', team2Points: 120 },
        { week: 8, team1Id: 'A', team1Points: 200, team2Id: 'B', team2Points: 60 },
        // Week 9 (live): partial scores never count.
        { week: 9, team1Id: 'A', team1Points: 999, team2Id: 'B', team2Points: 1 },
      ],
    });
    renderPage(moving);
    const table = screen.getByRole('table', { name: /power rankings/i });
    expect(
      within(table).getByRole('columnheader', { name: 'Rank Δ' }),
    ).toBeInTheDocument();
    const rows = within(table).getAllByRole('row');
    // Alpha leads the table now: up from rank 2 last week.
    expect(rows[1]).toHaveTextContent('↑1');
    expect(
      within(rows[1]).getByRole('cell', {
        name: 'Rank 1, up 1 from rank 2 last week',
      }),
    ).toBeInTheDocument();
    // Beta fell to second.
    expect(rows[2]).toHaveTextContent('↓1');
    expect(
      within(rows[2]).getByRole('cell', {
        name: 'Rank 2, down 1 from rank 1 last week',
      }),
    ).toBeInTheDocument();
  });

  it('shows a dash in Rank Δ with a single completed week', () => {
    const one = league({
      status: 'live',
      teams: [team('A', 'Alpha', 1, 0, 0), team('B', 'Beta', 0, 1, 0)],
      matchups: [
        { week: 6, team1Id: 'A', team1Points: 120, team2Id: 'B', team2Points: 90 },
      ],
    });
    renderPage(one);
    const table = screen.getByRole('table', { name: /power rankings/i });
    const rows = within(table).getAllByRole('row');
    expect(
      within(rows[1]).getByRole('cell', {
        name: 'Rank change needs two completed weeks',
      }),
    ).toBeInTheDocument();
  });
});

describe('TeamsPage clinch watch', () => {
  // One playoff spot, A (8-0) hosts B (7-1) in week 9: A clinches with a
  // win, B is out with a loss (same airtight fixture as the clinchWatch
  // util test).
  const bubble = (): League =>
    league({
      teams: [
        team('A', 'Alpha', 8, 0, 1200),
        team('B', 'Beta', 7, 1, 1120),
        team('C', 'Gamma', 0, 8, 800),
        team('D', 'Delta', 0, 8, 800),
      ],
      playoffTeams: 1,
      currentWeek: 9,
      futureSchedule: [
        matchup(9, 'A', 'B'),
        matchup(9, 'C', 'D'),
        matchup(10, 'A', 'C'),
        matchup(10, 'B', 'D'),
      ],
    });

  it('renders this-week clinch scenarios on the Playoff Race table', () => {
    renderPage(bubble());
    const table = screen.getByRole('table', {
      name: /Playoff race: remaining schedule/,
    });
    expect(
      within(table).getByRole('columnheader', { name: 'This week' }),
    ).toBeTruthy();
    const rows = within(table).getAllByRole('row');
    const alpha = rows.find(r => within(r).queryByText('Alpha'));
    const beta = rows.find(r => within(r).queryByText('Beta'));
    expect(within(alpha!).getByText('Clinches with a win')).toBeTruthy();
    expect(within(beta!).getByText('Out with a loss')).toBeTruthy();
    // Decided teams get the dim dash.
    const gamma = rows.find(r => within(r).queryByText('Gamma'));
    expect(within(gamma!).getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('TeamsPage team playoff SOS', () => {
  // Two rostered teams with steady weekly points; the bundled 2026 schedule
  // and allowed-vs-position data price weeks 15–17, so the exact verdicts
  // depend on real data — assert the shape, not the numbers.
  const sosLeague = (status?: string): League => {
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
      for (const p of roster) weekly[p.id] = { 1: 10 + ti * 5, 2: 10 + ti * 5, 3: 10 + ti * 5 };
      return { ...t, roster };
    });
    return {
      ...l,
      status: status ?? 'live',
      playerWeeklyPoints: weekly,
      futureSchedule: [matchup(9, 'A', 'B')],
    } as League;
  };

  it('renders a PO SOS verdict per team on the Playoff Race table', () => {
    renderPage(sosLeague());
    const table = screen.getByRole('table', {
      name: /Playoff race: remaining schedule/,
    });
    expect(
      within(table).getByRole('columnheader', { name: 'PO SOS' }),
    ).toBeInTheDocument();
    const rows = within(table).getAllByRole('row');
    const alpha = rows.find(r => within(r).queryByText('Alpha'));
    const beta = rows.find(r => within(r).queryByText('Beta'));
    // rosShort shape: "Soft (8.4)" / "Avg (15.2)" / "Tough (24.1)".
    for (const row of [alpha!, beta!]) {
      expect(
        within(row).getByText(/^(Soft|Avg|Tough) \(\d+\.\d+\)$/),
      ).toBeInTheDocument();
    }
  });

  it('renders dashes when the league cannot be priced', () => {
    renderPage(sosLeague('archived'));
    const table = screen.getByRole('table', {
      name: /Playoff race: remaining schedule/,
    });
    const rows = within(table).getAllByRole('row');
    const alpha = rows.find(r => within(r).queryByText('Alpha'));
    // PO SOS is the 7th column (after SOS); the unpriced cell is a dash.
    const cells = within(alpha!).getAllByRole('cell');
    expect(cells[5]).toHaveTextContent('—');
  });
});

describe('TeamsPage expectation gap', () => {
  const SLOTS = {
    QB: 0, RB: 1, WR: 0, TE: 0, FLEX: 0, SUPERFLEX: 0, K: 0, DST: 0, BENCH: 5, IR: 0,
  };

  function gapLeague(): League {
    // Week 2 is graded (week 1 has no history to price on; week 3 is live).
    // Alpha's guy was projected 10 on week-1 form and scored 30 (+20, hot);
    // Beta's was projected 30 and scored 10 (-20, cold).
    return league({
      status: 'live',
      currentWeek: 3,
      rosterSlots: SLOTS,
      weeklyLineups: [
        {
          week: 2,
          teamId: 'A',
          slots: ['RB', 'BN'],
          starters: [lp('ga', 'Gapper A', 'RB', 30)],
          bench: [lp('sa', 'Scrub A', 'RB', 1)],
        },
        {
          week: 2,
          teamId: 'B',
          slots: ['RB', 'BN'],
          starters: [lp('gb', 'Gapper B', 'RB', 10)],
          bench: [lp('sb', 'Scrub B', 'RB', 1)],
        },
      ] as import('@/types').WeeklyLineup[],
      playerWeeklyPoints: {
        ga: { 1: 10, 2: 30 },
        sa: { 1: 1, 2: 1 },
        gb: { 1: 30, 2: 10 },
        sb: { 1: 1, 2: 1 },
      },
    });
  }

  it('ranks teams hottest first with the gap and read', () => {
    renderPage(gapLeague());
    expect(
      screen.getByRole('heading', { name: 'Expectation Gap' }),
    ).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /expectation gap/i });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 teams
    expect(rows[1]).toHaveTextContent('Alpha');
    expect(rows[1]).toHaveTextContent('+20.0');
    expect(rows[1]).toHaveTextContent('Running hot');
    expect(rows[2]).toHaveTextContent('Beta');
    expect(rows[2]).toHaveTextContent('-20.0');
    expect(rows[2]).toHaveTextContent('Running cold');
    // The gap cell explains itself on hover.
    const titled = within(rows[1]).getAllByTitle(/30 pts vs 10 expected/);
    expect(titled[0]).toHaveTextContent('+20.0');
  });

  it('hides the section when the sync fetched no weekly lineups', () => {
    renderPage(league());
    expect(
      screen.queryByRole('heading', { name: 'Expectation Gap' }),
    ).not.toBeInTheDocument();
  });
});
