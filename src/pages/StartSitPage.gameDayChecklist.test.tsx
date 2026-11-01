// StartSitPage: Game-day checklist (backlog item 70). The checklist
// consolidates the page's actionable Sunday-morning pieces — game-time
// decisions, kickoff lock order, benched Out starters, no-cover holes —
// into one check-off-able list that persists per week.
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Player } from '@/types';
import { StartSitPage } from './StartSitPage';

function mkPlayer(id: string, pos: string, team: string): Player {
  return { id, platformId: id, name: id, position: pos, team } as Player;
}

function league(): League {
  const roster = [
    mkPlayer('qb1', 'QB', 'KC'), // Sun 4pm
    mkPlayer('rb1', 'RB', 'BUF'), // Sun 1pm
    mkPlayer('wr1', 'WR', 'BUF'),
  ];
  const pw: Record<string, Record<number, number>> = {
    qb1: { 1: 20, 2: 20, 3: 20, 4: 20, 5: 20, 6: 20, 7: 20 },
    rb1: { 1: 15, 2: 15, 3: 15, 4: 15, 5: 15, 6: 15, 7: 15 },
    wr1: { 1: 12, 2: 12, 3: 12, 4: 12, 5: 12, 6: 12, 7: 12 },
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

function renderPage() {
  return render(
    <MemoryRouter>
      <StartSitPage league={league()} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('StartSitPage game-day checklist', () => {
  it('renders the checklist with the kickoff order in chronological order', () => {
    renderPage();
    const section = screen.getByRole('region', { name: /game-day checklist/i });
    expect(within(section).getByText(/kickoff order/i)).toBeDefined();
    const item = screen.getByText(/kickoff order/i).textContent ?? '';
    expect(item.indexOf('Sun 1pm')).toBeLessThan(item.indexOf('Sun 4pm'));
  });

  it('persists a checked item for the week across renders', () => {
    const { unmount } = renderPage();
    const box = screen.getByRole('checkbox', { name: /kickoff order/i });
    fireEvent.click(box);
    expect(JSON.parse(localStorage.getItem('gameday-checklist:2026:w8') ?? '[]')).toHaveLength(1);
    unmount();
    renderPage();
    expect(screen.getByRole('checkbox', { name: /kickoff order/i })).toBeChecked();
  });
});
