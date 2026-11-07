// Team Needs Matrix rendering against hand-built team profiles: verdict
// chips follow the need/surplus flags, best players and VOR render, and an
// empty profile list renders nothing.

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Team } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import type { PositionProfile, TeamProfile } from '@/utils/tradeFinder';
import { TeamNeedsMatrix } from './TeamNeedsMatrix';

function poolPlayer(id: string, name: string, pos: string): PoolPlayer {
  return { id, name, pos } as PoolPlayer;
}

function profile(
  pos: 'QB' | 'RB' | 'WR' | 'TE',
  best: number,
  need: boolean,
  surplus: boolean,
  bestName: string | null,
): PositionProfile {
  return {
    position: pos,
    best,
    startable: bestName ? 1 : 0,
    need,
    surplus,
    depthChart: bestName ? [poolPlayer(`${pos}-1`, bestName, pos)] : [],
  };
}

function teamProfile(
  id: string,
  name: string,
  cells: Partial<
    Record<'QB' | 'RB' | 'WR' | 'TE', ReturnType<typeof profile>>
  >,
): TeamProfile {
  const fallback = (pos: 'QB' | 'RB' | 'WR' | 'TE'): PositionProfile =>
    profile(pos, 0, false, false, null);
  return {
    team: { id, name } as Team,
    positions: {
      QB: cells.QB ?? fallback('QB'),
      RB: cells.RB ?? fallback('RB'),
      WR: cells.WR ?? fallback('WR'),
      TE: cells.TE ?? fallback('TE'),
    },
    unmapped: 0,
    unit: 'VOR',
  };
}

const profiles: TeamProfile[] = [
  teamProfile('a', 'Alpha', {
    QB: profile('QB', 42.3, false, true, 'Star QB'),
    RB: profile('RB', 8.1, true, false, 'Weak RB'),
  }),
  teamProfile('b', 'Beta', {
    QB: profile('QB', 20.0, false, false, 'Mid QB'),
    RB: profile('RB', 15.5, true, true, 'Deep RB'),
    TE: profile('TE', 0, false, false, null),
  }),
];

describe('TeamNeedsMatrix', () => {
  it('renders team rows with best players and VOR', () => {
    render(<TeamNeedsMatrix profiles={profiles} />);
    const table = screen.getByRole('table', { name: 'Team needs by position' });
    const alpha = within(table).getByRole('rowheader', { name: 'Alpha' });
    expect(alpha).toBeTruthy();
    expect(screen.getByText('Star QB')).toBeTruthy();
    expect(screen.getByText('42.3 VOR')).toBeTruthy();
    expect(screen.getByText('Weak RB')).toBeTruthy();
  });

  it('shows Need, Surplus, and Balanced chips from the flags', () => {
    render(<TeamNeedsMatrix profiles={profiles} />);
    // Alpha QB: surplus only; Alpha RB: need only; Beta QB: balanced.
    const alphaQb = screen.getByLabelText(/Alpha at QB:/);
    expect(within(alphaQb as HTMLElement).getByText('Surplus')).toBeTruthy();
    expect(within(alphaQb as HTMLElement).queryByText('Need')).toBeNull();
    const alphaRb = screen.getByLabelText(/Alpha at RB:/);
    expect(within(alphaRb as HTMLElement).getByText('Need')).toBeTruthy();
    const betaQb = screen.getByLabelText(/Beta at QB:/);
    expect(within(betaQb as HTMLElement).getByText('Balanced')).toBeTruthy();
  });

  it('shows both chips when a position is need and surplus', () => {
    render(<TeamNeedsMatrix profiles={profiles} />);
    const betaRb = screen.getByLabelText(/Beta at RB:/);
    expect(within(betaRb as HTMLElement).getByText('Need')).toBeTruthy();
    expect(within(betaRb as HTMLElement).getByText('Surplus')).toBeTruthy();
  });

  it('renders a dash for an empty position without crashing', () => {
    render(<TeamNeedsMatrix profiles={profiles} />);
    const betaTe = screen.getByLabelText(/Beta at TE:/);
    expect(within(betaTe as HTMLElement).getByText('—')).toBeTruthy();
    expect(within(betaTe as HTMLElement).getByText('0 VOR')).toBeTruthy();
  });

  it('renders nothing for an empty profile list', () => {
    const { container } = render(<TeamNeedsMatrix profiles={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('TeamNeedsMatrix dynasty units (backlog item 193)', () => {
  it('labels best values in dynasty pts when the profiles are dynasty-priced', () => {
    const dynastyProfiles: TeamProfile[] = profiles.map(p => ({
      ...p,
      unit: 'dynasty pts' as const,
    }));
    render(<TeamNeedsMatrix profiles={dynastyProfiles} />);
    expect(screen.getByText('42.3 dynasty pts')).toBeTruthy();
    expect(screen.queryByText('42.3 VOR')).toBeNull();
  });
});
