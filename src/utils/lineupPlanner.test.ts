import { describe, expect, it, vi } from 'vitest';
import { planLineupWeeks } from './lineupPlanner';
import type { Player } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

// Synthetic pool players with injury designations, appended to the real
// bundled pool (vi.mock factories are hoisted, so the data is built with
// vi.hoisted). Existing tests keep resolving real players by name.
const { SYNTH_PLAYERS } = vi.hoisted(() => {
  function synthPlayer(over: Partial<PoolPlayer>): PoolPlayer {
    return {
      id: 'x',
      name: 'X',
      team: 'KC',
      pos: 'QB',
      posRank: 1,
      overallRank: 1,
      tier: 1,
      bye: null,
      baseValue: 1,
      projPtsPpr: 100,
      ...over,
    } as PoolPlayer;
  }
  return {
    SYNTH_PLAYERS: [
      synthPlayer({
        id: 'syn-out-qb',
        name: 'Out Ian',
        pos: 'QB',
        projPtsPpr: 320,
        injuryStatus: 'Out',
        injuryBodyPart: 'knee',
      }),
      synthPlayer({
        id: 'syn-q-qb',
        name: 'Game Time Gary',
        pos: 'QB',
        projPtsPpr: 260,
        injuryStatus: 'Questionable',
      }),
      synthPlayer({ id: 'syn-backup-qb', name: 'Backup Ian', pos: 'QB', projPtsPpr: 150 }),
      synthPlayer({
        id: 'syn-ir-te',
        name: 'Donezo Dan',
        pos: 'TE',
        projPtsPpr: 200,
        injuryStatus: 'IR',
        injuryBodyPart: 'knee',
        injuryNotes: 'ACL tear, out for the season',
      }),
      synthPlayer({ id: 'syn-backup-te', name: 'Next Dan', pos: 'TE', projPtsPpr: 120 }),
    ],
  };
});

vi.mock('@/data/draftPool', async importOriginal => {
  const mod = await importOriginal<typeof import('@/data/draftPool')>();
  const pool = mod.POOL as DraftPoolFile;
  return { ...mod, POOL: { ...pool, players: [...pool.players, ...SYNTH_PLAYERS] } };
});

const SLOTS = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  SUPERFLEX: 0,
  K: 1,
  DST: 1,
  BENCH: 7,
  IR: 0,
};

// ATL (bye week 11) core + one player each from two other teams so the
// lineup has cover when ATL sits.
function atlPlayer(id: string, name: string, position: string): Player {
  return { id, platformId: id, name, position, team: 'ATL' };
}
const roster: Player[] = [
  atlPlayer('tua-tagovailoa-qb', 'Tua Tagovailoa', 'QB'),
  atlPlayer('bijan-robinson-rb', 'Bijan Robinson', 'RB'),
  atlPlayer('brian-robinson-rb', 'Brian Robinson Jr.', 'RB'),
  { id: 'josh-allen-qb', platformId: 'josh-allen-qb', name: 'Josh Allen', position: 'QB', team: 'BUF' },
  { id: 'james-cook-rb', platformId: 'james-cook-rb', name: 'James Cook III', position: 'RB', team: 'BUF' },
  { id: 'ceedee-lamb-wr', platformId: 'ceedee-lamb-wr', name: 'CeeDee Lamb', position: 'WR', team: 'DAL' },
  { id: 'tucker-kraft-te', platformId: 'tucker-kraft-te', name: 'Tucker Kraft', position: 'TE', team: 'GB' },
];

const weeklyPoints: Record<string, Record<string, number>> = {};
for (const p of roster) {
  weeklyPoints[p.id] = {};
  for (let w = 1; w <= 7; w++) weeklyPoints[p.id][String(w)] = 10 + w;
}

const base = {
  roster,
  weeklyPoints,
  gamesSeason: 2026,
  season: 2026,
  slots: SLOTS,
};

