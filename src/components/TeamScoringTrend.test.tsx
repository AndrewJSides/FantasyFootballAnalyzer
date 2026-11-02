// TeamScoringTrend rendering: bars per week, league-avg line, best-lineup
// markers, and the accessible summary + data table.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamScoringTrend } from './TeamScoringTrend';
import type { TeamScoringTrend as Trend } from '@/utils/teamScoringTrend';

function trend(withLineup: boolean): Trend {
  return {
    weeks: [
      { week: 1, points: 120, leagueAvg: 105, bestLineup: withLineup ? 132 : null },
      { week: 2, points: 80, leagueAvg: 102.5, bestLineup: withLineup ? 95 : null },
    ],
    seasonAvg: 100,
    bestWeek: 1,
  };
}

describe('TeamScoringTrend', () => {
  it('renders one bar per week with an accessible summary', () => {
    render(<TeamScoringTrend teamName="Alpha" trend={trend(true)} />);
    expect(screen.getAllByTestId('trend-bar')).toHaveLength(2);
    const chart = screen.getByRole('img');
    expect(chart.getAttribute('aria-label')).toContain('Scoring trend for Alpha');
    expect(chart.getAttribute('aria-label')).toContain('2 completed weeks');
  });

  it('marks the best lineup with a diamond when weekly lineups exist', () => {
    render(<TeamScoringTrend teamName="Alpha" trend={trend(true)} />);
    expect(screen.getAllByTestId('best-lineup-mark')).toHaveLength(2);
  });

  it('omits the best-lineup markers and legend entry without weekly lineups', () => {
    render(<TeamScoringTrend teamName="Alpha" trend={trend(false)} />);
    expect(screen.queryAllByTestId('best-lineup-mark')).toHaveLength(0);
  });

  it('exposes the full series in a screen-reader table', () => {
    render(<TeamScoringTrend teamName="Alpha" trend={trend(true)} />);
    const table = screen.getByRole('table', { name: 'Weekly scoring trend for Alpha' });
    expect(table).toBeDefined();
    expect(screen.getByRole('rowheader', { name: 'Week 1' })).toBeDefined();
  });
});
