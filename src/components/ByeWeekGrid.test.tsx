// Bye Week Grid rendering against a hand-built grid: week columns, worst
// cell highlighted, clear weeks as dashes, starter names in aria-labels,
// and totals — plus nothing renders for an empty grid.

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ByeGrid } from '@/utils/byeGrid';
import { ByeWeekGrid } from './ByeWeekGrid';

const GRID: ByeGrid = {
  weeks: [9, 10, 11],
  rows: [
    {
      teamId: 'a', teamName: 'Alpha',
      cells: [
        { week: 9, count: 2, names: ['Star QB', 'Star TE'] },
        { week: 10, count: 0, names: [] },
        { week: 11, count: 1, names: ['RB Two'] },
      ],
      total: 3, worstWeek: 9, worstCount: 2,
    },
    {
      teamId: 'b', teamName: 'Beta',
      cells: [
        { week: 9, count: 0, names: [] },
        { week: 10, count: 0, names: [] },
        { week: 11, count: 0, names: [] },
      ],
      total: 0, worstWeek: null, worstCount: 0,
    },
  ],
};

describe('ByeWeekGrid', () => {
  it('renders week columns and per-team counts with totals', () => {
    render(<ByeWeekGrid grid={GRID} />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('W9')).toBeTruthy();
    expect(within(table).getByText('W11')).toBeTruthy();
    const alpha = within(table).getByText('Alpha').closest('tr')!;
    expect(within(alpha).getByText('2')).toBeTruthy();
    expect(within(alpha).getByText('3')).toBeTruthy();
  });

  it('names the starters on bye in the worst cell aria-label and dashes clear weeks', () => {
    render(<ByeWeekGrid grid={GRID} />);
    const worst = screen.getByLabelText('Alpha: 2 starters on bye in week 9: Star QB, Star TE');
    expect(worst.textContent).toBe('2');
    expect(screen.getByLabelText('Alpha: no starters on bye in week 10').textContent).toBe('—');
  });

  it('renders nothing for an empty grid', () => {
    const { container } = render(<ByeWeekGrid grid={{ weeks: [9], rows: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
