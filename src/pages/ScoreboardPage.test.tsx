// ScoreboardPage (backlog item 84): the /scores page renders this week's NFL
// games with live scores, auto-refreshes while games are live, and marks
// each game with the manager's rostered players in league mode.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ScoreboardGame } from '@/api/espnScoreboard';
import type { League, Player, Team } from '@/types';
import { POOL } from '@/data/draftPool';
import { ScoreboardPage } from './ScoreboardPage';

vi.mock('@/api/espnScoreboard', () => ({ fetchNflScoreboard: vi.fn() }));
vi.mock('@/api/sleeperWeeklyPoints', () => ({ fetchWeekPprStats: vi.fn() }));

import { fetchNflScoreboard } from '@/api/espnScoreboard';
import { fetchWeekPprStats } from '@/api/sleeperWeeklyPoints';

const mockFetch = vi.mocked(fetchNflScoreboard);
const mockStats = vi.mocked(fetchWeekPprStats);

function scoreGame(overrides: Partial<ScoreboardGame> = {}): ScoreboardGame {
  return {
    id: 'g1',
    awayAbbr: 'KC',
    homeAbbr: 'BUF',
    awayName: 'Chiefs',
    homeName: 'Bills',
    awayScore: 21,
    homeScore: 17,
    state: 'in',
    statusLine: '2:40 - 3rd',
    date: '2026-11-01T21:05Z',
    odds: null,
    ...overrides,
  };
}

function renderPage(league?: League) {
  return render(
    <MemoryRouter>
      <ScoreboardPage league={league} />
    </MemoryRouter>,
  );
}

function leagueWithMyTeam(roster: Player[]): League {
  return {
    season: 2026,
    currentWeek: 8,
    teams: [{ id: 't1', name: 'My Team', isMyTeam: true, roster } as Team],
  } as League;
}

function poolRosterPlayer(poolId: string): Player {
  const poolPlayer = POOL.players.find(p => p.id === poolId)!;
  return {
    id: poolPlayer.id,
    platformId: '',
    name: poolPlayer.name,
    position: poolPlayer.pos,
    team: '',
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockStats.mockReset();
  mockStats.mockResolvedValue(undefined);
  document.title = '';
});

