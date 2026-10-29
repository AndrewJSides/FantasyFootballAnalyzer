import { weeklyRecap } from './weeklyRecap';
import type { DraftPick, League } from '@/types';

function leagueOf(opts: {
  matchups: Array<{ week: number; t1: string; t2: string; p1: number; p2: number }>;
  playerWeeklyPoints?: Record<string, Record<number, number>>;
  players?: Array<{ id: string; name: string; position: string }>;
  draftPicks?: DraftPick[];
  wins?: Record<string, { w: number; l: number; pts: number }>;
}): League {
  const teams = [
    { id: 't1', name: 'Alpha' },
    { id: 't2', name: 'Beta' },
  ].map(({ id, name }) => ({
    id,
    name,
    platform: 'sleeper' as const,
    roster: (opts.players ?? []).map(p => ({
      id: p.id,
      platformId: p.id,
      name: p.name,
      position: p.position,
      team: 'NFL',
    })),
    draftPicks: (opts.draftPicks ?? []).filter(p => p.teamId === id),
    wins: opts.wins?.[id]?.w ?? 0,
    losses: opts.wins?.[id]?.l ?? 0,
    ties: 0,
    pointsFor: opts.wins?.[id]?.pts ?? 0,
  }));
  // completedMatchups drops week >= currentWeek on a live league, so push
  // currentWeek past the last week in the fixture data.
  const maxWeek = opts.matchups.reduce((m, x) => Math.max(m, x.week), 0);
  return {
    id: 'l1',
    platform: 'sleeper',
    name: 'Test League',
    season: 2026,
    draftType: 'snake',
    teams,
    matchups: opts.matchups.map(m => ({
      week: m.week,
      team1Id: m.t1,
      team2Id: m.t2,
      team1Points: m.p1,
      team2Points: m.p2,
    })),
    playerWeeklyPoints: opts.playerWeeklyPoints,
    scoringType: 'ppr',
    totalTeams: 2,
    isLoaded: true,
    status: 'live',
    currentWeek: maxWeek + 1,
  };
}

function pick(opts: Partial<DraftPick>): DraftPick {
  return {
    pickNumber: 1,
    round: 1,
    player: { id: 'x', platformId: 'x', name: 'X', position: 'RB', team: 'NFL' },
    teamId: 't1',
    teamName: 'Alpha',
    ...opts,
  };
}

