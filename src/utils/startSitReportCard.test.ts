import { describe, expect, it } from 'vitest';
import type { League, LineupPlayer, RosterSlots, WeeklyLineup } from '@/types';
import {
  buildStartSitReportCard,
  buildTeamExpectationGap,
  expectationVerdict,
  reportCardVerdict,
} from './startSitReportCard';

const SLOTS: RosterSlots = {
  QB: 0,
  RB: 1,
  WR: 0,
  TE: 0,
  FLEX: 0,
  SUPERFLEX: 0,
  K: 0,
  DST: 0,
  BENCH: 5,
  IR: 0,
};

function lp(id: string, name: string, points: number): LineupPlayer {
  return { id, name, pos: 'RB', points };
}

function lineup(
  week: number,
  teamId: string,
  starters: LineupPlayer[],
  bench: LineupPlayer[],
): WeeklyLineup {
  return {
    week,
    teamId,
    slots: ['RB', 'BN', 'BN'],
    starters: [starters[0] ?? null],
    bench,
  };
}

const BIJAN = 'bijan-robinson-rb';
const COOK = 'james-cook-rb';
const BROB = 'brian-robinson-rb';

// Bijan looks like the model's pick on weeks 1-2 form (20+22 vs 5+6);
// in week 3 the manager's gut (Brian Robinson's 25) beats the model.
const weeklyPoints: Record<string, Record<number, number>> = {
  [BIJAN]: { 1: 20, 2: 22, 3: 2, 4: 1 },
  [COOK]: { 1: 18, 2: 19, 3: 3, 4: 30 },
  [BROB]: { 1: 5, 2: 6, 3: 25, 4: 4 },
};

function baseLeague(overrides: Partial<League> = {}): League {
  return {
    id: 'lg',
    name: 'Test League',
    season: 2026,
    status: 'live',
    currentWeek: 4,
    teams: [{ id: 't1', name: 'Alpha' }],
    rosterSlots: SLOTS,
    weeklyLineups: [
      // Week 1: no history — skipped, not graded.
      lineup(1, 't1', [lp(BIJAN, 'Bijan Robinson', 20)], [lp(BROB, 'Brian Robinson Jr.', 5)]),
      // Week 2: model recommends Bijan (20-ish projection vs ~5); manager started him.
      lineup(2, 't1', [lp(BIJAN, 'Bijan Robinson', 22)], [lp(BROB, 'Brian Robinson Jr.', 6)]),
      // Week 3: model recommends Bijan again; manager started Brian Robinson's 25.
      lineup(3, 't1', [lp(BROB, 'Brian Robinson Jr.', 25)], [lp(BIJAN, 'Bijan Robinson', 2)]),
      // Week 4: the live current week — excluded like completedMatchups.
      lineup(4, 't1', [lp(COOK, 'James Cook III', 30)], [lp(BIJAN, 'Bijan Robinson', 1)]),
    ],
    playerWeeklyPoints: weeklyPoints,
    ...overrides,
  } as League;
}

describe('buildStartSitReportCard', () => {
  it('replays completed weeks with no lookahead and grades the model vs the manager', () => {
    const card = buildStartSitReportCard(baseLeague());
    expect(card).not.toBeNull();
    expect(card!.weeksGraded).toBe(2);
    expect(card!.teams).toHaveLength(1);
    const t = card!.teams[0];
    expect(t.teamId).toBe('t1');
    expect(t.teamName).toBe('Alpha');
    expect(t.weeks).toBe(2);
    // Model's recommended lineups scored 22 (wk2) + 2 (wk3); the manager's
    // actual starters scored 22 + 25.
    expect(t.modelPoints).toBe(24);
    expect(t.actualPoints).toBe(47);
    expect(t.delta).toBe(-23);
    expect(t.avgDelta).toBe(-11.5);
    // Week 2 was a tie (22 vs 22) — ties do not count as model wins.
    expect(t.modelWonWeeks).toBe(0);
    expect(card!.netDelta).toBe(-23);
  });

  it('sorts teams by delta, model-beating managers last', () => {
    const league = baseLeague();
    league.teams = [
      { id: 't1', name: 'Alpha' },
      { id: 't2', name: 'Beta' },
    ];
    // Beta follows the model both weeks: starts Bijan in week 2 (22) and
    // week 3 — wait, in week 3 the model recommends Bijan (2). Beta starts
    // Bijan in week 3 too, matching the model exactly: delta 0.
    league.weeklyLineups = [
      ...(league.weeklyLineups ?? []),
      lineup(2, 't2', [lp(BIJAN, 'Bijan Robinson', 22)], [lp(BROB, 'Brian Robinson Jr.', 6)]),
      lineup(3, 't2', [lp(BIJAN, 'Bijan Robinson', 2)], [lp(BROB, 'Brian Robinson Jr.', 25)]),
    ];
    const card = buildStartSitReportCard(league);
    expect(card!.teams.map(t => t.teamId)).toEqual(['t2', 't1']);
    expect(card!.teams[0].delta).toBe(0);
    expect(card!.teams[1].delta).toBe(-23);
  });

  it('hides with no weekly lineups, no weekly points, or best-ball', () => {
    expect(buildStartSitReportCard(baseLeague({ weeklyLineups: [] }))).toBeNull();
    expect(buildStartSitReportCard(baseLeague({ weeklyLineups: undefined }))).toBeNull();
    expect(buildStartSitReportCard(baseLeague({ playerWeeklyPoints: undefined }))).toBeNull();
    expect(buildStartSitReportCard(baseLeague({ isBestBall: true }))).toBeNull();
  });

  it('grades every week when the season is final (no live current week)', () => {
    const card = buildStartSitReportCard(
      baseLeague({ status: 'final', currentWeek: undefined }),
    );
    // Week 4 now counts: on weeks 1-3 form the model recommends Bijan
    // (13.5 vs Cook's 12.3) for 1 actual point; the manager started Cook's 30.
    expect(card!.weeksGraded).toBe(3);
    const t = card!.teams[0];
    expect(t.weeks).toBe(3);
    expect(t.modelPoints).toBe(25);
    expect(t.actualPoints).toBe(77);
    expect(t.delta).toBe(-52);
    expect(t.avgDelta).toBe(-17.3);
  });
});

