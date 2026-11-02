// TradeValueMovers rendering: risers + fallers tables with rank movement,
// value change, owner column in league mode; hides with <2 snapshots or
// no qualifying movers.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TradeValueMovers } from './TradeValueMovers';
import type { PoolPlayer } from '@/types/draft';
import type { TradeValueRow, TradeValueSnapshot } from '@/utils/tradeValues';

function player(id: string, name: string): PoolPlayer {
  return {
    id,
    name,
    pos: 'RB',
    team: 'DAL',
    fullPPR: 100,
    value: 50,
  } as unknown as PoolPlayer;
}

function rowsOf(ids: string[]): TradeValueRow[] {
  return ids.map((id, i) => ({
    player: player(id, `Player ${id}`),
    value: 100 - i * 10,
    tier: 1,
    posRank: i + 1,
  }) as TradeValueRow);
}

function snap(date: string, values: Record<string, number>): TradeValueSnapshot {
  return { date, values };
}

describe('TradeValueMovers', () => {
  const rows = rowsOf(['a', 'b', 'c', 'd']);

  it('renders risers and fallers with rank movement and signed deltas', () => {
    render(
      <TradeValueMovers
        snapshots={[snap('2026-11-01', { a: 90, b: 80 }), snap('2026-11-02', { a: 84, b: 88 })]}
        rows={rows}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Value Movers' })).toBeDefined();
    // a fell (falls first in Fallers), b rose
    expect(screen.getByRole('cell', { name: /Rank moved from 1 to 2/ })).toBeDefined();
    expect(screen.getByRole('cell', { name: /Rank moved from 2 to 1/ })).toBeDefined();
    expect(screen.getByRole('cell', { name: /fell 6\.0/ })).toBeDefined();
    expect(screen.getByRole('cell', { name: /rose 8\.0/ })).toBeDefined();
  });

  it('shows owner names in league mode', () => {
    const owners = new Map([
      ['a', 'Alpha'],
      ['b', 'Beta'],
    ]);
    render(
      <TradeValueMovers
        snapshots={[snap('2026-11-01', { a: 90, b: 80 }), snap('2026-11-02', { a: 84, b: 88 })]}
        rows={rows}
        owners={owners}
      />,
    );
    expect(screen.getAllByRole('columnheader', { name: 'Owner' })).toHaveLength(2);
    expect(screen.getAllByRole('cell', { name: 'Alpha' })[0]).toBeDefined();
    expect(screen.getAllByRole('cell', { name: 'Beta' })[0]).toBeDefined();
  });

  it('hides with fewer than two snapshots or no qualifying movers', () => {
    const { container: one } = render(
      <TradeValueMovers snapshots={[snap('2026-11-01', { a: 90 })]} rows={rows} />,
    );
    expect(one.querySelector('section')).toBeNull();
    const { container: quiet } = render(
      <TradeValueMovers
        snapshots={[snap('2026-11-01', { a: 90 }), snap('2026-11-02', { a: 90.5 })]}
        rows={rows}
      />,
    );
    expect(quiet.querySelector('section')).toBeNull();
  });
});