describe('planLineupWeeks', () => {
  it('returns one plan per week in the range, empty when the range is inverted', () => {
    const plans = planLineupWeeks({ ...base, fromWeek: 9, toWeek: 11 });
    expect(plans.map(p => p.week)).toEqual([9, 10, 11]);
    expect(planLineupWeeks({ ...base, fromWeek: 12, toWeek: 11 })).toEqual([]);
  });

  it('projectedTotal reconciles with the starter scores', () => {
    const [plan] = planLineupWeeks({ ...base, fromWeek: 10, toWeek: 10 });
    const sum = Math.round(plan.starters.reduce((s, x) => s + x.score, 0) * 10) / 10;
    expect(plan.projectedTotal).toBe(sum);
    expect(plan.starters.length).toBeGreaterThan(0);
  });

  it('benches the bye-week team and names them in onBye', () => {
    const [week10, , week11] = planLineupWeeks({ ...base, fromWeek: 9, toWeek: 11 });
    // ATL is not on bye in week 10: the Falcons can start.
    expect(week10.onBye).toEqual([]);
    expect(week10.starters.some(s => s.nflTeam === 'ATL')).toBe(true);
    // ATL's bye is week 11: all three sit, none start.
    expect(week11.onBye).toEqual(
      expect.arrayContaining(['Brian Robinson Jr.', 'Bijan Robinson', 'Tua Tagovailoa']),
    );
    expect(week11.starters.some(s => s.nflTeam === 'ATL')).toBe(false);
  });

  it('names the bye-week holes: on-bye players who would have started', () => {
    // Tua is the clear QB1 on points, so the unfiltered week-11 pass
    // starts him and he shows up as the hole; week 10 has no holes.
    const boosted: Record<string, Record<string, number>> = {};
    for (const p of roster) {
      boosted[p.id] = {};
      for (let w = 1; w <= 7; w++) boosted[p.id][String(w)] = 10 + w;
    }
    for (let w = 1; w <= 7; w++) boosted['tua-tagovailoa-qb'][String(w)] = 20 + w;
    const [week10, , week11] = planLineupWeeks({
      ...base,
      weeklyPoints: boosted,
      fromWeek: 9,
      toWeek: 11,
    });
    expect(week10.holes).toEqual([]);
    const tuaHole = week11.holes.find(h => h.name === 'Tua Tagovailoa');
    expect(tuaHole).toMatchObject({ position: 'QB', nflTeam: 'ATL', cause: 'bye' });
    // Josh Allen (not on bye) is no hole even though he starts in week 11.
    expect(week11.holes.some(h => h.name === 'Josh Allen')).toBe(false);
  });

  it('prices each week on that week\'s matchup', () => {
    const [week10] = planLineupWeeks({ ...base, fromWeek: 10, toWeek: 10 });
    const rated = week10.starters.filter(s => s.opponent !== null);
    expect(rated.length).toBeGreaterThan(0);
    for (const s of rated) expect(['favorable', 'neutral', 'tough']).toContain(s.matchupLabel);
    expect(week10.toughCount + week10.favorableCount).toBeLessThanOrEqual(week10.starters.length);
  });

  it('fills the same slots as the Start/Sit optimizer', () => {
    const [plan] = planLineupWeeks({ ...base, fromWeek: 10, toWeek: 10 });
    const bySlot = new Map<string, number>();
    for (const s of plan.starters) bySlot.set(s.slot, (bySlot.get(s.slot) ?? 0) + 1);
    expect(bySlot.get('QB')).toBe(1);
    expect((bySlot.get('RB') ?? 0) + (bySlot.get('FLEX') ?? 0)).toBeGreaterThanOrEqual(2);
  });
});

describe('component wiring (pipeline follow-up)', () => {
  // One fake-team QB (no matchup blend, no bye) on flat 20-pt weeks, so
  // any projectedTotal movement comes from the component terms alone.
  const compRoster: Player[] = [
    { id: 'comp-qb', platformId: 'comp-qb', name: 'Comp QB', position: 'QB', team: 'XXX' },
  ];
  const compSlots = {
    QB: 1,
    RB: 0,
    WR: 0,
    TE: 0,
    FLEX: 0,
    SUPERFLEX: 0,
    K: 0,
    DST: 0,
    BENCH: 0,
    IR: 0,
  };
  const compBase = {
    roster: compRoster,
    weeklyPoints: { 'comp-qb': { 1: 20, 2: 20, 3: 20, 4: 20 } },
    gamesSeason: 2026,
    season: 2026,
    currentWeek: 5,
    slots: compSlots,
  };
  // TD spike / usage surge in the most recent week only.
  const tdSpike = { 'comp-qb': { 1: 6, 2: 6, 3: 6, 4: 24 } };
  const usageSurge = { 'comp-qb': { 1: 15, 2: 15, 3: 15, 4: 30 } };

  it('a TD-inflated recent week regresses the planned total under a nonzero TD term', () => {
    const [without] = planLineupWeeks({ ...compBase, fromWeek: 5, toWeek: 5 });
    const [withTd] = planLineupWeeks({
      ...compBase,
      weeklyTdPoints: tdSpike,
      tdRegression: { strength: 1, cap: 5 },
      fromWeek: 5,
      toWeek: 5,
    });
    expect(withTd.projectedTotal).toBeLessThan(without.projectedTotal);
  });

  it('a usage surge lifts the planned total under a nonzero usage term', () => {
    const [without] = planLineupWeeks({ ...compBase, fromWeek: 5, toWeek: 5 });
    const [withUsage] = planLineupWeeks({
      ...compBase,
      weeklyUsage: usageSurge,
      usageTrend: { strength: 1, cap: 5 },
      fromWeek: 5,
      toWeek: 5,
    });
    expect(withUsage.projectedTotal).toBeGreaterThan(without.projectedTotal);
  });

  it('both terms stay 0 under the production defaults', () => {
    const [plan] = planLineupWeeks({
      ...compBase,
      weeklyTdPoints: tdSpike,
      weeklyUsage: usageSurge,
      fromWeek: 5,
      toWeek: 5,
    });
    expect(plan.projectedTotal).toBe(20);
  });
});

