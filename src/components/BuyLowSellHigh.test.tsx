// BuyLowSellHigh rendering: buy-low and sell-high targets render in
// their tables with gaps, reasons, and (league mode) the owning team;
// empty sides render their empty states; ROS schedule cells show.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BuyLowSellHigh } from './BuyLowSellHigh';
import type { MarketTarget } from '@/utils/buyLowSellHigh';
import type { PoolPlayer } from '@/types/draft';

function target(overrides: Partial<MarketTarget> & { id: string; name: string }): MarketTarget {
  return {
    player: {
      id: overrides.id,
      name: overrides.name,
      pos: 'WR',
      team: 'DAL',
    } as PoolPlayer,
    rosteredBy: null,
    last3: 10,
    last3Weeks: 3,
    projection: 14.2,
    gap: 4.2,
    vor: 12,
    ros: null,
    reasons: ['Averaging 10 over his last 3 — 4.2 under forward projection.'],
    ...overrides,
  };
}

const buy = target({ id: 'wr-cold', name: 'Cold Receiver', rosteredBy: 'Delta Squad' });
const sell = target({
  id: 'wr-hot',
  name: 'Hot Receiver',
  gap: -4.5,
  reasons: ['Averaging 24, 4.5 over his forward projection — peak sell window.'],
});

describe('BuyLowSellHigh', () => {
  it('renders both tables with players, gaps, and the owning team', () => {
    render(
      <BuyLowSellHigh week={8} buyLow={[buy]} sellHigh={[sell]} showRosteredBy />,
    );
    expect(screen.getByText('Cold Receiver')).toBeInTheDocument();
    expect(screen.getByText('Hot Receiver')).toBeInTheDocument();
    expect(screen.getByText('−4.2')).toBeInTheDocument();
    expect(screen.getByText('+4.5')).toBeInTheDocument();
    expect(screen.getByText('Delta Squad')).toBeInTheDocument();
    expect(screen.getByText(/Week 8/)).toBeInTheDocument();
  });

  it('hides the rostered-by column in guest mode', () => {
    render(
      <BuyLowSellHigh week={8} buyLow={[buy]} sellHigh={[]} showRosteredBy={false} />,
    );
    expect(screen.queryByText('Delta Squad')).not.toBeInTheDocument();
    expect(screen.queryByText('Rostered by')).not.toBeInTheDocument();
  });

  it('renders empty states when a side has no targets', () => {
    render(<BuyLowSellHigh week={8} buyLow={[]} sellHigh={[]} showRosteredBy />);
    expect(screen.getByText(/no buy-low candidates/i)).toBeInTheDocument();
    expect(screen.getByText(/no sell-high candidates/i)).toBeInTheDocument();
  });

  it('shows the ROS schedule cell and the method footnote', () => {
    const withRos = target({
      id: 'wr-ros',
      name: 'ROS Receiver',
      ros: { avgRank: 8.4, label: 'favorable', games: [] },
    });
    render(<BuyLowSellHigh week={8} buyLow={[withRos]} sellHigh={[]} showRosteredBy />);
    const row = within(screen.getByText('ROS Receiver').closest('tr')!);
    expect(row.getByText(/Soft \(8.4\)/)).toBeInTheDocument();
    expect(screen.getByText(/matchup-neutral/i)).toBeInTheDocument();
  });
});
