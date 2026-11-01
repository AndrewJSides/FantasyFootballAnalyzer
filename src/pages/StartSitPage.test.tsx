// StartSitPage: auto-suggest the lineup mode from the weekly win probability
// (backlog item 25 remainder). The suggestion reuses the Monte Carlo
// matchup preview, so the fixtures give one team a huge projected edge —
// the weak team lands at 0.0% win probability and the strong team at
// 100.0%, both deterministic under the 10,000-sim Monte Carlo.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Player, Team, WeeklyLineup, WeeklyMatchup } from '@/types';
import { StartSitPage } from './StartSitPage';

// Item 67: the weak team's QB is listed Out, so the optimizer must bench him
// with the injury reason. All other fixture ids resolve to nothing (as with
// the real pool), so the existing tests below are unaffected.
vi.mock('@/data/draftPool', () => ({
  POOL: {
    season: 2026,
    generatedAt: '2026-10-31T00:00:00Z',
    baseline: { budget: 200, teams: 10, rounds: 16 },
    players: [
      {
        id: 'W-qb1',
        name: 'W-qb1',
        pos: 'QB',
        sleeperId: '9001',
        injuryStatus: 'Out',
        injuryBodyPart: 'Ankle',
      },
    ],
  },
}));

// 'XXX' is not a real NFL team, so no matchup blend fires and projections
// equal the flat weekly averages — deterministic for the assertions.
function mkPlayer(id: string, pos: string): Player {
  return { id, platformId: id, name: id, position: pos, team: 'XXX' } as Player;
}

function weekly(scores: number[]): Record<number, number> {
  const out: Record<number, number> = {};
  scores.forEach((s, i) => {
    out[i + 1] = s;
  });
  return out;
}

function matchup(week: number, a: string, b: string): WeeklyMatchup {
  return { week, team1Id: a, team2Id: b } as WeeklyMatchup;
}

const ROSTER = ['rb1', 'rb2', 'rb3', 'wr1', 'wr2', 'te1', 'qb1'] as const;
const POS: Record<string, string> = {
  rb1: 'RB', rb2: 'RB', rb3: 'RB', wr1: 'WR', wr2: 'WR', te1: 'TE', qb1: 'QB',
};

function league(weakIsMine: boolean, futureSchedule: WeeklyMatchup[]): League {
  const mkTeam = (id: string, name: string, isMyTeam: boolean): Team => ({
    id,
    name,
    isMyTeam,
    roster: ROSTER.map(k => mkPlayer(`${id}-${k}`, POS[k])),
  }) as Team;
  const pw: Record<string, Record<number, number>> = {};
  // The weak team's flat weekly average is 4, the strong team's is 25 — a
  // ~100-pt lineup gap makes the Monte Carlo win probability 0.0 vs 100.0.
  for (const [id, flat] of [['W', 4], ['S', 25]] as const) {
    for (const k of ROSTER) pw[`${id}-${k}`] = weekly([flat, flat, flat]);
  }
  return {
    id: 'L',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    currentWeek: 9,
    rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BENCH: 6 },
    teams: [
      mkTeam('W', 'Weaklings', weakIsMine),
      mkTeam('S', 'Strongmen', !weakIsMine),
    ],
    playerWeeklyPoints: pw,
    futureSchedule,
  } as League;
}

function renderPage(l: League) {
  return render(
    <MemoryRouter>
      <StartSitPage league={l} />
    </MemoryRouter>,
  );
}

describe('StartSitPage lineup-mode auto-suggestion', () => {
  it('defaults to Chase ceiling when my team is a big underdog', () => {
    renderPage(league(true, [matchup(9, 'W', 'S')]));
    expect(
      screen.getByRole('radio', { name: 'Chase ceiling' }),
    ).toHaveProperty('checked', true);
    const note = screen.getByText(/Suggested:/);
    expect(note.textContent).toMatch(/Chase ceiling/);
    expect(note.textContent).toMatch(/0% underdog vs Strongmen/);
  });

  it('defaults to Protect floor when my team is a big favorite', () => {
    renderPage(league(false, [matchup(9, 'W', 'S')]));
    expect(
      screen.getByRole('radio', { name: 'Protect floor' }),
    ).toHaveProperty('checked', true);
    const note = screen.getByText(/Suggested:/);
    expect(note.textContent).toMatch(/Protect floor/);
    expect(note.textContent).toMatch(/100% favorite vs Weaklings/);
  });

  it('a manual radio choice pins the mode and overrides the suggestion', () => {
    renderPage(league(true, [matchup(9, 'W', 'S')]));
    const balanced = screen.getByRole('radio', { name: 'Balanced' });
    fireEvent.click(balanced);
    expect(balanced).toHaveProperty('checked', true);
    expect(
      screen.getByRole('radio', { name: 'Chase ceiling' }),
    ).toHaveProperty('checked', false);
    expect(screen.getByText(/Your pick overrides the suggestion\./)).toBeInTheDocument();
  });

  it('renders no suggestion when there is no matchup preview', () => {
    renderPage(league(true, []));
    expect(screen.queryByText(/Suggested:/)).not.toBeInTheDocument();
    // Without a signal the mode falls back to balanced.
    expect(
      screen.getByRole('radio', { name: 'Balanced' }),
    ).toHaveProperty('checked', true);
  });
});

