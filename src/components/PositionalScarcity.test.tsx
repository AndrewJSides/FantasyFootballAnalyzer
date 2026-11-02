// PositionalScarcity rendering: four-position scarcity table with starter
// demand, starter line, best waiver value, rostered counts, and verdict
// chips; guest mode prices the typical-draft-order wire, league mode the
// real one; hides on an empty chart.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PositionalScarcity } from './PositionalScarcity';
import type { PoolPlayer } from '@/types/draft';
import type { ValueLeague } from '@/utils/projectionValues';
import type { TradeValueRow } from '@/utils/tradeValues';

const GUEST_LEAGUE: ValueLeague = {
  budget: 200,
  teams: 10,
  rounds: 16,
  rosterSlots: {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    FLEX: 1,
    SUPERFLEX: 0,
    K: 1,
    DST: 1,
    BENCH: 6,
    IR: 1,
  },
  scoring: 'ppr',
};

function rows(): TradeValueRow[] {
  const out: TradeValueRow[] = [];
  const mk = (pos: string, n: number, top: number, step: number) => {
    for (let i = 1; i <= n; i++) {
      const player = { id: `${pos}${i}`, name: `${pos} ${i}`, pos, team: 'XXX' } as PoolPlayer;
      out.push({
        player,
        value: Math.round((top - (i - 1) * step) * 10) / 10,
        tier: 4,
        posRank: i,
      });
    }
  };
  mk('QB', 30, 60, 1.5);
  mk('RB', 40, 100, 2.2);
  mk('WR', 40, 92, 2);
  mk('TE', 20, 45, 1.8);
  return out;
}

describe('PositionalScarcity', () => {
  it('renders the four-position table with demand, line, wire, and verdicts', () => {
    render(<PositionalScarcity rows={rows()} valueLeague={GUEST_LEAGUE} />);
    expect(screen.getByRole('heading', { name: 'Positional Scarcity' })).toBeDefined();
    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
      expect(screen.getByRole('rowheader', { name: pos })).toBeDefined();
    }
    // RB demand line for the default shape is 24.
    const rbRow = screen.getByRole('rowheader', { name: 'RB' }).closest('tr')!;
    expect(rbRow.textContent).toContain('24');
    // Verdict chips carry the plain-language detail in the accessible name.
    expect(
      screen.getByRole('cell', { name: /RB: 24 starters needed/ }),
    ).toBeDefined();
    // Guest footnote names the typical-draft-order assumption.
    expect(screen.getByText(/typical-draft-order assumption/)).toBeDefined();
  });

  it('prices the real wire in league mode', () => {
    const data = rows();
    // League holds the top 24 RBs; the wire starts at RB25 (47.2).
    const rostered = new Set(
      data.filter(r => r.player.pos === 'RB' && r.posRank <= 24).map(r => r.player.id),
    );
    render(
      <PositionalScarcity rows={data} valueLeague={GUEST_LEAGUE} rosteredIds={rostered} />,
    );
    const rbRow = screen.getByRole('rowheader', { name: 'RB' }).closest('tr')!;
    expect(rbRow.textContent).toContain('47.2');
    expect(rbRow.textContent).toContain('24');
    expect(screen.getByText(/real rosters from your latest sync/)).toBeDefined();
  });

  it('flags a thin position when the wire is bare', () => {
    const data = rows();
    const rostered = new Set(
      data.filter(r => r.player.pos === 'TE').map(r => r.player.id),
    );
    render(
      <PositionalScarcity rows={data} valueLeague={GUEST_LEAGUE} rosteredIds={rostered} />,
    );
    const teRow = screen.getByRole('rowheader', { name: 'TE' }).closest('tr')!;
    expect(teRow.textContent).toContain('Thin');
    expect(
      screen.getByRole('cell', { name: /nobody rosterable on the wire/ }),
    ).toBeDefined();
  });

  it('hides with an empty chart', () => {
    const { container } = render(
      <PositionalScarcity rows={[]} valueLeague={GUEST_LEAGUE} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
