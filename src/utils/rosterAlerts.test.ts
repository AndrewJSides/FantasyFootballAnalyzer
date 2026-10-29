import { describe, expect, it } from 'vitest';
import type { League, Player, RosterSlots, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { alertWeeks, teamRosterAlerts } from './rosterAlerts';

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
const QB_FREE = poolPlayer({ id: 'qb-free', name: 'Free QB', pos: 'QB', team: 'MIA', bye: 9, projPtsPpr: 150 });
const QB_FREE_ON_BYE = poolPlayer({ id: 'qb-free-bye', name: 'Free QB On Bye', pos: 'QB', team: 'NYJ', bye: 8, projPtsPpr: 200 });
const RB1 = poolPlayer({ id: 'rb1', name: 'Star RB', pos: 'RB', team: 'DET', bye: 6, projPtsPpr: 300 });
const RB2 = poolPlayer({ id: 'rb2', name: 'RB Two', pos: 'RB', team: 'SF', bye: 9, projPtsPpr: 190 });
const WR1 = poolPlayer({ id: 'wr1', name: 'Star WR', pos: 'WR', team: 'CIN', bye: 10, projPtsPpr: 280 });
const WR2 = poolPlayer({ id: 'wr2', name: 'WR Two', pos: 'WR', team: 'PHI', bye: 11, projPtsPpr: 170 });
const TE1 = poolPlayer({ id: 'te1', name: 'Star TE', pos: 'TE', team: 'KC', bye: 8, projPtsPpr: 160 });
const K1 = poolPlayer({ id: 'k1', name: 'Kicker', pos: 'K', team: 'DAL', bye: 7, projPtsPpr: 120 });
const DST1 = poolPlayer({ id: 'dst1', name: 'Defense', pos: 'DST', team: 'BAL', bye: 8, projPtsPpr: 110 });

const POOL_ALL = [QB1, QB2, QB_FREE, QB_FREE_ON_BYE, RB1, RB2, WR1, WR2, TE1, K1, DST1];

function testPool(): DraftPoolFile {
  return {
    season: 2026, generatedAt: 'test', baseline: { budget: 200, teams: 10, rounds: 20 },
    players: POOL_ALL,
  } as DraftPoolFile;
}

function testLeague(team: Team, currentWeek = 8): League {
  return {
    id: 'l', platform: 'sleeper', name: 'L', season: 2026, draftType: 'snake',
    teams: [team], scoringType: 'ppr', totalTeams: 10, currentWeek,
    isLoaded: true, rosterSlots: SLOTS,
  } as League;
}

function teamOf(roster: Player[]): Team {
  return { id: 't1', name: 'Team One', roster } as Team;
}

describe('alertWeeks', () => {
  it('scans current week through three ahead', () => {
    const league = testLeague(teamOf([]), 8);
    expect(alertWeeks(league)).toEqual([8, 9, 10, 11]);
  });

  it('clips at the regular-season end', () => {
    const league = testLeague(teamOf([]), 17);
    (league as League).playoffStartWeek = 15;
    expect(alertWeeks(league)).toEqual([]);
    const l2 = testLeague(teamOf([]), 13);
    (l2 as League).playoffStartWeek = 15;
    expect(alertWeeks(l2)).toEqual([13, 14]);
  });
});

describe('teamRosterAlerts', () => {
  it('flags a hole when the only QB is on bye', () => {
    const pool = testPool();
    const team = teamOf([QB1, RB1, RB2, WR1, WR2, TE1, K1, DST1].map(leaguePlayer));
    const alerts = teamRosterAlerts(testLeague(team, 8), team, pool);
    const hole = alerts.find(a => a.week === 8 && a.severity === 'hole' && a.slots[0] === 'QB');
    expect(hole).toBeDefined();
    expect(hole!.onBye.map(p => p.id)).toContain('qb1');
    // Fillers are unrostered, not on bye in week 8, by projection: QB2 leads,
    // then Free QB; the higher-projected Free QB On Bye is excluded.
    expect(hole!.fillers.map(p => p.id)).toEqual(['qb2', 'qb-free']);
  });

  it('reports bye-watch with cover when a backup exists', () => {
    const pool = testPool();
    const team = teamOf([QB1, QB2, RB1, RB2, WR1, WR2, TE1, K1, DST1].map(leaguePlayer));
    const alerts = teamRosterAlerts(testLeague(team, 8), team, pool);
    const watch = alerts.find(a => a.week === 8 && a.severity === 'bye-watch' && a.slots[0] === 'QB');
    expect(watch).toBeDefined();
    expect(watch!.onBye.map(p => p.id)).toContain('qb1');
    expect(watch!.cover?.id).toBe('qb2');
  });

  it('reports bye-week holes in later weeks too', () => {
    const pool = testPool();
    const team = teamOf([QB1, QB2, RB1, RB2, WR1, WR2, TE1, K1, DST1].map(leaguePlayer));
    const alerts = teamRosterAlerts(testLeague(team, 8), team, pool);
    // RB2 is the RB-slot-1 starter in the full lineup and is on bye in week 9
    // with no RB cover beyond RB1, who holds RB-slot-0.
    const rbHole = alerts.find(
      a => a.week === 9 && a.severity === 'hole' && a.slots[0] === 'RB',
    );
    expect(rbHole).toBeDefined();
    expect(rbHole!.onBye.map(p => p.id)).toContain('rb2');
    // Week 8's DST1 bye (no backup DST) is a hole; the K1 bye in week 7 is
    // outside the scan window and stays quiet.
    const dstHole = alerts.find(
      a => a.week === 8 && a.severity === 'hole' && a.slots[0] === 'DST',
    );
    expect(dstHole).toBeDefined();
    expect(alerts.some(a => a.week === 7)).toBe(false);
  });

  it('returns nothing for an empty roster', () => {
    const pool = testPool();
    expect(teamRosterAlerts(testLeague(teamOf([])), teamOf([]), pool)).toEqual([]);
  });
});
