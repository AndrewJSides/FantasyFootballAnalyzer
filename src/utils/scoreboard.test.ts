// scoreboard utils (backlog item 84): sort order, state counts, and the
// "your guys" roster join.

import { describe, expect, it } from 'vitest';
import type { ScoreboardGame } from '@/api/espnScoreboard';
import { POOL } from '@/data/draftPool';
import {
  gameMyPlayersLine,
  scoreboardCounts,
  sortScoreboardGames,
  teamMyPlayers,
} from './scoreboard';

function game(overrides: Partial<ScoreboardGame> = {}): ScoreboardGame {
  return {
    id: 'g',
    awayAbbr: 'KC',
    homeAbbr: 'BUF',
    awayName: 'Chiefs',
    homeName: 'Bills',
    awayScore: null,
    homeScore: null,
    state: 'pre',
    statusLine: '',
    date: '2026-11-01T17:00Z',
    ...overrides,
  };
}

describe('sortScoreboardGames', () => {
  it('orders live first, then upcoming by kickoff, then finals', () => {
    const final = game({ id: 'final', state: 'post', date: '2026-10-30T00:20Z' });
    const upcomingLate = game({ id: 'late', date: '2026-11-02T01:20Z' });
    const live = game({ id: 'live', state: 'in', date: '2026-11-01T21:05Z' });
    const upcomingEarly = game({ id: 'early', date: '2026-11-01T17:00Z' });
    const sorted = sortScoreboardGames([final, upcomingLate, live, upcomingEarly]);
    expect(sorted.map(g => g.id)).toEqual(['live', 'early', 'late', 'final']);
  });

  it('does not mutate the input', () => {
    const games = [game({ id: 'a' }), game({ id: 'b', state: 'in' })];
    sortScoreboardGames(games);
    expect(games[0].id).toBe('a');
  });
});

describe('scoreboardCounts', () => {
  it('counts live / upcoming / final games', () => {
    const games = [
      game({ state: 'in' }),
      game({ state: 'pre' }),
      game({ state: 'pre' }),
      game({ state: 'post' }),
    ];
    expect(scoreboardCounts(games)).toEqual({ live: 1, upcoming: 2, final: 1 });
  });

  it('returns zeros for an empty board', () => {
    expect(scoreboardCounts([])).toEqual({ live: 0, upcoming: 0, final: 0 });
  });
});

describe('teamMyPlayers + gameMyPlayersLine', () => {
  it('joins rostered pool ids to their NFL teams', () => {
    // Two real pool players on different teams.
    const a = POOL.players.find(p => p.pos === 'QB')!;
    const b = POOL.players.find(p => p.pos === 'RB' && p.team !== a.team)!;
    const byTeam = teamMyPlayers(new Set([a.id, b.id]), POOL);
    expect(byTeam.get(a.team)?.map(p => p.name)).toContain(a.name);
    expect(byTeam.get(b.team)?.map(p => p.name)).toContain(b.name);
  });

  it('returns an empty map with no my-team roster', () => {
    expect(teamMyPlayers(new Set(), POOL).size).toBe(0);
  });

  it('names the manager players in a game, away team first', () => {
    const a = POOL.players.find(p => p.pos === 'QB')!;
    const b = POOL.players.find(p => p.pos === 'RB' && p.team !== a.team)!;
    const byTeam = teamMyPlayers(new Set([a.id, b.id]), POOL);
    const line = gameMyPlayersLine(
      game({ awayAbbr: a.team, homeAbbr: b.team }),
      byTeam,
    );
    expect(line).toContain(`${a.name} (${a.pos})`);
    expect(line).toContain(`${b.name} (${b.pos})`);
    expect(line.indexOf(a.name)).toBeLessThan(line.indexOf(b.name));
  });

  it('returns an empty string when none of his players are in the game', () => {
    expect(gameMyPlayersLine(game(), new Map())).toBe('');
  });
});
