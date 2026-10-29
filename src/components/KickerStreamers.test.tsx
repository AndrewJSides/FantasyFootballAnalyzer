// KickerStreamers rendering: top-5 unrostered kickers render with matchup
// chips; a rostered kicker's team never appears; all-rostered renders the
// empty state; the footnote names the scoring and data range.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { KickerStreamers } from './KickerStreamers';
import { NFL_TEAMS } from '@/data/nflTeams';
import type { League, Team, Player } from '@/types';

function kickerPlayer(team: string, name: string, position = 'K'): Player {
  return {
    id: `${team}-k`,
    platformId: '',
    name,
    position,
    team,
  };
}

function leagueWithKickers(kickers: Array<{ team: string; name: string; position?: string }>): League {
  const team: Team = {
    id: 't1',
    name: 'Team 1',
    roster: kickers.map(k => kickerPlayer(k.team, k.name, k.position)),
  } as Team;
  return { teams: [team], currentWeek: 8 } as League;
}

describe('KickerStreamers', () => {
  it('renders five unrostered kickers and skips the rostered one', () => {
    render(
      <KickerStreamers
        league={leagueWithKickers([{ team: 'DAL', name: 'Brandon Aubrey', position: 'K' }])}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rows).toHaveLength(5);
    const rowHeads = rows.map(r => within(r).getByRole('rowheader').textContent ?? '');
    expect(rowHeads.some(t => t.includes('Brandon Aubrey'))).toBe(false);
  });

  it('renders the all-rostered empty state', () => {
    const all = Object.keys(NFL_TEAMS).map(team => ({ team, name: `${team} Kicker` }));
    render(<KickerStreamers league={leagueWithKickers(all)} />);
    expect(
      screen.getByText(/every kicking team with a game/i),
    ).toBeInTheDocument();
  });

  it('shows the week and the method footnote', () => {
    render(<KickerStreamers league={leagueWithKickers([])} />);
    expect(screen.getByText(/Week 8/)).toBeInTheDocument();
    expect(
      screen.getByText(/standard kicker scoring/i),
    ).toBeInTheDocument();
  });
});
