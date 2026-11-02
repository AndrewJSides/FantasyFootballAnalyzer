// espnScoreboard (backlog item 84): ESPN's free scoreboard API -> parsed
// ScoreboardGame rows.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  canonTeamAbbr,
  fetchNflScoreboard,
  type ScoreboardGame,
} from './espnScoreboard';

function competitor(homeAway: string, abbr: string, score?: string) {
  return {
    homeAway,
    team: { abbreviation: abbr, shortDisplayName: abbr === 'PHI' ? 'Eagles' : 'Commanders' },
    score,
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: '401772510',
    date: '2026-11-02T01:20Z',
    name: 'Philadelphia Eagles at Washington Commanders',
    shortName: 'PHI @ WSH',
    status: {
      type: {
        state: 'in',
        shortDetail: '2:40 - 2nd',
        completed: false,
      },
    },
    competitions: [
      {
        competitors: [
          competitor('away', 'PHI', '10'),
          competitor('home', 'WSH', '10'),
        ],
      },
    ],
    ...overrides,
  };
}

function mockFetch(json: unknown, ok = true, status = 200) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => json,
  } as Response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canonTeamAbbr', () => {
  it('normalizes ESPN spellings to the app canonical form', () => {
    expect(canonTeamAbbr('WSH')).toBe('WAS');
    expect(canonTeamAbbr('JAX')).toBe('JAC');
    expect(canonTeamAbbr('PHI')).toBe('PHI');
    expect(canonTeamAbbr(null)).toBe('');
  });
});

describe('fetchNflScoreboard', () => {
  it('parses a live game, normalizing WSH to WAS', async () => {
    mockFetch({ events: [event()] });
    const games = await fetchNflScoreboard(2026, 8);
    expect(games).toHaveLength(1);
    const g: ScoreboardGame = games[0];
    expect(g.id).toBe('401772510');
    expect(g.awayAbbr).toBe('PHI');
    expect(g.homeAbbr).toBe('WAS');
    expect(g.awayScore).toBe(10);
    expect(g.homeScore).toBe(10);
    expect(g.state).toBe('in');
    expect(g.statusLine).toBe('2:40 - 2nd');
    expect(g.date).toBe('2026-11-02T01:20Z');
  });

  it('parses pre-game (no scores yet) and final games', async () => {
    mockFetch({
      events: [
        event({
          id: 'pre',
          status: { type: { state: 'pre', shortDetail: 'Sun 1:05 PM ET' } },
          competitions: [
            {
              competitors: [
                competitor('away', 'KC', ''),
                competitor('home', 'BUF', ''),
              ],
            },
          ],
        }),
        event({
          id: 'post',
          status: { type: { state: 'post', shortDetail: 'Final' } },
          competitions: [
            {
              competitors: [
                competitor('away', 'DAL', '24'),
                competitor('home', 'NYG', '17'),
              ],
            },
          ],
        }),
      ],
    });
    const games = await fetchNflScoreboard(2026, 8);
    expect(games).toHaveLength(2);
    expect(games[0].state).toBe('pre');
    expect(games[0].awayScore).toBeNull();
    expect(games[0].homeScore).toBeNull();
    expect(games[0].statusLine).toBe('Sun 1:05 PM ET');
    expect(games[1].state).toBe('post');
    expect(games[1].awayScore).toBe(24);
    expect(games[1].statusLine).toBe('Final');
  });

  it('drops malformed events instead of failing the whole board', async () => {
    mockFetch({
      events: [event(), { id: 'bad', competitions: [] }, null, event({ id: 'ok2' })],
    });
    const games = await fetchNflScoreboard(2026, 8);
    expect(games.map(g => g.id)).toEqual(['401772510', 'ok2']);
  });

  it('throws on HTTP failure', async () => {
    mockFetch({}, false, 500);
    await expect(fetchNflScoreboard(2026, 8)).rejects.toThrow('HTTP 500');
  });

  it('throws on an unexpected response shape', async () => {
    mockFetch({ events: 'nope' });
    await expect(fetchNflScoreboard(2026, 8)).rejects.toThrow(
      'unexpected response shape',
    );
  });

  it('hits the scoreboard endpoint with season + week', async () => {
    mockFetch({ events: [] });
    await fetchNflScoreboard(2026, 9);
    const url = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(url).toContain('scoreboard');
    expect(url).toContain('dates=2026');
    expect(url).toContain('week=9');
  });
});
