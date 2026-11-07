// PointsAllowedPage (backlog item 102): the /points-allowed board renders
// every defense's fantasy points allowed per game, softest first, with
// position tabs swapping the board in place.

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PointsAllowedPage } from './PointsAllowedPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <PointsAllowedPage />
    </MemoryRouter>,
  );
}

describe('PointsAllowedPage', () => {
  it('renders the QB board by default, softest defense first', () => {
    renderPage();
    const table = screen.getByRole('table', {
      name: /fantasy points allowed per game to qbs/i,
    });
    const rows = within(table).getAllByRole('row');
    // 32 defenses + header row.
    expect(rows).toHaveLength(33);
    const firstCells = within(rows[1]).getAllByRole('cell');
    // Bundled 2026 data: DET is rank 1 vs QBs through week 7.
    expect(firstCells[0]).toHaveTextContent('1');
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('DET');
    expect(firstCells[1]).toHaveTextContent('26.3');
  });

  it('swaps to the RB board on tab click with aria-pressed state', () => {
    renderPage();
    const rbTab = screen.getByRole('button', { name: 'RB' });
    expect(rbTab).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(rbTab);
    expect(rbTab).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('table', { name: /fantasy points allowed per game to rbs/i }),
    ).toBeInTheDocument();
  });

  it('labels the matchup read with a plain-language accessible name', () => {
    renderPage();
    const table = screen.getByRole('table', {
      name: /fantasy points allowed per game to qbs/i,
    });
    const rows = within(table).getAllByRole('row');
    const read = within(rows[1]).getByText('Favorable');
    expect(read).toHaveAttribute(
      'aria-label',
      expect.stringContaining('favorable matchup for your QB'),
    );
  });

  it('swaps to the K board on tab click, softest defense first', () => {
    renderPage();
    const kTab = screen.getByRole('button', { name: 'K' });
    expect(kTab).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(kTab);
    expect(kTab).toHaveAttribute('aria-pressed', 'true');
    const table = screen.getByRole('table', {
      name: /fantasy points allowed per game to kickers/i,
    });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(33);
    const firstCells = within(rows[1]).getAllByRole('cell');
    // Bundled 2026 data: IND gives the most to kickers through week 7.
    expect(firstCells[0]).toHaveTextContent('1');
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('IND');
    expect(firstCells[1]).toHaveTextContent('10.0');
    const read = within(rows[1]).getByText('Favorable');
    expect(read).toHaveAttribute(
      'aria-label',
      expect.stringContaining('favorable matchup for your kicker'),
    );
  });

  it('swaps to the DST board on tab click, softest offense first', () => {
    renderPage();
    const dstTab = screen.getByRole('button', { name: 'DST' });
    fireEvent.click(dstTab);
    expect(dstTab).toHaveAttribute('aria-pressed', 'true');
    const table = screen.getByRole('table', {
      name: /fantasy points given per game to opposing defenses/i,
    });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(33);
    const firstCells = within(rows[1]).getAllByRole('cell');
    // Bundled 2026 data: ARI gives the most to opposing defenses.
    expect(firstCells[0]).toHaveTextContent('1');
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('ARI');
    expect(firstCells[1]).toHaveTextContent('26.9');
    const read = within(rows[1]).getByText('Favorable');
    expect(read).toHaveAttribute(
      'aria-label',
      expect.stringContaining('favorable matchup for your defense'),
    );
    expect(
      screen.getByText(/ranks offenses by the fantasy points opposing defenses score/i),
    ).toBeInTheDocument();
  });

  it('names the completed-weeks basis in the method footnote', () => {
    renderPage();
    expect(
      screen.getByText(/completed weeks 1–7/i),
    ).toBeInTheDocument();
  });
});
