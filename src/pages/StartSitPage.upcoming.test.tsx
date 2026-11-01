// StartSitPage: upcoming matchups column (backlog item 66).
// Each starter's next 3 played weeks as favorable/tough/neutral chips,
// priced on the same season-to-date averages as the Matchup column —
// a difficulty map, not a forecast.

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Player } from '@/types';
import { StartSitPage } from './StartSitPage';

function mkPlayer(id: string, pos: string, team: string): Player {
  return { id, platformId: id, name: id, position: pos, team } as Player;
}

function league(): League {
  const roster = [mkPlayer('rb1', 'RB', 'DAL'), mkPlayer('wr1', 'WR', 'KC')];
  const pw: Record<string, Record<number, number>> = {
    rb1: { 1: 15, 2: 14, 3: 16, 4: 15, 5: 17, 6: 14, 7: 15 },
    wr1: { 1: 12, 2: 13, 3: 11, 4: 14, 5: 12, 6: 13, 7: 12 },
  };
  return {
    id: 'L',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    currentWeek: 8,
    rosterSlots: { RB: 1, WR: 1, BENCH: 4 },
    teams: [{ id: 'T', name: 'My Team', isMyTeam: true, roster }] as League['teams'],
    playerWeeklyPoints: pw,
    futureSchedule: [],
  } as League;
}

function upcomingCell(playerId: string): string {
  render(
    <MemoryRouter>
      <StartSitPage league={league()} />
    </MemoryRouter>,
  );
  const starters = screen.getByRole('table', { name: /optimal starters/i });
  const row = within(starters)
    .getAllByRole('row')
    .find(r => {
      // Match on the Player cell only: the "why they start" reason can name
      // other players (e.g. "edges out rb1"). Header rows have no cells.
      const cells = within(r).queryAllByRole('cell');
      return cells.length > 0 && (cells[0].textContent ?? '').includes(playerId);
    });
  expect(row).toBeDefined();
  // Cells after the row header: Player, Proj., Range, Pts/game, Last 3,
  // Matchup, Upcoming, Kickoff, Why they start.
  const cells = within(row!).getAllByRole('cell');
  return cells[6].textContent ?? '';
}

describe('StartSitPage upcoming matchups column', () => {
  it('renders an Upcoming column in the starters table', () => {
    render(
      <MemoryRouter>
        <StartSitPage league={league()} />
      </MemoryRouter>,
    );
    const starters = screen.getByRole('table', { name: /optimal starters/i });
    expect(
      within(starters).getByRole('columnheader', { name: 'Upcoming' }),
    ).toBeDefined();
  });

  it("shows the starter's next 3 played weeks after the current week", () => {
    // Bundled 2026 schedule: DAL plays IND (W9), SF (W10), TEN (W11).
    expect(upcomingCell('rb1')).toBe('W9 INDW10 SFW11 TEN');
  });

  it('names the full rating in the chip hover title and aria label', () => {
    render(
      <MemoryRouter>
        <StartSitPage league={league()} />
      </MemoryRouter>,
    );
    const starters = screen.getByRole('table', { name: /optimal starters/i });
    const titled = within(starters).getAllByTitle(/vs (IND|SF|TEN) · /);
    expect(titled.length).toBe(3);
    expect(
      within(starters).getByLabelText(/^Week 9: vs IND · /),
    ).toBeDefined();
  });
});