describe('weeklyRecap', () => {
  it('returns null when no matchups completed', () => {
    expect(weeklyRecap(leagueOf({ matchups: [] }))).toBeNull();
  });

  it('defaults to the latest completed week and lists weeks', () => {
    const recap = weeklyRecap(
      leagueOf({
        matchups: [
          { week: 1, t1: 't1', t2: 't2', p1: 100, p2: 90 },
          { week: 2, t1: 't1', t2: 't2', p1: 110, p2: 80 },
        ],
      }),
    );
    expect(recap).not.toBeNull();
    expect(recap!.week).toBe(2);
    expect(recap!.availableWeeks).toEqual([1, 2]);
    expect(recap!.games).toHaveLength(1);
    expect(recap!.games[0].team1Pts).toBe(110);
  });

  it('accepts an explicit earlier week', () => {
    const recap = weeklyRecap(
      leagueOf({ matchups: [{ week: 1, t1: 't1', t2: 't2', p1: 100, p2: 90 }] }),
      1,
    );
    expect(recap!.week).toBe(1);
  });

  it('returns null for a week with no games', () => {
    expect(
      weeklyRecap(
        leagueOf({ matchups: [{ week: 1, t1: 't1', t2: 't2', p1: 100, p2: 90 }] }),
        9,
      ),
    ).toBeNull();
  });

  it('headlines a blowout of 50+ points', () => {
    const recap = weeklyRecap(
      leagueOf({ matchups: [{ week: 1, t1: 't1', t2: 't2', p1: 180, p2: 100 }] }),
    );
    expect(recap!.headline).toBe('Alpha massacres Beta');
    expect(recap!.headlineDetail).toBe('180.0-100.0');
  });

  it('headlines a squeaker decided by 2 or fewer', () => {
    const recap = weeklyRecap(
      leagueOf({ matchups: [{ week: 1, t1: 't1', t2: 't2', p1: 101.5, p2: 100 }] }),
    );
    expect(recap!.headline).toBe('Alpha survives Beta by 1.5');
  });

  it('falls back to the high scorer on an ordinary week', () => {
    const recap = weeklyRecap(
      leagueOf({ matchups: [{ week: 1, t1: 't1', t2: 't2', p1: 130, p2: 100 }] }),
    );
    expect(recap!.headline).toBe('Alpha hangs 130.0');
    expect(recap!.headlineDetail).toBe('beats Beta 130.0-100.0');
  });

  it('names the weekly lucky escape and cruel beat', () => {
    const recap = weeklyRecap(
      leagueOf({
        matchups: [
          // Alpha wins big; Beta loses big.
          { week: 1, t1: 't1', t2: 't2', p1: 150, p2: 140 },
          { week: 1, t1: 't2', t2: 't1', p1: 120, p2: 110 },
        ],
      }),
    );
    // Escape = lowest winning score (110 beats 150? no - lowest winning
    // score is 110); cruel beat = highest losing score (140).
    expect(recap!.luckyEscape).toBeDefined();
    expect(recap!.cruelBeat).toBeDefined();
  });

  it('computes over/underperformers vs the TraderApe projection', () => {
    // Hero scores 10, 11, then 30 in week 3: the recency-weighted model
    // projects ~10.8, so week 3 is a big overperformance.
    const players = [{ id: 'p-hero', name: 'Hero Back', position: 'RB' }];
    const recap = weeklyRecap(
      leagueOf({
        matchups: [
          { week: 1, t1: 't1', t2: 't2', p1: 100, p2: 90 },
          { week: 2, t1: 't1', t2: 't2', p1: 100, p2: 90 },
          { week: 3, t1: 't1', t2: 't2', p1: 100, p2: 90 },
        ],
        players,
        playerWeeklyPoints: { 'p-hero': { 1: 10, 2: 11, 3: 30 } },
      }),
      3,
    );
    expect(recap!.hasWeeklyPoints).toBe(true);
    expect(recap!.overperformers).toHaveLength(1);
    expect(recap!.overperformers[0].name).toBe('Hero Back');
    expect(recap!.overperformers[0].diff).toBeGreaterThan(5);
    expect(recap!.overperformers[0].weeksUsed).toBe(2);
  });

  it('needs two prior weeks before projecting', () => {
    const recap = weeklyRecap(
      leagueOf({
        matchups: [{ week: 2, t1: 't1', t2: 't2', p1: 100, p2: 90 }],
        players: [{ id: 'p-one', name: 'One Game', position: 'WR' }],
        playerWeeklyPoints: { 'p-one': { 1: 20, 2: 30 } },
      }),
      2,
    );
    expect(recap!.overperformers).toHaveLength(0);
    expect(recap!.underperformers).toHaveLength(0);
  });

  it('skips kickers and defenses in over/under calls', () => {
    const recap = weeklyRecap(
      leagueOf({
        matchups: [
          { week: 1, t1: 't1', t2: 't2', p1: 100, p2: 90 },
          { week: 2, t1: 't1', t2: 't2', p1: 100, p2: 90 },
          { week: 3, t1: 't1', t2: 't2', p1: 100, p2: 90 },
        ],
        players: [{ id: 'p-k', name: 'Big Leg', position: 'K' }],
        playerWeeklyPoints: { 'p-k': { 1: 5, 2: 5, 3: 25 } },
      }),
      3,
    );
    expect(recap!.overperformers).toHaveLength(0);
  });

  it('names the best and worst draft picks to date', () => {
    // Steel (round 8) is the RB1 by points; Bust (round 1) scores little.
    const draftPicks = [
      pick({ pickNumber: 8, round: 1, teamId: 't1', teamName: 'Alpha', player: { id: 'bust', platformId: 'bust', name: 'Bust Guy', position: 'RB', team: 'NFL' }, seasonPoints: 40 }),
      pick({ pickNumber: 64, round: 8, teamId: 't2', teamName: 'Beta', player: { id: 'steel', platformId: 'steel', name: 'Steel Find', position: 'RB', team: 'NFL' }, seasonPoints: 160 }),
      pick({ pickNumber: 65, round: 9, teamId: 't2', teamName: 'Beta', player: { id: 'mid', platformId: 'mid', name: 'Mid Guy', position: 'RB', team: 'NFL' }, seasonPoints: 60 }),
    ];
    const recap = weeklyRecap(
      leagueOf({
        matchups: [{ week: 1, t1: 't1', t2: 't2', p1: 100, p2: 90 }],
        draftPicks,
      }),
    );
    expect(recap!.hasDraftData).toBe(true);
    expect(recap!.bestPick?.name).toBe('Steel Find');
    expect(recap!.worstPick?.name).toBe('Bust Guy');
    // best beats expectations (positive), worst misses them (negative).
    expect(recap!.bestPick!.valueOverExpected).toBeGreaterThan(0);
    expect(recap!.worstPick!.valueOverExpected).toBeLessThan(0);
  });

  it('excludes keepers from draft pick calls', () => {
    const draftPicks = [
      pick({ pickNumber: 1, round: 1, teamId: 't1', teamName: 'Alpha', isKeeper: true, player: { id: 'k1', platformId: 'k1', name: 'Keeper Stud', position: 'RB', team: 'NFL' }, seasonPoints: 200 }),
      pick({ pickNumber: 10, round: 2, teamId: 't2', teamName: 'Beta', player: { id: 'r1', platformId: 'r1', name: 'Real Pick', position: 'RB', team: 'NFL' }, seasonPoints: 100 }),
    ];
    const recap = weeklyRecap(
      leagueOf({
        matchups: [{ week: 1, t1: 't1', t2: 't2', p1: 100, p2: 90 }],
        draftPicks,
      }),
    );
    expect(recap!.bestPick?.name).toBe('Real Pick');
    expect(recap!.worstPick?.name).toBe('Real Pick');
  });

  it('exposes season luck extremes from the luck engine', () => {
    const recap = weeklyRecap(
      leagueOf({
        matchups: [
          { week: 1, t1: 't1', t2: 't2', p1: 150, p2: 100 },
          { week: 2, t1: 't1', t2: 't2', p1: 150, p2: 100 },
          { week: 3, t1: 't1', t2: 't2', p1: 150, p2: 100 },
        ],
        wins: { t1: { w: 3, l: 0, pts: 450 }, t2: { w: 0, l: 3, pts: 300 } },
      }),
    );
    expect(recap!.luckiestSeason?.teamName).toBeDefined();
    expect(recap!.unluckiestSeason?.teamName).toBeDefined();
    // Escape = lowest winning score; cruel beat = highest losing score.
    expect(recap!.luckyEscape?.teamName).toBe('Alpha');
    expect(recap!.cruelBeat?.teamName).toBe('Beta');
    expect(recap!.cruelBeat?.weekPoints).toBe(100);
  });

  it('hides sections cleanly when data is missing', () => {
    const recap = weeklyRecap(
      leagueOf({ matchups: [{ week: 1, t1: 't1', t2: 't2', p1: 100, p2: 90 }] }),
    );
    expect(recap!.hasWeeklyPoints).toBe(false);
    expect(recap!.hasDraftData).toBe(false);
    expect(recap!.overperformers).toHaveLength(0);
    expect(recap!.bestPick).toBeUndefined();
  });
});
