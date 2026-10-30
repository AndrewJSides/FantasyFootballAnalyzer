// StartSitPage: kickoff chips and the late-swap watch (backlog item 35).
// Week-8 fixtures reuse the bundled ESPN game-times snapshot: DAL kicks off
// Sunday 1pm ET, KC kicks off Sunday 4pm ET.

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Player } from '@/types';
import { StartSitPage } from './StartSitPage';

function mkPlayer(id: string, pos: string, team: string): Player {
  return { id, platformId: id, name: id, position: pos, team } as Player;
}

function weekly(flat: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (let w = 1; w <= 7; w++) out[w] = flat;
  return out;
}

function league(): League {
  const roster = [
    mkPlayer('qb1', 'QB', 'KC'),
    mkPlayer('rb1', 'RB', 'DAL'),
    mkPlayer('rb2', 'RB', 'KC'),
    mkPlayer('wr1', 'WR', 'DAL'),
  ];
  const pw: Record<string, Record<number, number>> = {
    qb1: weekly(20),
    rb1: weekly(15),
    rb2: weekly(5),
    wr1: weekly(12),
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

describe('StartSitPage kickoff chips and late-swap watch', () => {
  it('shows a Kickoff chip per row priced on the bundled game times', () => {
    render(
      <MemoryRouter>
        <StartSitPage league={league()} />
      </MemoryRouter>,
    );
    const starters = screen.getByRole('table', { name: /optimal starters/i });
    expect(
      within(starters).getByRole('columnheader', { name: 'Kickoff' }),
    ).toBeDefined();
    // DAL's week-8 kickoff is the Sunday 1pm slot; KC's is Sunday 4pm.
    const rows = within(starters).getAllByRole('row');
    const text = rows.map(r => r.textContent ?? '').join('\n');
    expect(text).toMatch(/rb1.*Sun 1pm/s);
    expect(text).toMatch(/qb1.*Sun 4pm/s);
    // Full kickoff time in the hover/aria title.
    expect(
      within(starters).getAllByTitle(/kicks off/i)[0].getAttribute('title'),
    ).toMatch(/ET$/);
  });

  it('names the late-swap insurance piece in the watch section', () => {
    render(
      <MemoryRouter>
        <StartSitPage league={league()} />
      </MemoryRouter>,
    );
    // rb2 (KC, Sun 4pm) is benched behind rb1 (DAL, Sun 1pm): he is the only
    // player still swappable after the early window locks.
    const watch = screen.getByRole('list', { name: 'Late-swap watch' });
    expect(watch.textContent).toMatch(/Late-swap insurance: rb2 \(Sun 4pm\)/);
    expect(watch.textContent).toMatch(/stays swappable until/);
  });

  it('does not render the watch section when nothing is flagged', () => {
    // All players in the same kickoff slot, nobody on a game-time decision:
    // no insurance alert can fire (nobody plays later than the starters).
    const l = league();
    l.teams[0].roster = l.teams[0].roster!.map(p => ({ ...p, team: 'DAL' }));
    render(
      <MemoryRouter>
        <StartSitPage league={l} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('list', { name: 'Late-swap watch' })).toBeNull();
  });
});