describe('reportCardVerdict', () => {
  it('names the winner with a dead-band around even', () => {
    expect(reportCardVerdict(5)).toBe('Model beats you');
    expect(reportCardVerdict(3)).toBe('Model beats you');
    expect(reportCardVerdict(-5)).toBe('You beat the model');
    expect(reportCardVerdict(-3)).toBe('You beat the model');
    expect(reportCardVerdict(2.9)).toBe('About even');
    expect(reportCardVerdict(-2.9)).toBe('About even');
    expect(reportCardVerdict(0)).toBe('About even');
  });
});

describe('buildTeamExpectationGap', () => {
  it('prices expected vs actual on the model lineup with no lookahead', () => {
    const gap = buildTeamExpectationGap(baseLeague());
    expect(gap).not.toBeNull();
    expect(gap!.weeksGraded).toBe(2);
    expect(gap!.teams).toHaveLength(1);
    const t = gap!.teams[0];
    expect(t.teamId).toBe('t1');
    expect(t.teamName).toBe('Alpha');
    expect(t.weeks).toBe(2);
    // The model lineup (Bijan both graded weeks) actually scored 22 + 2;
    // the no-lookahead projections expected 20 + 21.
    expect(t.actualPoints).toBe(24);
    expect(t.expectedPoints).toBe(41);
    expect(t.gap).toBe(-17);
    expect(t.avgGap).toBe(-8.5);
  });

  it('ranks hottest first and isolates expectation from manager picks', () => {
    const league = baseLeague();
    league.teams = [
      { id: 't1', name: 'Alpha' },
      { id: 't2', name: 'Beta' },
    ];
    // Beta's guy is projected ~2.5 on weeks 1-2 form and scores 30 in week 3.
    // The manager's own start/sit skill is irrelevant here — the gap prices
    // the model lineup's actuals vs its projection.
    const HOT = 'hot-rb';
    league.playerWeeklyPoints = {
      ...weeklyPoints,
      [HOT]: { 1: 2, 2: 3, 3: 30 },
    };
    league.weeklyLineups = [
      ...(league.weeklyLineups ?? []),
      lineup(2, 't2', [lp(HOT, 'Hot Hand', 3)], [lp(BROB, 'Brian Robinson Jr.', 6)]),
      lineup(3, 't2', [lp(HOT, 'Hot Hand', 30)], [lp(BROB, 'Brian Robinson Jr.', 25)]),
    ];
    const gap = buildTeamExpectationGap(league);
    expect(gap!.teams.map(t => t.teamId)).toEqual(['t2', 't1']);
    const hot = gap!.teams[0];
    expect(hot.gap).toBeGreaterThan(0);
    expect(expectationVerdict(hot.avgGap)).toBe('Running hot');
    const cold = gap!.teams[1];
    expect(expectationVerdict(cold.avgGap)).toBe('Running cold');
  });

  it('hides with no weekly lineups, no weekly points, or best-ball', () => {
    expect(buildTeamExpectationGap(baseLeague({ weeklyLineups: [] }))).toBeNull();
    expect(buildTeamExpectationGap(baseLeague({ weeklyLineups: undefined }))).toBeNull();
    expect(buildTeamExpectationGap(baseLeague({ playerWeeklyPoints: undefined }))).toBeNull();
    expect(buildTeamExpectationGap(baseLeague({ isBestBall: true }))).toBeNull();
  });
});

describe('expectationVerdict', () => {
  it('names the read with a dead-band around even', () => {
    expect(expectationVerdict(5)).toBe('Running hot');
    expect(expectationVerdict(3)).toBe('Running hot');
    expect(expectationVerdict(-5)).toBe('Running cold');
    expect(expectationVerdict(-3)).toBe('Running cold');
    expect(expectationVerdict(2.9)).toBe('About right');
    expect(expectationVerdict(-2.9)).toBe('About right');
    expect(expectationVerdict(0)).toBe('About right');
  });
});
