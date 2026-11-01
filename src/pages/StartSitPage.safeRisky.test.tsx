// StartSitPage: Safe & Risky Starts of the Week (backlog item 68).
// The panel ranks this week's optimal starters by bankability — steady
// history is safe, volatile history is risky — each with a one-line
// reason naming the numbers. No placeholder: the panel only renders
// when at least one pick exists.

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
    mkPlayer('qb1', 'QB', 'KC'), // 8 weeks at 20 → Steady
    mkPlayer('rb1', 'RB', 'DAL'), // 5..25 swings → Volatile
    mkPlayer('wr1', 'WR', 'DAL'), // only 2 weeks → unranked
  ];
  const pw: Record<string, Record<number, number>> = {
    qb1: { 1: 20, 2: 20, 3: 20, 4: 20, 5: 20, 6: 20, 7: 20, 8: 20 },
    rb1: { 1: 5, 2: 25, 3: 4, 4: 26, 5: 6, 6: 24, 7: 3, 8: 25 },
    wr1: { 1: 12, 2: 18 },
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
  render(
    <MemoryRouter>
      <StartSitPage league={league()} />
    </MemoryRouter>,
  );
}

describe('StartSitPage safe & risky starts', () => {
  it('renders the panel heading and announces it via aria-live', () => {
    renderPage();
    const section = screen.getByRole('region', { name: /safe & risky starts/i });
    expect(section.getAttribute('aria-live')).toBe('polite');
  });

  it('names the steady starter in Safest starts and the volatile one in Riskiest starts', () => {
    renderPage();
    const safeList = screen.getByRole('list', { name: /safest starts/i });
    const riskyList = screen.getByRole('list', { name: /riskiest starts/i });
    expect(within(safeList).getByText('qb1')).toBeDefined();
    expect(within(riskyList).getByText('rb1')).toBeDefined();
  });

  it('gives each pick a one-line reason naming the numbers', () => {
    renderPage();
    const riskyList = screen.getByRole('list', { name: /riskiest starts/i });
    const item = within(riskyList).getByText('rb1').closest('li');
    expect(item?.textContent).toMatch(/Volatile/);
    expect(item?.textContent).toMatch(/8 weeks/);
  });

  it('leaves players with too little history out of both lists', () => {
    renderPage();
    const section = screen.getByRole('region', { name: /safe & risky starts/i });
    expect(section.textContent).not.toContain('wr1');
  });
});
