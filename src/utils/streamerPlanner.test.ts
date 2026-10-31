// Streamer planner (backlog item 40): per-week best-available streamers
// are ordered, complete, and honor rostered exclusions. Uses the real
// bundled data (deterministic, committed) rather than fixtures — no network.
import { describe, it, expect } from 'vitest';
import type { League, Team, Player } from '@/types';
import {
  buildStreamerPlan,
  planEndWeek,
  rosteredDefenseTeams,
  rosteredKickerTeams,
  rosteredSkillPlayerIds,
} from './streamerPlanner';

const EMPTY = {
  rosteredDefenses: new Set<string>(),
  rosteredKickerTeams: new Set<string>(),
  rosteredSkillIds: new Set<string>(),
};

describe('buildStreamerPlan', () => {
  it('returns one row per week, ascending, over the requested range', () => {
    const plan = buildStreamerPlan({ ...EMPTY, fromWeek: 8, toWeek: 14 });
    expect(plan.map(r => r.week)).toEqual([8, 9, 10, 11, 12, 13, 14]);
  });

  it('each row names a best pick per position with a real opponent and rank', () => {
    const plan = buildStreamerPlan({ ...EMPTY, fromWeek: 8, toWeek: 18 });
    for (const row of plan) {
      if (row.dst) {
        expect(row.dst.rank).toBeGreaterThanOrEqual(1);
        expect(row.dst.rank).toBeLessThanOrEqual(32);
        expect(row.dst.opponent).toMatch(/^[A-Z]{2,3}$/);
      }
      if (row.qb) {
        expect(row.qb.rank).toBeGreaterThanOrEqual(1);
        expect(row.qb.opponent).toMatch(/^[A-Z]{2,3}$/);
        expect(row.qb.playerId.length).toBeGreaterThan(0);
      }
    }
    // At least the early weeks name picks at every position.
    const week8 = plan[0];
    expect(week8.dst).not.toBeNull();
    expect(week8.kicker).not.toBeNull();
    expect(week8.qb).not.toBeNull();
    expect(week8.te).not.toBeNull();
  });

  it('excluding the top QB pick surfaces a different streamer', () => {
    const base = buildStreamerPlan({ ...EMPTY, fromWeek: 8, toWeek: 8 });
    const topQb = base[0].qb;
    expect(topQb).not.toBeNull();
    const rostered = new Set<string>([topQb!.playerId]);
    const again = buildStreamerPlan({ ...EMPTY, rosteredSkillIds: rostered, fromWeek: 8, toWeek: 8 });
    expect(again[0].qb).not.toBeNull();
    expect(again[0].qb!.playerId).not.toBe(topQb!.playerId);
  });

  it('excluding the top defense surfaces a different streamer', () => {
    const base = buildStreamerPlan({ ...EMPTY, fromWeek: 8, toWeek: 8 });
    const topDst = base[0].dst;
    expect(topDst).not.toBeNull();
    const rostered = new Set<string>([topDst!.team]);
    const again = buildStreamerPlan({ ...EMPTY, rosteredDefenses: rostered, fromWeek: 8, toWeek: 8 });
    expect(again[0].dst).not.toBeNull();
    expect(again[0].dst!.team).not.toBe(topDst!.team);
  });

  it('an empty range yields no rows', () => {
    expect(buildStreamerPlan({ ...EMPTY, fromWeek: 15, toWeek: 14 })).toEqual([]);
  });
});

describe('planEndWeek', () => {
  it('ends the week before the fantasy playoffs, defaulting to 14', () => {
    expect(planEndWeek({ teams: [], playoffStartWeek: 15 } as League, 8)).toBe(14);
    expect(planEndWeek({ teams: [] } as League, 8)).toBe(14);
  });

  it('clamps to week 18 and never below the current week', () => {
    expect(planEndWeek({ teams: [], playoffStartWeek: 20 } as League, 8)).toBe(18);
    expect(planEndWeek({ teams: [], playoffStartWeek: 15 } as League, 16)).toBe(16);
  });
});

function rosterPlayer(overrides: Partial<Player>): Player {
  return { id: 'x', platformId: '', name: 'Test Player', position: '', team: '' , ...overrides} as Player;
}

function leagueWithRoster(roster: Player[]): League {
  const team: Team = { id: 't1', name: 'Team 1', roster } as Team;
  return { teams: [team], currentWeek: 8 } as League;
}

describe('rostered helpers', () => {
  it('collects rostered defenses, kicker teams, and QB/TE pool ids', () => {
    // The top QB pick's pool id stands in for a rostered quarterback.
    const topQb = buildStreamerPlan({ ...EMPTY, fromWeek: 8, toWeek: 8 })[0].qb!;
    const league = leagueWithRoster([
      rosterPlayer({ position: 'D/ST', team: 'CIN', name: 'Bengals D/ST' }),
      rosterPlayer({ position: 'K', team: 'KC', name: 'KC Kicker' }),
      rosterPlayer({ position: 'QB', id: topQb.playerId, name: topQb.name, team: topQb.team }),
    ]);
    expect(rosteredDefenseTeams(league)).toEqual(new Set(['CIN']));
    expect(rosteredKickerTeams(league)).toEqual(new Set(['KC']));
    expect(rosteredSkillPlayerIds(league)).toEqual(new Set([topQb.playerId]));
  });

  it('a rostered top pick never appears in that week of the plan', () => {
    const week8 = buildStreamerPlan({ ...EMPTY, fromWeek: 8, toWeek: 8 })[0];
    const league = leagueWithRoster([
      rosterPlayer({ position: 'D/ST', team: week8.dst!.team, name: `${week8.dst!.team} D/ST` }),
      rosterPlayer({ position: 'QB', id: week8.qb!.playerId, name: week8.qb!.name, team: week8.qb!.team }),
    ]);
    const plan = buildStreamerPlan({
      fromWeek: 8,
      toWeek: 8,
      rosteredDefenses: rosteredDefenseTeams(league),
      rosteredKickerTeams: rosteredKickerTeams(league),
      rosteredSkillIds: rosteredSkillPlayerIds(league),
    });
    expect(plan[0].dst?.team).not.toBe(week8.dst!.team);
    expect(plan[0].qb?.playerId).not.toBe(week8.qb!.playerId);
  });
});
