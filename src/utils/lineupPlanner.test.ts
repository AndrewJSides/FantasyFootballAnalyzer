import { describe, expect, it } from 'vitest';
import { planLineupWeeks } from './lineupPlanner';
import type { Player } from '@/types';

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
