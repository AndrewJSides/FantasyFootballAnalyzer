import { describe, expect, it } from 'vitest';
import type { DraftPick, League, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { buildStackReport } from './stackReport';

function poolPlayer(over: Partial<PoolPlayer>): PoolPlayer {
  return {
    id: 'p1',
    name: 'Test Player',
    team: 'KC',
    pos: 'QB',
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: 8,
    baseValue: null,
    ...over,
  } as PoolPlayer;
}

const POOL: DraftPoolFile = {
  season: 2026,
  generatedAt: '2026-11-02',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    poolPlayer({ id: 'qb1', name: 'Alpha QB', pos: 'QB', team: 'KC', overallRank: 5, projPtsPpr: 340 }),
    poolPlayer({ id: 'wr1', name: 'Alpha WR', pos: 'WR', team: 'KC', overallRank: 8, projPtsPpr: 270 }),
    poolPlayer({ id: 'te1', name: 'Alpha TE', pos: 'TE', team: 'KC', overallRank: 40, projPtsPpr: 170 }),
    poolPlayer({ id: 'rb1', name: 'Alpha RB', pos: 'RB', team: 'KC', overallRank: 10, projPtsPpr: 260 }),
    poolPlayer({ id: 'qb2', name: 'Beta QB', pos: 'QB', team: 'BUF', overallRank: 12, projPtsPpr: 300 }),
    poolPlayer({ id: 'wr2', name: 'Beta WR', pos: 'WR', team: 'BUF', overallRank: 18, projPtsPpr: 200 }),
    poolPlayer({ id: 'qb3', name: 'Gamma QB', pos: 'QB', team: 'KC', overallRank: 60, projPtsPpr: 200 }),
    poolPlayer({ id: 'rb2', name: 'Gamma RB', pos: 'RB', team: 'KC', overallRank: 70, projPtsPpr: 180 }),
    poolPlayer({ id: 'wr3', name: 'Waiver WR', pos: 'WR', team: 'KC', overallRank: 90, projPtsPpr: 150 }),
    poolPlayer({ id: 'wr4', name: 'Lone Target', pos: 'WR', team: 'BUF', overallRank: 110, projPtsPpr: 90 }),
    poolPlayer({ id: 'wr5', name: 'No Qb WR', pos: 'WR', team: 'NE', overallRank: 100, projPtsPpr: 180 }),
  ],
};

function player(id: string, pos: string, name: string): Player {
  return { id, platformId: id, name, position: pos, team: 'KC' } as Player;
}

function pick(id: string, pos: string, name: string, teamId: string): DraftPick {
  return {
    pickNumber: 1,
    round: 1,
    player: player(id, pos, name),
    teamId,
    teamName: '',
    seasonPoints: 0,
  };
}

const SLOTS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1 };

function league(
  teams: Array<{ id: string; name: string; roster: Player[] }>,
  status = 'live',
): League {
  return {
    id: 'L1',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    status,
    currentWeek: 9,
    scoringType: 'ppr',
    totalTeams: teams.length,
    rosterSlots: SLOTS,
    teams: teams.map(t => ({
      id: t.id,
      name: t.name,
      roster: t.roster,
      draftPicks: t.roster.map(p => pick(p.id, p.position, p.name, t.id)),
    })),
  } as unknown as League;
}

const stackedLeague = () =>
  league([
    {
      id: 't1',
      name: 'Alpha',
      roster: [
        player('qb1', 'QB', 'Alpha QB'),
        player('wr1', 'WR', 'Alpha WR'),
        player('te1', 'TE', 'Alpha TE'),
        player('rb1', 'RB', 'Alpha RB'),
      ],
    },
    {
      id: 't2',
      name: 'Beta',
      roster: [player('qb2', 'QB', 'Beta QB'), player('wr2', 'WR', 'Beta WR')],
    },
    {
      id: 't3',
      name: 'Gamma',
      roster: [player('qb3', 'QB', 'Gamma QB'), player('rb2', 'RB', 'Gamma RB')],
    },
  ]);

describe('buildStackReport', () => {
  it('forms QB+pass-catcher stacks per NFL team and ranks them by combined ROS', () => {
    const report = buildStackReport({ league: stackedLeague(), pool: POOL });
    expect(report).toBeDefined();
    expect(report!.stacks).toHaveLength(2);
    const [first, second] = report!.stacks;
    // Alpha: 340+270+170 base beats Beta: 300+200 base, same pro-rating.
    expect(first.teamName).toBe('Alpha');
    expect(first.nflTeam).toBe('KC');
    expect(first.qbNames).toEqual(['Alpha QB']);
    expect(first.catcherNames).toEqual(['Alpha WR (WR)', 'Alpha TE (TE)']);
    expect(first.rank).toBe(1);
    expect(first.combinedRos).toBeGreaterThan(second.combinedRos);
    expect(second.teamName).toBe('Beta');
    expect(second.rank).toBe(2);
  });

  it('does not count a QB+RB same-team pair as a stack', () => {
    const report = buildStackReport({ league: stackedLeague(), pool: POOL });
    expect(report!.stacks.every(s => s.teamName !== 'Gamma')).toBe(true);
    // The RB is not a catcher even where a real stack exists.
    const alpha = report!.stacks.find(s => s.teamName === 'Alpha')!;
    expect(alpha.catcherNames.join(' ')).not.toContain('Alpha RB');
  });

  it('names unrostered pass-catchers who would stack with a rostered QB', () => {
    const report = buildStackReport({ league: stackedLeague(), pool: POOL });
    const targets = report!.waiverTargets;
    const wr3 = targets.find(t => t.poolId === 'wr3')!;
    expect(wr3.qbTeamName).toBe('Alpha');
    expect(wr3.qbNames).toEqual(['Alpha QB']);
    expect(wr3.nflTeam).toBe('KC');
    const wr4 = targets.find(t => t.poolId === 'wr4')!;
    expect(wr4.qbTeamName).toBe('Beta');
    // Rostered players are never targets, and a WR on a team with no
    // rostered QB has nobody to stack with.
    expect(targets.some(t => t.poolId === 'wr1')).toBe(false);
    expect(targets.some(t => t.poolId === 'wr5')).toBe(false);
    // Ranked best first.
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i - 1].ros).toBeGreaterThanOrEqual(targets[i].ros);
    }
  });

  it('returns an empty stack list (not undefined) when nobody has a stack', () => {
    const l = league([
      { id: 't1', name: 'Alpha', roster: [player('qb1', 'QB', 'Alpha QB')] },
      { id: 't2', name: 'Beta', roster: [player('wr1', 'WR', 'Alpha WR')] },
    ]);
    const report = buildStackReport({ league: l, pool: POOL });
    expect(report).toBeDefined();
    expect(report!.stacks).toEqual([]);
  });

  it('returns undefined when the league is not live or has no rosters', () => {
    expect(buildStackReport({ league: stackedLeague(), pool: POOL })).toBeDefined();
    expect(
      buildStackReport({ league: league([], 'live'), pool: POOL }),
    ).toBeUndefined();
    const l = stackedLeague();
    expect(
      buildStackReport({ league: { ...l, status: 'offseason' } as League, pool: POOL }),
    ).toBeUndefined();
  });
});