describe('StartSitPage injury-out benching (item 67)', () => {
  it('benches the Out starter with the injury reason instead of starting him', () => {
    renderPage(league(true, [matchup(9, 'W', 'S')]));
    const bench = screen.getByRole('table', { name: 'Bench for Weaklings' });
    expect(
      within(bench).getByText('Out (Ankle) — sits regardless of projection.'),
    ).toBeInTheDocument();
    expect(within(bench).getByText('W-qb1')).toBeInTheDocument();
    const starters = screen.getByRole('table', {
      name: 'Optimal starters for Weaklings',
    });
    expect(within(starters).queryByText('W-qb1')).not.toBeInTheDocument();
  });
});

describe('StartSitPage model report card (item 81)', () => {
  // W-rb1 is flat 20, W-rb2 flat 2 across weeks 1-8. In week 7 the manager
  // started the dud (model: rb1 for 20, actual: rb2 for 2); in week 8 he
  // followed the model. Week 9 is the live current week and stays out.
  function reportCardLeague(): League {
    const mkTeam = (id: string, name: string, isMyTeam: boolean): Team =>
      ({
        id,
        name,
        isMyTeam,
        roster: ['rb1', 'rb2'].map(k => ({
          id: `${id}-${k}`,
          platformId: `${id}-${k}`,
          name: `${id}-${k}`,
          position: 'RB',
          team: 'XXX',
        })),
      }) as Team;
    const flats: Record<string, number> = { 'W-rb1': 20, 'W-rb2': 2 };
    const pw: Record<string, Record<number, number>> = {};
    for (const [pid, flat] of Object.entries(flats)) {
      pw[pid] = {};
      for (let w = 1; w <= 8; w++) pw[pid][w] = flat;
    }
    const wl = (week: number, starter: string, benched: string) =>
      ({
        week,
        teamId: 'W',
        slots: ['RB', 'BN'],
        starters: [{ id: starter, name: starter, pos: 'RB', points: flats[starter] }],
        bench: [{ id: benched, name: benched, pos: 'RB', points: flats[benched] }],
      }) as WeeklyLineup;
    return {
      id: 'L',
      name: 'Test League',
      platform: 'sleeper',
      season: 2026,
      status: 'live',
      currentWeek: 9,
      rosterSlots: {
        QB: 0, RB: 1, WR: 0, TE: 0, FLEX: 0, SUPERFLEX: 0,
        K: 0, DST: 0, BENCH: 5, IR: 0,
      },
      teams: [mkTeam('W', 'Weaklings', true), mkTeam('S', 'Strongmen', false)],
      playerWeeklyPoints: pw,
      weeklyLineups: [wl(7, 'W-rb2', 'W-rb1'), wl(8, 'W-rb1', 'W-rb2')],
    } as League;
  }

  it('grades the model against the manager across completed weeks', () => {
    renderPage(reportCardLeague());
    const table = screen.getByRole('table', {
      name: 'Start/Sit model report card by team',
    });
    const row = within(table)
      .getByRole('rowheader', { name: 'Weaklings' })
      .closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    // 2 graded weeks: model 40 (20+20), started 22 (2+20), delta +18.
    expect(cells.getByText('2')).toBeInTheDocument();
    expect(cells.getByText('40')).toBeInTheDocument();
    expect(cells.getByText('22')).toBeInTheDocument();
    expect(cells.getByText('+18')).toBeInTheDocument();
    expect(cells.getByText('Model beats you')).toBeInTheDocument();
    expect(
      screen.getByText(/Would following the model have beaten your gut\?/),
    ).toBeInTheDocument();
  });

  it('hides when the sync fetched no weekly lineups', () => {
    renderPage(league(true, []));
    expect(
      screen.queryByRole('table', {
        name: 'Start/Sit model report card by team',
      }),
    ).not.toBeInTheDocument();
  });
});
