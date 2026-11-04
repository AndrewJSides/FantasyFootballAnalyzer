// Bye Week Grid engine: starters on bye count per remaining week, bench
// byes never count, weeks clip at the regular-season end, and unresolvable
// rosters (or a finished season) yield null.

import { describe, expect, it } from 'vitest';
import type { League, Player, RosterSlots, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { byeGridWeeks, buildByeGrid } from './byeGrid';

const SLOTS: RosterSlots = {
  QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 5, IR: 0,
};

function poolPlayer(over: Partial<PoolPlayer>): PoolPlayer {
  return {
    id: 'x', name: 'X', team: 'DET', pos: 'RB', posRank: 1, overallRank: 1,
    tier: 1, bye: null, baseValue: 1, projPtsPpr: 100, ...over,
  } as PoolPlayer;
}

function leaguePlayer(pool: PoolPlayer): Player {
  return { id: pool.id, platformId: '', name: pool.name, position: pool.pos, team: pool.team };
}

const QB1 = poolPlayer({ id: 'qb1', name: 'Star QB', pos: 'QB', team: 'KC', bye: 8, projPtsPpr: 320 });
const QB2 = poolPlayer({ id: 'qb2', name: 'Backup QB', pos: 'QB', team: 'BUF', bye: 12, projPtsPpr: 180 });
const RB1 = poolPlayer({ id: 'rb1', name: 'Star RB', pos: 'RB', team: 'DET', bye: 6, projPtsPpr: 300 });
const RB2 = poolPlayer({ id: 'rb2', name: 'RB Two', pos: 'RB', team: 'SF', bye: 9, projPtsPpr: 190 });
const WR1 = poolPlayer({ id: 'wr1', name: 'Star WR', pos: 'WR', team: 'CIN', bye: 10, projPtsPpr: 280 });
const WR2 = poolPlayer({ id: 'wr2', name: 'WR Two', pos: 'WR', team: 'PHI', bye: 11, projPtsPpr: 170 });
const TE1 = poolPlayer({ id: 'te1', name: 'Star TE', pos: 'TE', team: 'KC', bye: 8, projPtsPpr: 160 });
const K1 = poolPlayer({ id: 'k1', name: 'Kicker', pos: 'K', team: 'DAL', bye: 7, projPtsPpr: 120 });
const DST1 = poolPlayer({ id: 'dst1', name: 'Defense', pos: 'DST', team: 'BAL', bye: 8, projPtsPpr: 110 });

const POOL_ALL = [QB1, QB2, RB1, RB2, WR1, WR2, TE1, K1, DST1];

function testPool(): DraftPoolFile {
  return {
    season: 2026, generatedAt: 'test', baseline: { budget: 200, teams: 10, rounds: 20 },
    players: POOL_ALL,
  } as DraftPoolFile;
}

function testLeague(teams: Team[], currentWeek = 8, playoffStartWeek = 15): League {
  return {
    id: 'l', platform: 'sleeper', name: 'L', season: 2026, draftType: 'snake',
    teams, scoringType: 'ppr', totalTeams: 10, currentWeek, playoffStartWeek,
    isLoaded: true, rosterSlots: SLOTS,
  } as League;
}

function teamOf(id: string, name: string, roster: Player[]): Team {
  return { id, name, roster } as Team;
}

const FULL_ROSTER = [QB1, QB2, RB1, RB2, WR1, WR2, TE1, K1, DST1].map(leaguePlayer);

describe('byeGridWeeks', () => {
  it('spans current week through the regular-season end', () => {
    expect(byeGridWeeks(testLeague([], 8, 15))).toEqual([8, 9, 10, 11, 12, 13, 14]);
  });

  it('is empty once the regular season is over', () => {
    expect(byeGridWeeks(testLeague([], 16, 15))).toEqual([]);
  });
});

describe('buildByeGrid', () => {
  it('counts optimal starters on bye per week, with names and worst week', () => {
    const grid = buildByeGrid(testLeague([teamOf('t1', 'Team One', FULL_ROSTER)], 8, 15), testPool());
    expect(grid).not.toBeNull();
    expect(grid!.weeks).toEqual([8, 9, 10, 11, 12, 13, 14]);
    const row = grid!.rows[0];
    const byWeek = new Map(row.cells.map(c => [c.week, c]));
    // Week 8: QB1 + TE1 + DST1 all start and share bye 8.
    expect(byWeek.get(8)!.count).toBe(3);
    expect(byWeek.get(8)!.names).toEqual(expect.arrayContaining(['Star QB', 'Star TE', 'Defense']));
    expect(byWeek.get(9)!.count).toBe(1);
    expect(byWeek.get(9)!.names).toEqual(['RB Two']);
    expect(byWeek.get(10)!.count).toBe(1);
    expect(byWeek.get(11)!.count).toBe(1);
    // Week 12: only the backup QB is on bye — bench byes never count.
    expect(byWeek.get(12)!.count).toBe(0);
    expect(byWeek.get(13)!.count).toBe(0);
    expect(row.total).toBe(6);
    expect(row.worstWeek).toBe(8);
    expect(row.worstCount).toBe(3);
  });

  it('keeps a team with no starter ever on bye, with no worst week', () => {
    const noBye = poolPlayer({ id: 'nb', name: 'No Bye RB', pos: 'RB', team: 'DET', bye: null, projPtsPpr: 300 });
    const pool = testPool();
    (pool.players as PoolPlayer[]).push(noBye);
    const grid = buildByeGrid(
      testLeague([teamOf('t1', 'Solo', [leaguePlayer(noBye)])], 8, 15),
      pool,
    );
    expect(grid!.rows[0].total).toBe(0);
    expect(grid!.rows[0].worstWeek).toBeNull();
  });

  it('returns null when no roster resolves against the pool', () => {
    const ghost = { id: 'ghost', platformId: '', name: 'Ghost', position: 'RB', team: 'DET' } as Player;
    expect(buildByeGrid(testLeague([teamOf('t1', 'Ghosts', [ghost])], 8, 15), testPool())).toBeNull();
  });

  it('returns null once the regular season is over', () => {
    expect(buildByeGrid(testLeague([teamOf('t1', 'Team One', FULL_ROSTER)], 16, 15), testPool())).toBeNull();
  });
});
