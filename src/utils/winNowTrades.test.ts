// winNowTrades: Trade Finder 1-for-1 candidates re-priced on this week's
// Monte Carlo win probability.

import { describe, it, expect, vi } from 'vitest';
import type { League, Team } from '@/types';
import type { PoolPlayer } from '@/types/draft';

// Same synthetic-pool trick as TradeFinderPage.test.tsx: the bundled pool
// is mocked so candidate generation never depends on live player data.
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
      } as PoolPlayer);
    }
  };
  add('QB', 20, 380, 8);
  add('RB', 60, 300, 4);
  add('WR', 60, 280, 4);
  add('TE', 30, 220, 5);
  return { players };
});

vi.mock('@/data/draftPool', () => ({
  POOL: { players: h.players, season: 2026 },
}));

import { priceSwapWinProb, winNowTrades } from './winNowTrades';
import { scoreRosterPlayers } from './rosterScoring';

function team(id: string, name: string, rosterIds: string[]): Team {
  return {
    id,
    name,
    roster: rosterIds.map(rid => ({
      id: rid,
      platformId: rid,
      name: rid,
      position: rid.replace(/[0-9]+$/, ''),
      team: 'FA',
    })),
  } as Team;
}

// Weekly scores per player id, weeks 1-3 of a week-4 league. Team A is
// RB-deep but starts a 6-pt WR; team B is WR-deep with a weak RB1.
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

function league(teams: Team[]): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    season: 2026,
    currentWeek: 4,
    totalTeams: teams.length,
    rosterSlots: {
      QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1,
    },
    scoringType: 'ppr',
    teams,
    playerWeeklyPoints: weekly({
      QB1: [20, 20, 20],
      RB1: [16, 16, 16], RB2: [15, 15, 15], RB3: [14, 14, 14], RB4: [13, 13, 13],
      WR40: [6, 6, 6], TE20: [8, 8, 8],
      QB2: [20, 20, 20], RB40: [8, 8, 8],
      WR1: [14, 14, 14], WR2: [13, 13, 13], WR3: [12, 12, 12], WR4: [11, 11, 11],
      TE25: [8, 8, 8],
    }),
  } as League;
}

function fixture(): League {
  return league([
    team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'RB4', 'WR40', 'TE20']),
    team('b', 'Team B', ['QB2', 'RB40', 'WR1', 'WR2', 'WR3', 'WR4', 'TE25']),
  ]);
}

describe('priceSwapWinProb', () => {
  it('prices the swap with the focus team as team A', () => {
    const l = fixture();
    const focusScored = scoreRosterPlayers({
      roster: l.teams[0].roster,
      weeklyPoints: l.playerWeeklyPoints,
      season: 2026,
      currentWeek: 4,
    });
    const oppScored = scoreRosterPlayers({
      roster: l.teams[1].roster,
      weeklyPoints: l.playerWeeklyPoints,
      season: 2026,
      currentWeek: 4,
    });
    const priced = priceSwapWinProb(focusScored, oppScored, 'a', 'RB4', 'WR4', l, {
      seed: 7,
      simulations: 200,
    });
    expect(priced).not.toBeNull();
    expect(priced!.winProbA).toBeGreaterThanOrEqual(0);
    expect(priced!.winProbA).toBeLessThanOrEqual(100);
    // Team A trades a benched 13-pt RB for an 11-pt WR who starts over its
    // 6-pt WR40 — its projected score must rise.
    expect(priced!.projA).toBeGreaterThan(79);
  });

  it('returns null when a swapped player cannot be matched', () => {
    const l = fixture();
    const focusScored = scoreRosterPlayers({
      roster: l.teams[0].roster,
      weeklyPoints: l.playerWeeklyPoints,
      season: 2026,
      currentWeek: 4,
    });
    const oppScored = scoreRosterPlayers({
      roster: l.teams[1].roster,
      weeklyPoints: l.playerWeeklyPoints,
      season: 2026,
      currentWeek: 4,
    });
    expect(
      priceSwapWinProb(focusScored, oppScored, 'a', 'RB99', 'WR4', l, { seed: 7 }),
    ).toBeNull();
  });
});

describe('winNowTrades', () => {
  it('returns win-now candidates ranked by this-week win-prob gain', () => {
    const result = winNowTrades(fixture(), 'a', 'b', {
      seed: 7,
      simulations: 500,
      minGainPp: 0,
      maxTrades: 5,
    });
    expect(result).not.toBeNull();
    expect(result!.week).toBe(4);
    expect(result!.trades.length).toBeGreaterThan(0);
    for (const t of result!.trades) {
      expect(t.focusGives).toHaveLength(1);
      expect(t.focusGets).toHaveLength(1);
      expect(t.gain).toBeGreaterThanOrEqual(0);
      expect(t.winProbAfter).toBeCloseTo(t.winProbBefore + t.gain, 1);
      expect(t.winProbBefore).toBe(result!.winProbBefore);
    }
    // Ranked best gain first.
    const gains = result!.trades.map(t => t.gain);
    expect([...gains].sort((x, y) => y - x)).toEqual(gains);
  });

  it('is deterministic for a fixed seed', () => {
    const opts = { seed: 11, simulations: 500, minGainPp: 0 } as const;
    const r1 = winNowTrades(fixture(), 'a', 'b', opts);
    const r2 = winNowTrades(fixture(), 'a', 'b', opts);
    expect(r1!.trades.map(t => t.gain)).toEqual(r2!.trades.map(t => t.gain));
  });

  it('honors the gain floor and the max-trades cap', () => {
    const strict = winNowTrades(fixture(), 'a', 'b', { seed: 7, simulations: 500, minGainPp: 100 });
    expect(strict).not.toBeNull();
    expect(strict!.trades).toHaveLength(0);
    const capped = winNowTrades(fixture(), 'a', 'b', { seed: 7, simulations: 500, minGainPp: 0, maxTrades: 1 });
    expect(capped!.trades.length).toBeLessThanOrEqual(1);
  });

  it('returns null when a team has no roster', () => {
    const l = fixture();
    l.teams[1].roster = [];
    expect(winNowTrades(l, 'a', 'b')).toBeNull();
  });

  it('orients the gives/gets on the focus team either way round', () => {
    const fromB = winNowTrades(fixture(), 'b', 'a', { seed: 7, simulations: 500, minGainPp: 0 });
    expect(fromB).not.toBeNull();
    // Focus team B's win-now trades must still be priced from B's view:
    // every trade names what B gives and gets.
    for (const t of fromB!.trades) {
      expect(t.focusGives[0]).toBeDefined();
      expect(t.focusGets[0]).toBeDefined();
    }
  });
});
