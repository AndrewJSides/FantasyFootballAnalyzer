// Model Report page rendering: the bundled weeks 1–8 snapshot renders its
// honest headline (model trails naive overall), the per-position table with
// the RB win, and the production no-term row of each term family.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ModelReportPage } from './ModelReportPage';

function renderPage() {
  render(
    <MemoryRouter>
      <ModelReportPage />
    </MemoryRouter>,
  );
}

describe('ModelReportPage', () => {
  it('renders the honest overall headline against the naive baseline', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Model Report' })).toBeInTheDocument();
    expect(screen.getByText(/6\.74 pts/)).toBeInTheDocument();
    expect(screen.getByText(/6\.72 pts/)).toBeInTheDocument();
    const headline = screen.getByRole('region', { name: "How good is TraderApe's projection?" });
    expect(within(headline).getByText(/trails naive/)).toBeInTheDocument();
  });

  it('renders the per-position table with the RB lead', () => {
    renderPage();
    const table = screen.getByRole('table', {
      name: /TraderApe model MAE vs the naive prior-mean baseline/,
    });
    const rb = within(table).getByRole('row', { name: /RB 448 5\.46 5\.50 -0\.04 58\.3% Beats naive/ });
    expect(rb).toBeInTheDocument();
  });

  it('marks the no-term row as in production for each term family', () => {
    renderPage();
    const tables = screen.getAllByRole('table', { name: /candidate pricings/ });
    expect(tables).toHaveLength(3);
    for (const table of tables) {
      expect(within(table).getByRole('row', { name: /no term .* Yes/ })).toBeInTheDocument();
    }
  });

  it('names the snapshot method and week range in the footnote', () => {
    renderPage();
    expect(screen.getByText(/week-by-week replay/)).toBeInTheDocument();
    expect(screen.getAllByText(/Weeks 1–8/).length).toBeGreaterThan(0);
  });

  it('renders the week 8 grade with its headline numbers', () => {
    renderPage();
    const section = screen.getByRole('region', {
      name: 'Weekly grades — how the projections actually did',
    });
    expect(section.textContent).toMatch(/Week 8: 230 players graded/);
    expect(within(section).getByText('5.64 pts')).toBeInTheDocument();
    expect(section.textContent).toMatch(/47 over \/ 62 under \/ 121 in line/);
    expect(section.textContent).toMatch(/projections ran high by 0\.52 pts/);
  });

  it('names the biggest week 8 beats and misses by player', () => {
    renderPage();
    const section = screen.getByRole('region', {
      name: 'Weekly grades — how the projections actually did',
    });
    expect(
      within(section).getByRole('row', { name: /Tyler Allgeier.*ARI.*7\.62.*36\.10/ }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole('row', { name: /Lamar Jackson.*BAL.*20\.37.*0\.00/ }),
    ).toBeInTheDocument();
  });
});
