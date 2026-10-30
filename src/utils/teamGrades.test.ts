import { describe, expect, it } from 'vitest';
import type { DraftPick, League, Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { buildTeamGrades } from './teamGrades';

function poolPlayer(over: Partial<PoolPlayer>): PoolPlayer {
  return {
    id: 'p1',
    name: 'Test Player',
    team: 'KC',
    pos: 'RB',
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: 8,
    baseValue: null,
    ...over,
  };
}

const POOL: DraftPoolFile = {
  season: 2026,
  generatedAt: '2026-10-29',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    poolPlayer({ id: 'qb1', name: 'Elite QB', pos: 'QB', overallRank: 5, projPtsPpr: 340 }),
    poolPlayer({ id: 'qb2', name: 'Scrub QB', pos: 'QB', overallRank: 30, projPtsPpr: 200 }),
    poolPlayer({ id: 'rb1', name: 'Lead Back', pos: 'RB', overallRank: 10, projPtsPpr: 260 }),
    poolPlayer({ id: 'rb2', name: 'Backup Back', pos: 'RB', overallRank: 20, projPtsPpr: 220 }),
    poolPlayer({ id: 'rb3', name: 'Flex Back', pos: 'RB', overallRank: 25, projPtsPpr: 200 }),
    poolPlayer({ id: 'rb4', name: 'Waiver Back', pos: 'RB', overallRank: 60, projPtsPpr: 150 }),
    poolPlayer({ id: 'wr1', name: 'Top Wideout', pos: 'WR', overallRank: 8, projPtsPpr: 270 }),
    poolPlayer({ id: 'wr2', name: 'Second Wideout', pos: 'WR', overallRank: 18, projPtsPpr: 230 }),
    poolPlayer({ id: 'te1', name: 'Top Tight End', pos: 'TE', overallRank: 40, projPtsPpr: 170 }),
    poolPlayer({ id: 'te2', name: 'Scrub Tight End', pos: 'TE', overallRank: 80, projPtsPpr: 100 }),
  ],
};

function player(id: string, pos: string, name: string): Player {
  return { id, platformId: id, name, position: pos, team: 'KC' };
}

function pick(id: string, pos: string, name: string, seasonPoints: number, teamId: string): DraftPick {
  return {
    pickNumber: 1,
    round: 1,
    player: player(id, pos, name),
    teamId,
    teamName: '',
    seasonPoints,
  };
}

const SLOTS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6, IR: 1 };

function league(teams: Array<{ id: string; name: string; roster: Player[]; draftPicks?: DraftPick[] }>): League {
  return {
    id: 'L1',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    status: 'live',
    currentWeek: 9,
    scoringType: 'ppr',
    totalTeams: teams.length,
    rosterSlots: SLOTS,
    teams: teams.map(t => ({
      id: t.id,
      name: t.name,
      roster: t.roster,
      draftPicks: t.draftPicks ?? [],
    })),
  } as unknown as League;
}

