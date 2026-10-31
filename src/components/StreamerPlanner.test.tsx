// StreamerPlanner rendering: one row per remaining week with a pick at
// each position; rostered players never appear; the horizon follows the
// league's playoff start week.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { StreamerPlanner } from './StreamerPlanner';
import { rankDstStreamers } from '@/utils/dstStreamers';
import type { League, Team, Player } from '@/types';

function rosterPlayer(overrides: Partial<Player>): Player {
  return {
    id: 'x',
    platformId: '',
    name: 'Test Player',
    position: '',
    team: '',
    ...overrides,
  } as Player;
}

function leagueWithRoster(roster: Player[], extra: Partial<League> = {}): League {
  const team: Team = { id: 't1', name: 'Team 1', roster } as Team;
  return { teams: [team], currentWeek: 8, ...extra } as League;
}

describe('StreamerPlanner', () => {
  it('renders one row per remaining week through the week before the playoffs', () => {
    render(<StreamerPlanner league={leagueWithRoster([])} />);
    expect(screen.getByText(/Weeks 8–14/)).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rows).toHaveLength(7);
    const rowHeads = rows.map(r => within(r).getByRole('rowheader').textContent ?? '');
    expect(rowHeads[0]).toContain('Week 8');
    expect(rowHeads[6]).toContain('Week 14');
  });

  it('names a pick with a matchup chip in every position cell', () => {
    render(<StreamerPlanner league={leagueWithRoster([])} />);
    const rows = screen.getAllByRole('row').slice(1);
    for (const row of rows) {
      const cells = within(row).getAllByRole('cell');
      expect(cells).toHaveLength(4);
      for (const cell of cells) {
        expect(cell.textContent).toMatch(/vs [A-Z]{2,3}/);
      }
    }
  });

  it('honors the playoff start week for the horizon', () => {
    render(<StreamerPlanner league={leagueWithRoster([], { playoffStartWeek: 16 })} />);
    expect(screen.getByText(/Weeks 8–15/)).toBeInTheDocument();
  });

  it('a rostered defense never appears as a planned D/ST pick', () => {
    const top = rankDstStreamers(8, new Set(), 1)[0].team;
    render(
      <StreamerPlanner
        league={leagueWithRoster([
          rosterPlayer({ position: 'D/ST', team: top, name: `${top} D/ST` }),
        ])}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    for (const row of rows) {
      const dstCell = within(row).getAllByRole('cell')[0];
      const label = within(dstCell).queryAllByText(new RegExp(`^${top}$`));
      expect(label).toHaveLength(0);
    }
  });

  it('shows the method footnote', () => {
    render(<StreamerPlanner league={leagueWithRoster([])} />);
    expect(screen.getByText(/difficulty map, not a forecast/i)).toBeInTheDocument();
  });
});
