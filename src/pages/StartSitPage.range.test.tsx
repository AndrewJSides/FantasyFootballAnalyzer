// StartSitPage: projected range (floor–ceiling) column (backlog item 62).
// Each starter's P25–P75 weekly band from their own played weeks, so a
// steady projection and a volatile one read differently at a glance.

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Player } from '@/types';
import { StartSitPage } from './StartSitPage';

function mkPlayer(id: string, pos: string, team: string): Player {
  return { id, platformId: id, name: id, position: pos, team } as Player;
}

function league(): League {
  const roster = [
    mkPlayer('qb1', 'QB', 'KC'),
    mkPlayer('rb1', 'RB', 'DAL'),
    mkPlayer('rb2', 'RB', 'KC'),
    mkPlayer('wr1', 'WR', 'DAL'),
  ];
  // wr1: 7 weeks of 10..16 → P25 = 11, P75 = 15.
  // rb1: only 2 played weeks → below the 3-game floor, renders a dash.
  const pw: Record<string, Record<number, number>> = {
    qb1: { 1: 20, 2: 20, 3: 20, 4: 20, 5: 20, 6: 20, 7: 20 },
    rb1: { 1: 15, 2: 14 },
    rb2: { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5 },
    wr1: { 1: 10, 2: 11, 3: 12, 4: 13, 5: 14, 6: 15, 7: 16 },
  };
  return {
    id: 'L',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    currentWeek: 8,
    rosterSlots: { QB: 1, RB: 1, WR: 1, BENCH: 4 },
    teams: [{ id: 'T', name: 'My Team', isMyTeam: true, roster }] as League['teams'],
    playerWeeklyPoints: pw,
    futureSchedule: [],
  } as League;
}

function rangeCell(playerId: string): string {
  render(
    <MemoryRouter>
      <StartSitPage league={league()} />
    </MemoryRouter>,
  );
  const starters = screen.getByRole('table', { name: /optimal starters/i });
  const row = within(starters)
    .getAllByRole('row')
    .find(r => (r.textContent ?? '').includes(playerId));
  expect(row).toBeDefined();
  // Cells after the row header: Player, Proj., Sleeper, Range, Pts/game,
  // Last 3, Matchup, Kickoff, Why they start.
  const cells = within(row!).getAllByRole('cell');
  return cells[3].textContent ?? '';
}

describe('StartSitPage projected range column', () => {
  it('renders a Range column in the starters table', () => {
    render(
      <MemoryRouter>
        <StartSitPage league={league()} />
      </MemoryRouter>,
    );
    const starters = screen.getByRole('table', { name: /optimal starters/i });
    expect(
      within(starters).getByRole('columnheader', { name: 'Range' }),
    ).toBeDefined();
  });

  it('shows the P25–P75 band for a starter with enough played weeks', () => {
    expect(rangeCell('wr1')).toBe('11–15');
  });

  it('names the band basis in the hover title', () => {
    render(
      <MemoryRouter>
        <StartSitPage league={league()} />
      </MemoryRouter>,
    );
    const starters = screen.getByRole('table', { name: /optimal starters/i });
    const titled = within(starters).getAllByTitle(/P25–P75 of 7 played weeks/);
    expect(titled.map(t => t.textContent)).toContain('11–15');
  });

  it('renders a dash when the player has fewer than 3 played weeks', () => {
    expect(rangeCell('rb1')).toBe('—');
  });
});
