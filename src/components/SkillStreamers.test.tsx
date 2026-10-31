// SkillStreamers rendering: top-5 unrostered QBs/TEs render with matchup
// chips; a rostered starter's pool id never appears; all-rostered renders
// the empty state; the footnote names the scoring and data range.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SkillStreamers } from './SkillStreamers';
import { NFL_TEAMS } from '@/data/nflTeams';
import { startingSkillPlayers } from '@/utils/skillStreamers';
import type { League, Team, Player } from '@/types';

function rosterPlayer(name: string, position: string, team: string): Player {
  return { id: `${team}-${position}-rostered`, platformId: '', name, position, team };
}

function leagueWith(players: Player[]): League {
  const team: Team = { id: 't1', name: 'Team 1', roster: players } as Team;
  return { teams: [team], currentWeek: 8 } as League;
}

describe('SkillStreamers', () => {
  it('renders five unrostered QBs and skips the rostered starter', () => {
    // Kyler Murray is the week-8 QB streamer #1 in the bundled data; rostering
    // him by name must remove him from the table.
    const league = leagueWith([rosterPlayer('Kyler Murray', 'QB', 'MIN')]);
    render(<SkillStreamers league={league} position="QB" />);
    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rows).toHaveLength(5);
    const rowHeads = rows.map(r => within(r).getByRole('rowheader').textContent ?? '');
    expect(rowHeads.some(t => t.includes('Kyler Murray'))).toBe(false);
    expect(rowHeads.some(t => t.includes('Jalen Hurts'))).toBe(true);
    expect(screen.getByRole('heading', { name: 'QB Streamers' })).toBeInTheDocument();
  });

  it('renders five unrostered TEs', () => {
    render(<SkillStreamers league={leagueWith([])} position="TE" />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    const rowHeads = rows.map(r => within(r).getByRole('rowheader').textContent ?? '');
    expect(rowHeads.some(t => t.includes('T.J. Hockenson'))).toBe(true);
    expect(screen.getByRole('heading', { name: 'TE Streamers' })).toBeInTheDocument();
  });

  it('renders the all-rostered empty state', () => {
    const starters = startingSkillPlayers('QB');
    const players = Object.keys(NFL_TEAMS).flatMap(team => {
      const s = starters.get(team);
      return s ? [rosterPlayer(s.name, 'QB', team)] : [];
    });
    render(<SkillStreamers league={leagueWith(players)} position="QB" />);
    expect(screen.getByText(/every starting quarterback with a game/i)).toBeInTheDocument();
  });

  it('shows the week and the method footnote', () => {
    render(<SkillStreamers league={leagueWith([])} position="TE" />);
    expect(screen.getByText(/Week 8/)).toBeInTheDocument();
    expect(screen.getByText(/half-PPR scoring/i)).toBeInTheDocument();
  });
});
