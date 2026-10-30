
// StartSitPage: multi-week lineup planner (backlog item 29). The fixture
// uses 'XXX' fake NFL teams, so no matchup blend fires and every week's
// plan is deterministic.

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Player, Team, WeeklyMatchup } from '@/types';
import { StartSitPage } from './StartSitPage';

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

const ROSTER = ['rb1', 'rb2', 'wr1', 'wr2', 'te1', 'qb1'] as const;
const POS: Record<string, string> = {
  rb1: 'RB',
  rb2: 'RB',
  wr1: 'WR',
  wr2: 'WR',
  te1: 'TE',
  qb1: 'QB',
};

function league(playoffStartWeek?: number): League {
  const mkTeam = (id: string, name: string, isMyTeam: boolean): Team =>
    ({
      id,
      name,
      isMyTeam,
      roster: ROSTER.map(k => mkPlayer(`${id}-${k}`, POS[k])),
    }) as Team;
  const pw: Record<string, Record<number, number>> = {};
  for (const id of ['W', 'S']) {
    for (const k of ROSTER) pw[`${id}-${k}`] = weekly([10, 12, 11]);
  }
  const matchup = (week: number, a: string, b: string): WeeklyMatchup =>
    ({ week, team1Id: a, team2Id: b }) as WeeklyMatchup;
  return {
    id: 'L',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    currentWeek: 9,
    playoffStartWeek,
    rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BENCH: 6 },
    teams: [mkTeam('W', 'Weaklings', true), mkTeam('S', 'Strongmen', false)],
    playerWeeklyPoints: pw,
    futureSchedule: [matchup(9, 'W', 'S')],
  } as League;
}

function renderPage(l: League) {
  return render(
    <MemoryRouter>
      <StartSitPage league={l} />
    </MemoryRouter>,
  );
}

describe('StartSitPage plan-ahead section', () => {
  it('renders one row per remaining regular-season week', () => {
    renderPage(league());
    const table = screen.getByRole('table', {
      name: /Optimal lineups for weeks 9 through 14/,
    });
    expect(table).toBeInTheDocument();
    // Header + 6 week rows (9–14).
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    const thisWeek = within(table).getByRole('rowheader', { name: /9 \(this week\)/ });
    expect(thisWeek).toBeInTheDocument();
  });

  it('clips the plan at the league playoff start', () => {
    renderPage(league(11));
    const table = screen.getByRole('table', {
      name: /Optimal lineups for weeks 9 through 10/,
    });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  it('hides the planner when no future week remains', () => {
    renderPage(league(9));
    expect(
      screen.queryByRole('table', { name: /Optimal lineups for weeks/ }),
    ).not.toBeInTheDocument();
  });
});
