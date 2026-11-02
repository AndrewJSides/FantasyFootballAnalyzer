import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Player, Team, WeeklyMatchup } from '@/types';
import MatchupPage from './MatchupPage';

// 'XXX' is not a real NFL team, so no matchup blend fires and projections
// equal the flat weekly averages — deterministic for the assertions.
function mkPlayer(id: string, pos: string): Player {
  return { id, platformId: id, name: id, position: pos, team: 'XXX' } as Player;
}

function weekly(scores: number[]): Record<number, number> {
  const out: Record<number, number> = {};
  scores.forEach((s, i) => {
    out[i + 1] = s;
  });
  return out;
}

function matchup(week: number, a: string, b: string): WeeklyMatchup {
  return { week, team1Id: a, team2Id: b } as WeeklyMatchup;
}

function league(over: Partial<League> = {}): League {
  // Varied weekly scores give every starter real week-to-week volatility
  // (flat lines would zero the Monte Carlo swing-player variance).
  const rb1w: Record<string, number[]> = { A: [15, 17, 16], B: [15, 16, 17], C: [15, 16, 16], D: [15, 16, 16] };
  const rb2w: Record<string, number[]> = { A: [14, 15, 16], B: [14, 15, 16], C: [15, 15, 15], D: [15, 15, 15] };
  const rb3w: Record<string, number[]> = { A: [14, 14, 14], B: [13, 14, 15], C: [14, 14, 14], D: [14, 14, 14] };
  // Team A's rb4 sits on the bench within ~1.2 of rb2's projection (FLEX
  // takes rb3); everyone else's rb4 is buried — no close calls.
  const rb4w: Record<string, number[]> = { A: [12, 14, 15], B: [4, 5, 6], C: [5, 5, 5], D: [5, 5, 5] };
  const mkTeam = (id: string, name: string, isMyTeam: boolean): Team => {
    const roster = [
      mkPlayer(`${id}-rb1`, 'RB'),
      mkPlayer(`${id}-rb2`, 'RB'),
      mkPlayer(`${id}-rb3`, 'RB'),
      mkPlayer(`${id}-rb4`, 'RB'),
      mkPlayer(`${id}-wr1`, 'WR'),
      mkPlayer(`${id}-wr2`, 'WR'),
      mkPlayer(`${id}-te1`, 'TE'),
      mkPlayer(`${id}-qb1`, 'QB'),
    ];
    return { id, name, isMyTeam, roster } as Team;
  };
  const pw: Record<string, Record<number, number>> = {};
  for (const id of ['A', 'B', 'C', 'D']) {
    pw[`${id}-rb1`] = weekly(rb1w[id]);
    pw[`${id}-rb2`] = weekly(rb2w[id]);
    pw[`${id}-rb3`] = weekly(rb3w[id]);
    pw[`${id}-rb4`] = weekly(rb4w[id]);
    pw[`${id}-wr1`] = weekly([12, 12, 12]);
    pw[`${id}-wr2`] = weekly([10, 10, 10]);
    pw[`${id}-te1`] = weekly([8, 8, 8]);
    pw[`${id}-qb1`] = weekly([20, 20, 20]);
  }
  return {
    id: 'L',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    currentWeek: 9,
    rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BENCH: 6 },
    teams: [
      mkTeam('A', 'Alpha', true),
      mkTeam('B', 'Beta', false),
      mkTeam('C', 'Gamma', false),
      mkTeam('D', 'Delta', false),
    ],
    playerWeeklyPoints: pw,
    futureSchedule: [matchup(9, 'A', 'B'), matchup(9, 'C', 'D')],
    ...over,
  } as League;
}

function renderPage(l: League) {
  return render(
    <MemoryRouter>
      <MatchupPage league={l} />
    </MemoryRouter>,
  );
}

