// liveMatchup tests: live scoring joins optimal-lineup starters to
// Sleeper's live week stats, pricing played players on actuals and the
// rest on TraderApe projections.

import { describe, it, expect, vi } from 'vitest';
import type { League, Team, WeeklyMatchup } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import type { ScoredPlayer } from '@/utils/rosterScoring';
import type { WeekPprStats } from '@/api/sleeperWeeklyPoints';
import { liveScoreTeam, previewLiveMatchups } from './liveMatchup';

// Synthetic pool with Sleeper ids, mirroring the MatchupPage test trick.
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

import { indexPool } from '@/utils/consensusGrade';

function starter(rid: string, score: number): ScoredPlayer {
  return {
    id: rid,
    name: rid,
    position: rid.replace(/[0-9]+$/, ''),
    score,
    player: {
      id: rid,
      platformId: `sl-${rid}`,
      name: rid,
      position: rid.replace(/[0-9]+$/, ''),
      team: 'FA',
    },
  } as ScoredPlayer;
}

function weekStats(points: Record<string, number>): WeekPprStats {
  return {
    season: 2026,
    week: 8,
    pointsBySleeperId: points,
    playedSleeperIds: new Set(Object.keys(points)),
  };
}

const index = indexPool({ players: h.players, season: 2026 } as never);

describe('liveScoreTeam', () => {
  it('prices played starters on actuals and pending ones on projections', () => {
    const team = liveScoreTeam(
      'a',
      [starter('QB1', 20), starter('RB1', 15), starter('WR1', 12)],
      weekStats({ 'sl-QB1': 24.5, 'sl-RB1': 3.0 }),
      index,
    );
    expect(team.rows[0]).toMatchObject({ actual: 24.5, played: true });
    expect(team.rows[1]).toMatchObject({ actual: 3.0, played: true });
    expect(team.rows[2]).toMatchObject({ actual: null, played: false });
    expect(team.actualSoFar).toBe(27.5);
    expect(team.projectedFinal).toBe(24.5 + 3.0 + 12);
    expect(team.played).toBe(2);
    expect(team.starters).toBe(3);
  });

  it('falls back to the league player id when the pool has no Sleeper id', () => {
    // QB9 is outside the synthetic pool, so the pool join misses and the
    // league's own id space is tried.
    const s = starter('QB9', 18);
    s.player.platformId = 'sl-QB9-direct';
    const team = liveScoreTeam('a', [s], weekStats({ 'sl-QB9-direct': 30 }), index);
    expect(team.rows[0].actual).toBe(30);
    expect(team.rows[0].played).toBe(true);
  });

  it('treats a gp>0 player with no pts_ppr entry as played with no actual', () => {
    const team = liveScoreTeam('a', [starter('QB1', 20)], weekStats({}), index);
    // QB1 is not in playedSleeperIds at all here
    expect(team.rows[0]).toMatchObject({ actual: null, played: false });
  });

  it('counts a played player missing its points line as played with projection', () => {
    const stats: WeekPprStats = {
      season: 2026,
      week: 8,
      pointsBySleeperId: {},
      playedSleeperIds: new Set(['sl-QB1']),
    };
    const team = liveScoreTeam('a', [starter('QB1', 20)], stats, index);
    expect(team.rows[0]).toMatchObject({ actual: null, played: true });
    expect(team.projectedFinal).toBe(20);
  });
});

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
    playerWeeklyPoints: weekly({
      'sl-QB1': [18, 20, 22, 19, 21, 23, 20],
      'sl-RB1': [14, 16, 18, 15, 17, 19, 16],
      'sl-RB2': [13, 15, 17, 14, 16, 18, 15],
      'sl-WR1': [12, 14, 16, 13, 15, 17, 14],
      'sl-WR2': [11, 13, 15, 12, 14, 16, 13],
      'sl-TE1': [6, 8, 10, 7, 9, 11, 8],
      'sl-QB2': [17, 19, 21, 18, 20, 22, 19],
      'sl-RB3': [12, 14, 16, 13, 15, 17, 14],
      'sl-RB4': [10, 12, 14, 11, 13, 15, 12],
      'sl-WR3': [9, 11, 13, 10, 12, 14, 11],
      'sl-WR4': [8, 10, 12, 9, 11, 13, 10],
      'sl-TE2': [5, 7, 9, 6, 8, 10, 7],
    }),
    futureSchedule: [{ week: 8, team1Id: 'a', team2Id: 'b' } as WeeklyMatchup],
  } as League;
}

describe('previewLiveMatchups', () => {
  it('returns one live matchup with the preview pairing and a live win prob', () => {
    const l = league();
    const stats = weekStats({
      'sl-QB1': 30, // Team A's QB went off early
      'sl-RB3': 2, // Team B's RB3 dudded
    });
    const [m] = previewLiveMatchups(l, stats);
    expect(m.teamAId).toBe('a');
    expect(m.teamBId).toBe('b');
    expect(m.a.played).toBe(1);
    expect(m.a.actualSoFar).toBe(30);
    expect(m.b.played).toBe(1);
    expect(m.b.actualSoFar).toBe(2);
    // Team A is live-favored: 30 actual banked vs B's 2
    expect(m.winProbA).toBeGreaterThan(50);
    expect(m.winProbA).toBeLessThanOrEqual(100);
    // Projected finals include the banked actuals
    expect(m.a.projectedFinal).toBeGreaterThan(m.a.actualSoFar);
  });

  it('refuses a stats payload from a different week than the current week', () => {
    const l = league();
    const stats = weekStats({ 'sl-QB1': 30 });
    stats.week = 7;
    expect(previewLiveMatchups(l, stats)).toEqual([]);
  });

  it('hides when the schedule is absent', () => {
    const l = { ...league(), futureSchedule: [] };
    expect(previewLiveMatchups(l, weekStats({}))).toEqual([]);
  });
});