describe('injury handling (backlog item 67 remainder)', () => {
  const INJURY_SLOTS = {
    QB: 1,
    RB: 0,
    WR: 0,
    TE: 1,
    FLEX: 0,
    SUPERFLEX: 0,
    K: 0,
    DST: 0,
    BENCH: 5,
    IR: 0,
  };

  const injuryRoster: Player[] = [
    { id: 'syn-out-qb', platformId: 'syn-out-qb', name: 'Out Ian', position: 'QB', team: 'KC' },
    { id: 'syn-q-qb', platformId: 'syn-q-qb', name: 'Game Time Gary', position: 'QB', team: 'KC' },
    { id: 'syn-backup-qb', platformId: 'syn-backup-qb', name: 'Backup Ian', position: 'QB', team: 'KC' },
    { id: 'syn-ir-te', platformId: 'syn-ir-te', name: 'Donezo Dan', position: 'TE', team: 'KC' },
    { id: 'syn-backup-te', platformId: 'syn-backup-te', name: 'Next Dan', position: 'TE', team: 'KC' },
  ];

  // Out Ian > Game Time Gary > Backup Ian at QB; Donezo Dan > Next Dan at TE.
  const injuryWeeklyPoints: Record<string, Record<string, number>> = {};
  const weeklyFor = (id: string, basePts: number) => {
    injuryWeeklyPoints[id] = {};
    for (let w = 1; w <= 7; w++) injuryWeeklyPoints[id][String(w)] = basePts + w;
  };
  weeklyFor('syn-out-qb', 22);
  weeklyFor('syn-q-qb', 18);
  weeklyFor('syn-backup-qb', 10);
  weeklyFor('syn-ir-te', 16);
  weeklyFor('syn-backup-te', 8);

  const injuryBase = {
    roster: injuryRoster,
    weeklyPoints: injuryWeeklyPoints,
    gamesSeason: 2026,
    season: 2026,
    currentWeek: 8,
    slots: INJURY_SLOTS,
  };

  it('benches an Out starter for the current week only', () => {
    const [week8, week9] = planLineupWeeks({ ...injuryBase, fromWeek: 8, toWeek: 9 });
    // Out Ian is the best QB but sits in week 8; Game Time Gary starts.
    expect(week8.starters.some(s => s.name === 'Out Ian')).toBe(false);
    expect(week8.starters.some(s => s.name === 'Game Time Gary')).toBe(true);
    const hole = week8.holes.find(h => h.name === 'Out Ian');
    expect(hole).toMatchObject({ cause: 'injury', position: 'QB', nflTeam: 'KC' });
    expect(hole?.injuryLabel).toContain('Out');
    // Week 9: the designation is current-week knowledge, so he returns.
    expect(week9.starters.some(s => s.name === 'Out Ian')).toBe(true);
    expect(week9.holes.some(h => h.name === 'Out Ian')).toBe(false);
  });

  it('benches a season-ending-IR starter for every remaining week', () => {
    const [week8, week9, week10] = planLineupWeeks({ ...injuryBase, fromWeek: 8, toWeek: 10 });
    for (const plan of [week8, week9, week10]) {
      expect(plan.starters.some(s => s.name === 'Donezo Dan')).toBe(false);
      expect(plan.starters.some(s => s.name === 'Next Dan')).toBe(true);
      expect(plan.holes.find(h => h.name === 'Donezo Dan')).toMatchObject({
        cause: 'injury',
        position: 'TE',
      });
    }
  });

  it('keeps Questionable players eligible as game-time decisions', () => {
    const [week8] = planLineupWeeks({ ...injuryBase, fromWeek: 8, toWeek: 8 });
    // Gary (Questionable) starts over the healthy backup while Out Ian sits.
    expect(week8.starters.some(s => s.name === 'Game Time Gary')).toBe(true);
    expect(week8.holes.some(h => h.name === 'Game Time Gary')).toBe(false);
  });
});

describe('sole-back fold (backlog item 173)', () => {
  it('prices the vacancy in the current week only, never in later weeks', () => {
    const sole = new Map([
      ['bijan-robinson-rb', { mates: ['Tyler Allgeier'], upside: 5 }],
    ]);
    const [week9, week10] = planLineupWeeks({
      ...base,
      currentWeek: 9,
      soleBack: sole,
      fromWeek: 9,
      toWeek: 10,
    });
    const bijan9 = week9.starters.find(s => s.name === 'Bijan Robinson');
    const bijan10 = week10.starters.find(s => s.name === 'Bijan Robinson');
    expect(bijan9).toBeDefined();
    expect(bijan10).toBeDefined();
    // Same completed-week series behind both weeks, so the only gap is
    // the folded upside — and it must not leak into the following week,
    // when the ruled-out mate may be back.
    expect(bijan9!.score).toBe(bijan10!.score + 5);
    expect(bijan9!.soleBack).toEqual({ mates: ['Tyler Allgeier'], upside: 5 });
    expect(bijan10!.soleBack).toBeNull();
  });
});