describe('MatchupPage', () => {
  it('defaults to my matchup and shows the projection, win prob, and distributions', () => {
    renderPage(league());
    expect(screen.getByRole('heading', { name: 'Matchup' })).toBeInTheDocument();
    // My matchup (Alpha vs Beta) is the selected one by default.
    expect(
      screen.getByRole('button', { name: 'Alpha vs Beta', pressed: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Week 9: Alpha vs Beta/ })).toBeInTheDocument();
    expect(screen.getByText(/Projected score: Alpha/)).toBeInTheDocument();
    // Both teams' P10–P90 bands render with the accessible summary.
    const dists = screen.getAllByRole('img');
    expect(dists.some(d => d.getAttribute('aria-label')?.includes('80% of simulated weeks'))).toBe(true);
    // Swing players are named.
    expect(screen.getByRole('heading', { name: 'Swing players' })).toBeInTheDocument();
  });

  it('switches matchups through the picker', () => {
    renderPage(league());
    fireEvent.click(screen.getByRole('button', { name: 'Gamma vs Delta' }));
    expect(
      screen.getByRole('button', { name: 'Gamma vs Delta', pressed: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Week 9: Gamma vs Delta/ })).toBeInTheDocument();
  });

  it('flags the start/sit close call in my game plan', () => {
    renderPage(league());
    // Game plan defaults to my team (Alpha).
    expect(screen.getByRole('heading', { name: 'Game plan: Alpha' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /projected optimal lineup for Alpha/i });
    expect(within(table).getByText('A-rb1')).toBeInTheDocument();
    // rb4 is within 2 of rb2's projection — the close call renders.
    const flags = screen.getByRole('list', { name: /close start-sit calls/i });
    expect(within(flags).getByText(/consider A-rb4 over A-rb2/)).toBeInTheDocument();
  });

  it('prices every close call on the win chance with a signed delta', () => {
    renderPage(league());
    const flags = screen.getByRole('list', { name: /close start-sit calls/i });
    // A-rb4 challenges in two slots; every close call carries a signed
    // win-chance delta line.
    const impacts = within(flags).getAllByText(/Win chance [-+]\d+\.\d pts with this swap/);
    expect(impacts.length).toBeGreaterThan(0);
    for (const impact of impacts) {
      expect(impact).toHaveAttribute(
        'aria-label',
        expect.stringMatching(/win chance [-+]\d+\.\d+ pts/),
      );
    }
  });

  it('shows the all-clear line when no starter has a close call', () => {
    renderPage(league());
    // Switch to the Gamma vs Delta matchup: nobody has a close call there.
    fireEvent.click(screen.getByRole('button', { name: 'Gamma vs Delta' }));
    // The focus team for Gamma (not my matchup) defaults to Gamma.
    expect(screen.getByRole('heading', { name: 'Game plan: Gamma' })).toBeInTheDocument();
    expect(screen.getByText(/No swaps worth a look/)).toBeInTheDocument();
  });

  it('toggles the focus team within a matchup', () => {
    renderPage(league());
    fireEvent.click(screen.getByRole('button', { name: 'Beta', pressed: false }));
    expect(screen.getByRole('heading', { name: 'Game plan: Beta' })).toBeInTheDocument();
  });

  it('shows the empty state when there is no future schedule', () => {
    renderPage(league({ futureSchedule: undefined }));
    expect(screen.getByText(/No matchups to preview this week/)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Week 9:/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the series history line when the teams met before', () => {
    const matchups: WeeklyMatchup[] = [
      { week: 1, team1Id: 'A', team1Points: 120, team2Id: 'B', team2Points: 100 },
      { week: 5, team1Id: 'B', team1Points: 118, team2Id: 'A', team2Points: 110 },
    ];
    renderPage(league({ matchups }));
    expect(screen.getByRole('heading', { name: 'Series history' })).toBeInTheDocument();
    expect(screen.getByText(/Tied 1–1/)).toBeInTheDocument();
    expect(screen.getByText(/Last meeting W5/)).toBeInTheDocument();
  });

  it('hides the series history when the teams have never met', () => {
    renderPage(league({ matchups: [] }));
    expect(screen.queryByRole('heading', { name: 'Series history' })).not.toBeInTheDocument();
  });

  it('shows position battles comparing the two optimal lineups by position', () => {
    renderPage(league());
    expect(screen.getByRole('heading', { name: 'Position battles' })).toBeInTheDocument();
    const table = screen.getByRole('table', {
      name: /Position-group projection comparison, Alpha vs Beta/,
    });
    // Header + QB/RB/WR/TE rows (no K or DST players rostered, so those
    // groups are skipped).
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    const qbRow = within(table).getByRole('rowheader', { name: 'QB' }).closest('tr')!;
    // Both quarterbacks project 20.0 — scored even.
    expect(within(qbRow).getByText('Even')).toBeInTheDocument();
    // The RB battle renders whatever verdict the projections earn — an
    // edge for one side or Even inside the band.
    const rbRow = within(table).getByRole('rowheader', { name: 'RB' }).closest('tr')!;
    const rbCells = within(rbRow).getAllByRole('cell');
    expect(rbCells[rbCells.length - 1].textContent).toMatch(/^(Even|(Alpha|Beta) \+\d)/);
  });

  it('hides the position battles when a matchup cannot be priced', () => {
    renderPage(league({ playerWeeklyPoints: {} }));
    expect(screen.queryByRole('heading', { name: 'Position battles' })).not.toBeInTheDocument();
  });

  // Real NFL teams so the matchup ratings fire from the bundled schedule +
  // allowed averages. Week 8: MIN faces DET (QB rank 1, RB rank 22, WR rank
  // 3, TE rank 1); DET faces MIN (QB 32, RB 32, WR 29, TE 32).
  function attackLeague(): League {
    const mkReal = (id: string, pos: string, nfl: string): Player =>
      ({ id, platformId: id, name: id, position: pos, team: nfl }) as Player;
    const mkRealTeam = (id: string, name: string, isMyTeam: boolean, nfl: string): Team =>
      ({
        id,
        name,
        isMyTeam,
        roster: [
          mkReal(`${id}-qb`, 'QB', nfl),
          mkReal(`${id}-rb`, 'RB', nfl),
          mkReal(`${id}-wr`, 'WR', nfl),
          mkReal(`${id}-te`, 'TE', nfl),
        ],
      }) as Team;
    const pw: Record<string, Record<number, number>> = {};
    for (const id of ['A', 'B']) {
      pw[`${id}-qb`] = weekly([20, 20, 20]);
      pw[`${id}-rb`] = weekly([16, 16, 16]);
      pw[`${id}-wr`] = weekly([12, 12, 12]);
      pw[`${id}-te`] = weekly([8, 8, 8]);
    }
    return league({
      currentWeek: 8,
      teams: [mkRealTeam('A', 'Alpha', true, 'MIN'), mkRealTeam('B', 'Beta', false, 'DET')],
      playerWeeklyPoints: pw,
      futureSchedule: [matchup(8, 'A', 'B')],
    });
  }

  it('shows the attack plan for the focus team, softest group first', () => {
    renderPage(attackLeague());
    expect(screen.getByRole('heading', { name: 'Attack plan' })).toBeInTheDocument();
    // MIN's week-8 draw vs DET: QB and TE face the softest coverage (rank 1).
    expect(screen.getByText(/Best spot: QBs \(avg opp rank 1\.0 — soft\)/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Attack plan: where Alpha's starters/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(5); // header + QB/TE/WR/RB, softest first
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('QB');
    expect(within(rows[4]).getByRole('rowheader')).toHaveTextContent('RB');
    expect(within(rows[4]).getAllByRole('cell')[1]).toHaveTextContent('Avg (22.0)');
  });

  it('re-orients the attack plan on focus-team switch', () => {
    renderPage(attackLeague());
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    // DET faces MIN in week 8: the stingiest draw in the league — WRs are
    // the least-bad spot (rank 29 vs 32 everywhere else).
    const table = screen.getByRole('table', { name: /Attack plan: where Beta's starters/ });
    expect(table).toBeInTheDocument();
    expect(screen.getByText(/Best spot: WRs \(avg opp rank 29\.0 — tough\)/)).toBeInTheDocument();
  });
});
