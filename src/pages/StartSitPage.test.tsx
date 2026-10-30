// StartSitPage: auto-suggest the lineup mode from the weekly win probability
// (backlog item 25 remainder). The suggestion reuses the Monte Carlo
// matchup preview, so the fixtures give one team a huge projected edge —
// the weak team lands at 0.0% win probability and the strong team at
// 100.0%, both deterministic under the 10,000-sim Monte Carlo.

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Player, Team, WeeklyMatchup } from '@/types';
import { StartSitPage } from './StartSitPage';

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
