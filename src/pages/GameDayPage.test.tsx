// Game Day Live Leaderboard (backlog item 171): league-wide live
// ranking + top live scorers; guest mode gets the scorers board.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { League, Team, WeeklyMatchup } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import type { WeekPprStats } from '@/api/sleeperWeeklyPoints';
import { currentWeekEstimate } from '@/utils/matchupRating';

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

vi.mock('@/api/sleeperWeeklyPoints', () => ({
  fetchWeekPprStats: vi.fn(),
}));

import { fetchWeekPprStats } from '@/api/sleeperWeeklyPoints';
import { GameDayPage } from './GameDayPage';

const mockFetch = vi.mocked(fetchWeekPprStats);

function team(
  id: string,
  name: string,
  rosterIds: string[],
  isMyTeam: boolean,
): Team {
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

function weekly(
  entries: Record<string, number[]>,
): Record<string, Record<number, number>> {
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

function weekStats(points: Record<string, number>, week = 8): WeekPprStats {
  return {
    season: 2026,
    week,
    pointsBySleeperId: points,
    playedSleeperIds: new Set(Object.keys(points)),
    tdPtsBySleeperId: {},
    usageBySleeperId: {},
  };
}

function renderPage(l?: League) {
  return render(
    <MemoryRouter>
      <GameDayPage league={l} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

describe('GameDayPage', () => {
  it('ranks league teams by banked live points with a top-scorers table', async () => {
    mockFetch.mockResolvedValue(weekStats({ 'sl-QB1': 30, 'sl-RB3': 2 }));
    renderPage(league());
    const board = await screen.findByRole('table', {
      name: /Game Day leaderboard, week 8/,
    });
    const rows = board.querySelectorAll('tbody tr');
    expect(rows[0]).toHaveTextContent('Team A');
    expect(rows[0]).toHaveTextContent('30.0');
    expect(rows[1]).toHaveTextContent('Team B');
    expect(rows[1]).toHaveTextContent('2.0');
    const scorers = screen.getByRole('table', {
      name: /Top live scorers, week 8/,
    });
    expect(scorers).toHaveTextContent('QB1');
    expect(scorers).toHaveTextContent('30.0');
    expect(scorers).toHaveTextContent('Team A');
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
    const announcement = document.querySelector('[aria-live="polite"]');
    expect(announcement?.textContent).toMatch(/Game Day updated/);
  });

  it('ranks by projected final before kickoff and says so', async () => {
    mockFetch.mockResolvedValue(weekStats({}));
    renderPage(league());
    await screen.findByText(/No games have started yet for week 8/);
    const board = screen.getByRole('table', {
      name: /Game Day leaderboard, week 8/,
    });
    expect(board).toHaveTextContent('Team A');
    expect(
      screen.getByText(/No players have scored yet for week 8/),
    ).toBeInTheDocument();
  });

  it('guest mode shows the top-scorers board with no team leaderboard', async () => {
    const week = currentWeekEstimate();
    mockFetch.mockResolvedValue(
      weekStats({ 'sl-QB1': 28, 'sl-RB1': 19, 'sl-WR1': 11 }, week),
    );
    renderPage();
    const scorers = await screen.findByRole('table', {
      name: new RegExp(`Top live scorers, week ${week}`),
    });
    expect(scorers).toHaveTextContent('QB1');
    expect(scorers).toHaveTextContent('28.0');
    expect(
      screen.queryByRole('table', { name: /Game Day leaderboard/ }),
    ).toBeNull();
    expect(
      screen.getByText(/Connect a league to see the full team leaderboard/),
    ).toBeInTheDocument();
  });

  it('shows an error with a retry button when the feed fails, and retries', async () => {
    mockFetch.mockRejectedValueOnce(new Error('down'));
    renderPage(league());
    const retry = await screen.findByRole('button', { name: 'Retry' });
    mockFetch.mockResolvedValue(weekStats({ 'sl-QB1': 25 }));
    fireEvent.click(retry);
    await screen.findByRole('table', { name: /Game Day leaderboard/ });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('auto-refreshes every minute while starters are pending, and stops when all played', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockFetch.mockResolvedValue(weekStats({ 'sl-QB1': 30 }));
      renderPage(league());
      await screen.findByRole('table', { name: /Game Day leaderboard/ });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
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
