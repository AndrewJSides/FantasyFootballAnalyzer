// Weekly Grades section (backlog item 183): the graded week renders its
// headline numbers and biggest misses, and the week selector swaps the
// story in place when more than one graded week is bundled.
import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { WeeklyGrades } from './WeeklyGrades';
import type { BundledGradeWeek } from '@/data/projectionGrades';
import type { RawGradeFile } from '@/utils/weeklyGrades';

function gradeWeek(week: number, mae: number): BundledGradeWeek {
  const file: RawGradeFile = {
    source: 'sleeper',
    season: 2026,
    week,
    graded_at: '2026-11-03T05:31:47.777Z',
    threshold: 5,
    scoring: 'pts_ppr',
    summary: {
      graded: 100,
      outperformed: 20,
      underperformed: 30,
      inLine: 50,
      meanDiff: -0.5,
      meanAbsDiff: mae,
      primaryReasonCounts: { 'did-not-play': 10 },
      breakoutCount: 0,
      byPosition: {
        QB: {
          graded: 25,
          outperformed: 5,
          underperformed: 7,
          inLine: 13,
          meanDiff: -0.4,
          meanAbsDiff: mae,
        },
      },
    },
    grades: [],
  };
  return { season: 2026, week, file };
}

describe('WeeklyGrades', () => {
  it('renders the latest graded week and hides the selector with one week', () => {
    render(<WeeklyGrades weeks={[gradeWeek(8, 5.64)]} />);
    const section = screen.getByRole('region', {
      name: 'Weekly grades — how the projections actually did',
    });
    expect(section.textContent).toMatch(/Week 8: 100 players graded/);
    expect(within(section).getByText('5.64 pts')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Week 8' })).not.toBeInTheDocument();
  });

  it('swaps the story in place when the week selector changes', () => {
    render(<WeeklyGrades weeks={[gradeWeek(8, 5.64), gradeWeek(7, 6.1)]} />);
    const section = screen.getByRole('region', {
      name: 'Weekly grades — how the projections actually did',
    });
    expect(section.textContent).toMatch(/Week 8: 100 players graded/);
    fireEvent.click(screen.getByRole('button', { name: 'Week 7' }));
    expect(section.textContent).toMatch(/Week 7: 100 players graded/);
    expect(within(section).getByText('6.10 pts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Week 7' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('renders nothing when no graded week is bundled', () => {
    const { container } = render(<WeeklyGrades weeks={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
