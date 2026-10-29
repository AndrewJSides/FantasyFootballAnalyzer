// DstStreamers rendering: top-5 unrostered defenses render with matchup
// chips; a rostered defense never appears; all-rostered renders the empty
// state; the footnote names the data range.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DstStreamers } from './DstStreamers';
import { NFL_TEAMS } from '@/data/nflTeams';
import type { League, Team, Player } from '@/types';

function defensePlayer(team: string, position = 'DST'): Player {
  return {
    id: `${team}-dst`,
    platformId: '',
    name: `${team} Defense`,
    position,
    team,
  };
}

function leagueWithDefs(defs: Array<{ team: string; position?: string }>): League {
  const team: Team = {
    id: 't1',
    name: 'Team 1',
    roster: defs.map(d => defensePlayer(d.team, d.position)),
  } as Team;
  return { teams: [team], currentWeek: 8 } as League;
}

describe('DstStreamers', () => {
  it('renders five unrostered defenses and skips the rostered one', () => {
    render(<DstStreamers league={leagueWithDefs([{ team: 'DET', position: 'D/ST' }])} />);
    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rows).toHaveLength(5);
    const rowHeads = rows.map(r => within(r).getByRole('rowheader').textContent ?? '');
    expect(rowHeads.some(t => t.includes('DET'))).toBe(false);
  });

  it('renders the all-rostered empty state', () => {
    const all = Object.keys(NFL_TEAMS).map(team => ({ team }));
    render(<DstStreamers league={leagueWithDefs(all)} />);
    expect(
      screen.getByText(/every defense with a game/i),
    ).toBeInTheDocument();
  });

  it('shows the week and the method footnote', () => {
    render(<DstStreamers league={leagueWithDefs([])} />);
    expect(screen.getByText(/Week 8/)).toBeInTheDocument();
    expect(
      screen.getByText(/standard D\/ST scoring/i),
    ).toBeInTheDocument();
  });
});