describe('ScoreboardPage', () => {
  it('renders live games with scores and a LIVE badge', async () => {
    mockFetch.mockResolvedValue([scoreGame()]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('NFL Scores')).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByText('LIVE')).toBeInTheDocument());
    const game = screen.getByRole('listitem');
    expect(game).toHaveAttribute('aria-label');
    expect(game.getAttribute('aria-label')).toContain('live');
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('2:40 - 3rd')).toBeInTheDocument();
  });

  it('sorts live games first and shows the state counts', async () => {
    mockFetch.mockResolvedValue([
      scoreGame({ id: 'post', state: 'post', statusLine: 'Final', date: '2026-10-30T00:20Z' }),
      scoreGame({ id: 'pre', state: 'pre', awayScore: null, homeScore: null, statusLine: 'Sun 1:05 PM ET', date: '2026-11-01T17:00Z' }),
      scoreGame({ id: 'live', state: 'in' }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('LIVE')).toBeInTheDocument());
    const items = screen.getAllByRole('listitem');
    expect(items[0].getAttribute('aria-label')).toContain('live');
    expect(items[2].getAttribute('aria-label')).toContain('final');
    expect(screen.getByText(/1 live · 1 upcoming · 1 final/)).toBeInTheDocument();
  });

  it('marks the manager\'s rostered players on each game in league mode', async () => {
    const qb = POOL.players.find(p => p.pos === 'QB')!;
    mockFetch.mockResolvedValue([
      scoreGame({ awayAbbr: qb.team, homeAbbr: 'BUF' }),
    ]);
    renderPage(leagueWithMyTeam([poolRosterPlayer(qb.id)]));
    await waitFor(() =>
      expect(screen.getByText(/Your guys:/)).toBeInTheDocument(),
    );
    expect(screen.getByText(new RegExp(qb.name))).toBeInTheDocument();
  });

  it('omits the "your guys" line in guest mode', async () => {
    mockFetch.mockResolvedValue([scoreGame()]);
    renderPage();
    await waitFor(() => expect(screen.getByText('LIVE')).toBeInTheDocument());
    expect(screen.queryByText(/Your guys:/)).not.toBeInTheDocument();
  });

  it('shows live fantasy points for rostered players whose game has started', async () => {
    const qb = POOL.players.find(p => p.pos === 'QB' && p.sleeperId)!;
    const rb = POOL.players.find(
      p => p.pos === 'RB' && p.sleeperId && p.team !== qb.team,
    )!;
    mockFetch.mockResolvedValue([
      scoreGame({ awayAbbr: qb.team, homeAbbr: rb.team }),
    ]);
    mockStats.mockResolvedValue({
      season: 2026,
      week: 8,
      pointsBySleeperId: { [qb.sleeperId!]: 14.2 },
      playedSleeperIds: new Set([qb.sleeperId!]),
    });
    renderPage(leagueWithMyTeam([poolRosterPlayer(qb.id), poolRosterPlayer(rb.id)]));
    await waitFor(() =>
      expect(screen.getByText(/Your guys:/)).toBeInTheDocument(),
    );
    const line = screen.getByText(/Your guys:/).closest('p')!;
    expect(line.textContent).toContain(`${qb.name} (${qb.pos}) 14.2`);
    // rb's game hasn't started: name only, no points.
    expect(line.textContent).toContain(`${rb.name} (${rb.pos})`);
    expect(line.textContent).not.toMatch(new RegExp(`${rb.name} \\(${rb.pos}\\) \\d`));
    // The accessible name carries the points too.
    expect(screen.getByRole('listitem').getAttribute('aria-label')).toContain(
      `${qb.name} (${qb.pos}) 14.2`,
    );
  });

  it('renders names only when the live-stats fetch fails', async () => {
    const qb = POOL.players.find(p => p.pos === 'QB')!;
    mockFetch.mockResolvedValue([
      scoreGame({ awayAbbr: qb.team, homeAbbr: 'BUF' }),
    ]);
    mockStats.mockResolvedValue(undefined);
    renderPage(leagueWithMyTeam([poolRosterPlayer(qb.id)]));
    await waitFor(() =>
      expect(screen.getByText(/Your guys:/)).toBeInTheDocument(),
    );
    const line = screen.getByText(/Your guys:/).closest('p')!;
    expect(line.textContent).toContain(`${qb.name} (${qb.pos})`);
    expect(line.textContent).not.toMatch(new RegExp(`${qb.name} \\(${qb.pos}\\) \\d`));
  });

  it('shows an error state with retry on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('down'));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Couldn't load the scores/)).toBeInTheDocument(),
    );
    mockFetch.mockResolvedValue([scoreGame()]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('LIVE')).toBeInTheDocument());
  });

  it('refreshes on demand and announces the load', async () => {
    mockFetch.mockResolvedValue([scoreGame()]);
    renderPage();
    await waitFor(() => expect(screen.getByText('LIVE')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const live = document.querySelector('[role="status"]');
    expect(live?.textContent).toContain('1 live');
  });

  it('auto-refreshes every minute while a game is live, not after finals', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    try {
      mockFetch.mockResolvedValue([scoreGame({ state: 'in' })]);
      const first = renderPage();
      await waitFor(() => expect(screen.getByText('LIVE')).toBeInTheDocument());
      const liveCall = setIntervalSpy.mock.calls.find(c => c[1] === 60_000);
      expect(liveCall).toBeDefined();
      await act(async () => {
        await (liveCall![0] as () => Promise<void>)();
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      first.unmount();
      setIntervalSpy.mockClear();

      // No live games -> no refresh interval.
      mockFetch.mockResolvedValue([
        scoreGame({ id: 'f', state: 'post', statusLine: 'Final' }),
      ]);
      renderPage();
      await waitFor(() =>
        expect(screen.getByText(/0 live · 0 upcoming · 1 final/)).toBeInTheDocument(),
      );
      expect(
        setIntervalSpy.mock.calls.some(c => c[1] === 60_000),
      ).toBe(false);
    } finally {
      setIntervalSpy.mockRestore();
    }
  });

  it('shows the odds line with flags on an upcoming game', async () => {
    mockFetch.mockResolvedValue([
      scoreGame({
        id: 'odds',
        awayAbbr: 'CHI',
        homeAbbr: 'SEA',
        state: 'pre',
        statusLine: 'Sun 4:25 PM ET',
        odds: { details: 'SEA -3', overUnder: 52, spread: -10 },
      }),
    ]);
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText('SEA -3 · O/U 52 · Shootout · Blowout script'),
      ).toBeInTheDocument(),
    );
    // The accessible version names the implied totals and impact.
    const line = screen.getByText(
      'SEA -3 · O/U 52 · Shootout · Blowout script',
    );
    expect(line.getAttribute('aria-label')).toContain(
      'implied totals: SEA 31, CHI 21',
    );
    // The card's accessible name carries the odds too.
    expect(screen.getByRole('listitem').getAttribute('aria-label')).toContain(
      'Odds: the line is SEA -3',
    );
  });

  it('hides the odds line on final games and when the feed has no odds', async () => {
    mockFetch.mockResolvedValue([
      scoreGame({
        id: 'final',
        state: 'post',
        statusLine: 'Final',
        odds: { details: 'SEA -3', overUnder: 46.5, spread: -3 },
      }),
      scoreGame({ id: 'pre-no-odds', state: 'pre', odds: null }),
    ]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/0 live · 1 upcoming · 1 final/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/O\/U/)).not.toBeInTheDocument();
  });
});