describe('buildTeamGrades', () => {
  it('ranks the stronger roster first with a better overall grade', () => {
    const l = league([
      {
        id: 't1',
        name: 'Alpha',
        roster: [
          player('qb1', 'QB', 'Elite QB'),
          player('rb1', 'RB', 'Lead Back'),
          player('rb2', 'RB', 'Backup Back'),
          player('wr1', 'WR', 'Top Wideout'),
          player('wr2', 'WR', 'Second Wideout'),
          player('te1', 'TE', 'Top Tight End'),
        ],
      },
      {
        id: 't2',
        name: 'Beta',
        roster: [
          player('qb2', 'QB', 'Scrub QB'),
          player('rb4', 'RB', 'Waiver Back'),
          player('rb4b', 'RB', 'Other Back'),
          player('wr2', 'WR', 'Second Wideout'),
          player('wr1', 'WR', 'Top Wideout'),
          player('te2', 'TE', 'Scrub Tight End'),
        ],
      },
    ]);
    // rb4b is not in the pool — unresolvable, contributes nothing.
    const grades = buildTeamGrades({ league: l, pool: POOL, slots: SLOTS })!;
    expect(grades).toHaveLength(2);
    expect(grades[0].teamName).toBe('Alpha');
    expect(grades[1].teamName).toBe('Beta');
    expect(grades[0].overallRatio).toBeGreaterThan(grades[1].overallRatio);
    expect(grades[0].groups.RB.rank).toBe(1);
    expect(grades[1].groups.RB.rank).toBe(2);
  });

  it('fills FLEX from the best leftover RB/WR/TE and counts it in the group', () => {
    const l = league([
      {
        id: 't1',
        name: 'Alpha',
        roster: [
          player('qb1', 'QB', 'Elite QB'),
          player('rb1', 'RB', 'Lead Back'),
          player('rb2', 'RB', 'Backup Back'),
          player('rb3', 'RB', 'Flex Back'),
          player('wr1', 'WR', 'Top Wideout'),
          player('wr2', 'WR', 'Second Wideout'),
          player('te1', 'TE', 'Top Tight End'),
        ],
      },
      {
        id: 't2',
        name: 'Beta',
        roster: [
          player('qb2', 'QB', 'Scrub QB'),
          player('rb4', 'RB', 'Waiver Back'),
          player('wr2', 'WR', 'Second Wideout'),
          player('te2', 'TE', 'Scrub Tight End'),
        ],
      },
    ]);
    const grades = buildTeamGrades({ league: l, pool: POOL, slots: SLOTS })!;
    const alpha = grades.find(g => g.teamName === 'Alpha')!;
    // RB slots: rb1 + rb2; FLEX takes rb3 (best remaining) into the RB group.
    expect(alpha.groups.RB.rank).toBe(1);
    expect(alpha.groups.RB.value).toBeGreaterThan(0);
    // Two WRs: both start, wr3 would be bench — Alpha's bench is empty here
    // because all three RBs started.
    expect(alpha.bench.value).toBe(0);
    expect(alpha.weakness).toBeDefined();
    expect(alpha.strength).toBeDefined();
  });

  it('blends draft-pick season points into the ROS grade', () => {
    // Same roster, but Alpha's picks carry real season points (pace blend).
    const base = league([
      {
        id: 't1',
        name: 'Alpha',
        roster: [player('qb1', 'QB', 'Elite QB'), player('rb1', 'RB', 'Lead Back')],
        draftPicks: [
          pick('qb1', 'QB', 'Elite QB', 150, 't1'),
          pick('rb1', 'RB', 'Lead Back', 140, 't1'),
        ],
      },
      {
        id: 't2',
        name: 'Beta',
        roster: [player('qb2', 'QB', 'Scrub QB'), player('rb4', 'RB', 'Waiver Back')],
        draftPicks: [
          pick('qb2', 'QB', 'Scrub QB', 60, 't2'),
          pick('rb4', 'RB', 'Waiver Back', 50, 't2'),
        ],
      },
    ]);
    const grades = buildTeamGrades({ league: base, pool: POOL, slots: SLOTS })!;
    expect(grades[0].teamName).toBe('Alpha');
    expect(grades[0].groups.QB.value).toBeGreaterThan(grades[1].groups.QB.value);
  });

  it('returns undefined without a live league week', () => {
    const l = league([
      { id: 't1', name: 'Alpha', roster: [player('qb1', 'QB', 'Elite QB')] },
    ]) as League;
    expect(buildTeamGrades({ league: { ...l, status: 'final' } as League, pool: POOL })).toBeUndefined();
    expect(
      buildTeamGrades({ league: { ...l, currentWeek: undefined } as League, pool: POOL }),
    ).toBeUndefined();
  });

  it('grades bench as C with no signal when nobody has bench depth', () => {
    const l = league([
      {
        id: 't1',
        name: 'Alpha',
        roster: [player('qb1', 'QB', 'Elite QB'), player('rb1', 'RB', 'Lead Back')],
      },
      {
        id: 't2',
        name: 'Beta',
        roster: [player('qb2', 'QB', 'Scrub QB'), player('rb4', 'RB', 'Waiver Back')],
      },
    ]);
    const grades = buildTeamGrades({ league: l, pool: POOL, slots: SLOTS })!;
    for (const g of grades) {
      expect(g.bench.letter).toBe('C');
      expect(g.bench.ratio).toBe(1);
    }
  });

  it('returns undefined when no team has a roster', () => {
    const l = league([{ id: 't1', name: 'Alpha', roster: [] }]);
    expect(buildTeamGrades({ league: l, pool: POOL })).toBeUndefined();
  });

  it('grades K-only rosters at zero without crashing', () => {
    const l = league([
      { id: 't1', name: 'Alpha', roster: [player('qb1', 'QB', 'Elite QB')] },
      { id: 't2', name: 'Beta', roster: [] },
    ]);
    const grades = buildTeamGrades({ league: l, pool: POOL, slots: SLOTS })!;
    const beta = grades.find(g => g.teamName === 'Beta')!;
    expect(beta.groups.RB.value).toBe(0);
    expect(beta.overall).toBe('F');
  });
});
