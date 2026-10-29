// WeeklyPointsChart (backlog item 8): week-by-week points as an accessible
// SVG chart — bar count, best-week highlight, summary label, and the
// screen-reader data table. (Series-shaping logic lives in src/utils/weekSeries
// with its own tests.)

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { WeeklyPointsChart } from './WeeklyPointsChart';

describe('WeeklyPointsChart', () => {
  const weekly = { 1: 12.5, 2: 0, 4: 31.2 };

  it('renders one bar per played week and highlights the best', () => {
    render(<WeeklyPointsChart playerName="Pack Runner" weekly={weekly} />);
    const bars = screen.getAllByTestId('week-bar');
    expect(bars).toHaveLength(3);
    const best = bars.filter(b =>
      b.getAttribute('class')?.includes('best'),
    );
    expect(best).toHaveLength(1);
    // The scoreless week renders a bar too (played-but-zero, not a gap).
    const zeroBar = bars.find(b =>
      b.parentElement?.querySelector('title')?.textContent?.includes('Week 2'),
    );
    expect(zeroBar).toBeDefined();
  });

  it('summarizes the series in the chart aria-label', () => {
    render(<WeeklyPointsChart playerName="Pack Runner" weekly={weekly} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(
      /Pack Runner.*3 games.*best week 4 with 31\.2 points.*average 14\.6/,
    );
  });

  it('exposes the full series in a screen-reader table', () => {
    render(<WeeklyPointsChart playerName="Pack Runner" weekly={weekly} />);
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(5); // header + weeks 1..4
    expect(within(table).getByText('no game')).toBeTruthy();
    expect(within(table).getByText('12.5')).toBeTruthy();
  });

  it('renders nothing without a played game', () => {
    const { container } = render(
      <WeeklyPointsChart playerName="Pack Runner" weekly={{}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
