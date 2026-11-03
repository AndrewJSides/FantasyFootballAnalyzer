// PlayoffStash rendering: unrostered pool players rank by playoff slate;
// a rostered player never appears; all-rostered renders the empty state;
// the window label names the league's playoff weeks.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PlayoffStash } from './PlayoffStash';
import type { League, Team, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

function poolPlayer(
  overrides: Partial<PoolPlayer> & { id: string; name: string },
): PoolPlayer {
  return {
    team: 'DAL',
    pos: 'RB',
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: null,
    baseValue: null,
    ...overrides,
  } as PoolPlayer;
}

const POOL: DraftPoolFile = {
  players: [
    poolPlayer({ id: 'dal-rb', name: 'Dal Back' }),
    poolPlayer({ id: 'kc-rb', name: 'Kc Back', team: 'KC' }),
    poolPlayer({ id: 'buf-wr', name: 'Buf Wide', team: 'BUF', pos: 'WR' }),
  ],
} as DraftPoolFile;

function leagueWithRoster(ids: string[]): League {
  const roster: Player[] = ids.map(id => {
    const p = POOL.players.find(x => x.id === id)!;
    return {
      id: p.id,
      platformId: '',
      name: p.name,
      position: p.pos,
      team: p.team,
    };
  });
  const team: Team = { id: 't1', name: 'Team 1', roster } as Team;
  return { teams: [team], playoffStartWeek: 15 } as League;
}

describe('PlayoffStash', () => {
  it('renders unrostered players and skips the rostered one', () => {
    render(<PlayoffStash league={leagueWithRoster(['dal-rb'])} pool={POOL} />);
    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rows).toHaveLength(2);
    const heads = rows.map(r => within(r).getByRole('rowheader').textContent ?? '');
    expect(heads.some(t => t.includes('Dal Back'))).toBe(false);
    expect(heads.some(t => t.includes('Kc Back'))).toBe(true);
    expect(heads.some(t => t.includes('Buf Wide'))).toBe(true);
  });

  it('names the playoff window and shows each slate week', () => {
    render(<PlayoffStash league={leagueWithRoster([])} pool={POOL} />);
    expect(screen.getByText(/Fantasy playoffs W15/)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/W15 vs/).length).toBe(3);
  });

  it('renders the all-rostered empty state', () => {
    render(
      <PlayoffStash
        league={leagueWithRoster(['dal-rb', 'kc-rb', 'buf-wr'])}
        pool={POOL}
      />,
    );
    expect(screen.getByText(/No playoff stash candidates/i)).toBeInTheDocument();
  });
});
