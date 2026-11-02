// MatchupPage "Live score" section: shows live actuals once games start,
// hides pre-kickoff, retries on feed failure, and auto-refreshes while
// players are pending.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Team, WeeklyMatchup } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import type { WeekPprStats } from '@/api/sleeperWeeklyPoints';

const h = vi.hoisted(() => {
  const players: PoolPlayer[] = [];
  const add = (pos: string, count: number, base: number, step: number) => {
    for (let i = 0; i < count; i++) {
      const pts = base - i * step;
      players.push({
        id: `${pos}${i + 1}`,
        name: `${pos}${i + 1}`,
        team: 'FA',
        pos,
        posRank: i + 1,
        overallRank: players.length + 1,
        tier: 1,
        bye: null,
        baseValue: null,
        projPts: pts,
        projPtsPpr: pts,
        projPtsStd: pts,
        sleeperId: `sl-${pos}${i + 1}`,
      } as PoolPlayer);
    }
  };
  add('QB', 4, 380, 8);
  add('RB', 8, 300, 4);
  add('WR', 8, 280, 4);
  add('TE', 4, 220, 5);
  return { players };
});

vi.mock('@/data/draftPool', () => ({
  POOL: { players: h.players, season: 2026 },
}));

vi.mock('@/api/sleeperWeeklyPoints', () => ({ fetchWeekPprStats: vi.fn() }));

import { fetchWeekPprStats } from '@/api/sleeperWeeklyPoints';
import MatchupPage from './MatchupPage';

const mockFetch = vi.mocked(fetchWeekPprStats);

function team(id: string, name: string, rosterIds: string[], isMyTeam: boolean): Team {
  return {
    id,
    name,
    isMyTeam,
    roster: rosterIds.map(rid => ({
      id: rid,
      platformId: `sl-${rid}`,
      name: rid,
      position: rid.replace(/[0-9]+$/, ''),
      team: 'FA',
    })),
  } as Team;
}

function weekly(entries: Record<string, number[]>): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = {};
  for (const [id, scores] of Object.entries(entries)) {
    out[id] = {};
    scores.forEach((s, i) => {
      out[id][i + 1] = s;
    });
  }
  return out;
}

function league(): League {
  const teams = [
    team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'WR1', 'WR2', 'TE1'], true),
    team('b', 'Team B', ['QB2', 'RB3', 'RB4', 'WR3', 'WR4', 'TE2'], false),
  ];
  const scores: Record<string, number[]> = {};
  for (const t of teams) {
    for (const p of t.roster!) {
      scores[p.platformId] = [14, 16, 18, 15, 17, 19, 16];
    }
  }
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    season: 2026,
    currentWeek: 8,
    totalTeams: teams.length,
    rosterSlots: {
      QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 0, DST: 0, BENCH: 6, IR: 1,
    },
    scoringType: 'ppr',
    teams,
    playerWeeklyPoints: weekly(scores),
    futureSchedule: [{ week: 8, team1Id: 'a', team2Id: 'b' } as WeeklyMatchup],
  } as League;
}

function weekStats(points: Record<string, number>): WeekPprStats {
  return {
    season: 2026,
    week: 8,
    pointsBySleeperId: points,
    playedSleeperIds: new Set(Object.keys(points)),
  };
}

function renderPage(l: League) {
  return render(
    <MemoryRouter>
      <MatchupPage league={l} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

describe('MatchupPage live scores', () => {
  it('shows live actuals and a live win probability once games start', async () => {
    mockFetch.mockResolvedValue(weekStats({ 'sl-QB1': 30, 'sl-RB3': 2 }));
    renderPage(league());
    const heading = await screen.findByRole('heading', { name: /Live score/ });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toContain('LIVE');
    // Banked actuals appear in the score line and starter rows.
    expect(screen.getByText(/Team A 30\.0/)).toBeInTheDocument();
    expect(screen.getByText(/proj\. final/)).toBeInTheDocument();
    // Pending starters still count at projection; played ones show actuals.
    const teamATable = screen.getByRole('table', { name: /Live scoring, Team A/ });
    expect(teamATable).toHaveTextContent('30.0');
    expect(teamATable).toHaveTextContent('Pending');
    const announcement = document.querySelector('[aria-live="polite"]');
    expect(announcement?.textContent).toMatch(/Live scores updated/);
  });

  it('hides the section entirely before any game starts', async () => {
    mockFetch.mockResolvedValue(weekStats({}));
    renderPage(league());
    // Wait for the pre-game preview to settle, then assert no live section.
    await screen.findByText(/Projected score: Team A/);
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });
    expect(screen.queryByRole('heading', { name: /Live score/ })).toBeNull();
  });

  it('shows an error with a retry button when the feed fails, and retries', async () => {
    mockFetch.mockRejectedValueOnce(new Error('down'));
    renderPage(league());
    const retry = await screen.findByRole('button', { name: 'Try again' });
    mockFetch.mockResolvedValue(weekStats({ 'sl-QB1': 25 }));
    fireEvent.click(retry);
    await screen.findByRole('heading', { name: /Live score/ });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('auto-refreshes every minute while players are pending, and stops when all played', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockFetch.mockResolvedValue(weekStats({ 'sl-QB1': 30 }));
      renderPage(league());
      await screen.findByRole('heading', { name: /Live score/ });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // All starters played: the refresh loop stops.
      mockFetch.mockResolvedValue(
        weekStats({
          'sl-QB1': 30, 'sl-RB1': 12, 'sl-RB2': 11, 'sl-WR1': 14,
          'sl-WR2': 9, 'sl-TE1': 7,
          'sl-QB2': 20, 'sl-RB3': 10, 'sl-RB4': 8, 'sl-WR3': 12,
          'sl-WR4': 6, 'sl-TE2': 5,
        }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(mockFetch).toHaveBeenCalledTimes(3);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
