// ScoreDistBars (backlog item 24b): two-team P10–P90 range bars on a shared
// scale — row labels, aria summary, and correct band/tick positioning.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScoreDistBars from './ScoreDistBars';

const rows = [
  { label: 'Alpha', dist: { p10: 100, median: 115, p90: 130 } },
  { label: 'Beta', dist: { p10: 90, median: 105, p90: 125 } },
];

describe('ScoreDistBars', () => {
  it('renders one row per team with its label and range numbers', () => {
    render(<ScoreDistBars rows={rows} />);
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();
    expect(screen.getByText('100.0–130.0')).toBeDefined();
    expect(screen.getByText('90.0–125.0')).toBeDefined();
  });

  it('summarizes both distributions in the accessible label', () => {
    const { container } = render(<ScoreDistBars rows={rows} />);
    const img = container.querySelector('[role="img"]');
    const label = img?.getAttribute('aria-label') ?? '';
    expect(label).toContain(
      'Alpha: 80% of simulated weeks score between 100.0 and 130.0 (median 115.0)',
    );
    expect(label).toContain(
      'Beta: 80% of simulated weeks score between 90.0 and 125.0 (median 105.0)',
    );
  });

  it('positions bands and median ticks on the shared scale', () => {
    const { container } = render(<ScoreDistBars rows={rows} />);
    // Shared scale: lo = 90 - 5% of (130-90) = 88, hi = 132, span 44.
    const styleNums = (el: Element): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const part of (el.getAttribute('style') ?? '').split(';')) {
        const [k, v] = part.split(':').map(s => s.trim());
        if (k && v) out[k] = parseFloat(v);
      }
      return out;
    };
    const bands = container.querySelectorAll('[data-testid="dist-band"]');
    expect(bands).toHaveLength(2);
    const alpha = styleNums(bands[0]);
    // (100-88)/44 = 27.27%, (130-88)/44 = 95.45% → width 68.18%.
    expect(alpha['left']).toBeCloseTo(27.27, 1);
    expect(alpha['width']).toBeCloseTo(68.18, 1);
    const ticks = container.querySelectorAll('[data-testid="dist-tick"]');
    expect(ticks).toHaveLength(2);
    // (115-88)/44 = 61.36%.
    expect(styleNums(ticks[0])['left']).toBeCloseTo(61.36, 1);
  });
});
