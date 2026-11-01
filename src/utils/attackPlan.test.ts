import { describe, expect, it } from 'vitest';
import type { League, Player, Team } from '@/types';
import { buildAttackPlan, attackVerdictFor } from './attackPlan';

// Real NFL teams so the matchup ratings fire from the bundled 2026
// schedule + allowed-vs-position averages (weeks 1–7). Week 8: MIN faces
// DET (QB rank 1, RB rank 22, WR rank 3, TE rank 1) and DET faces MIN
// (QB 32, RB 32, WR 29, TE 32).
function mkPlayer(id: string, pos: string, nfl: string): Player {
  return { id, platformId: id, name: id, position: pos, team: nfl } as Player;
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

function mkLeague(
  roster: Player[],
  pw: Record<string, Record<number, number>>,
  slots: League['rosterSlots'],
): League {
  const team: Team = { id: 'A', name: 'Alpha', roster } as Team;
  return {
    id: 'L',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    currentWeek: 8,
    teams: [team],
    rosterSlots: slots,
    playerWeeklyPoints: pw,
  } as League;
}

const SLOTS = { QB: 1, RB: 1, WR: 1, TE: 1, BENCH: 8 } as League['rosterSlots'];

function minRoster(): Player[] {
  return [
    mkPlayer('qb', 'QB', 'MIN'),
    mkPlayer('rb', 'RB', 'MIN'),
    mkPlayer('wr', 'WR', 'MIN'),
    mkPlayer('te', 'TE', 'MIN'),
  ];
}

function minWeekly(): Record<string, Record<number, number>> {
  return weekly({ qb: [20, 20, 20], rb: [16, 16, 16], wr: [12, 12, 12], te: [8, 8, 8] });
}

describe('buildAttackPlan', () => {
  it('ranks groups softest-first with best/toughest verdicts', () => {
    const plan = buildAttackPlan(mkLeague(minRoster(), minWeekly(), SLOTS).teams[0], mkLeague(minRoster(), minWeekly(), SLOTS));
    expect(plan).not.toBeNull();
    // MIN faces DET in week 8: QB rank 1, RB rank 22, WR rank 3, TE rank 1.
    expect(plan!.groups.map(g => g.group)).toEqual(['QB', 'TE', 'WR', 'RB']);
    expect(plan!.groups.map(g => g.avgRank)).toEqual([1, 1, 3, 22]);
    expect(plan!.best.group).toBe('QB');
    expect(plan!.best.verdict).toBe('soft');
    expect(plan!.toughest.group).toBe('RB');
    expect(plan!.toughest.verdict).toBe('avg');
    expect(plan!.week).toBe(8);
    expect(plan!.unrated).toBe(0);
  });

  it('sums projections per group and names the starters', () => {
    const plan = buildAttackPlan(mkLeague(minRoster(), minWeekly(), SLOTS).teams[0], mkLeague(minRoster(), minWeekly(), SLOTS));
    const wr = plan!.groups.find(g => g.group === 'WR')!;
    expect(wr.starters.map(s => s.name)).toEqual(['wr']);
    expect(wr.starters[0].rating.opponent).toBe('DET');
    expect(wr.starters[0].rating.rank).toBe(3);
    expect(wr.proj).toBeGreaterThan(0);
  });

  it('averages multi-starter groups across different opponents', () => {
    // Two MIN WRs (vs DET, WR rank 3) plus one DET WR (vs MIN, WR rank 29):
    // (3 + 3 + 29) / 3 = 11.7, an "avg" verdict.
    const roster = [
      mkPlayer('qb', 'QB', 'MIN'),
      mkPlayer('wr1', 'WR', 'MIN'),
      mkPlayer('wr2', 'WR', 'MIN'),
      mkPlayer('wr3', 'WR', 'DET'),
    ];
    const pw = weekly({
      qb: [20, 20, 20],
      wr1: [12, 12, 12],
      wr2: [11, 11, 11],
      wr3: [10, 10, 10],
    });
    const league = mkLeague(roster, pw, { QB: 1, WR: 3, BENCH: 4 } as League['rosterSlots']);
    const plan = buildAttackPlan(league.teams[0], league);
    const wr = plan!.groups.find(g => g.group === 'WR')!;
    expect(wr.avgRank).toBe(11.7);
    expect(wr.verdict).toBe('avg');
    expect(wr.starters.map(s => s.name)).toEqual(['wr1', 'wr2', 'wr3']);
  });

  it('excludes K/DST and unrated starters, counting the latter', () => {
    const roster = [
      ...minRoster(),
      mkPlayer('k', 'K', 'MIN'),
      // 'XXX' has no week-8 game in the bundled schedule: no rating.
      mkPlayer('qb2', 'QB', 'XXX'),
    ];
    const pw: Record<string, Record<number, number>> = {
      ...minWeekly(),
      k: { 1: 8, 2: 8, 3: 8 },
      qb2: { 1: 19, 2: 19, 3: 19 },
    };
    const league = mkLeague(roster, pw, { QB: 2, RB: 1, WR: 1, TE: 1, K: 1, BENCH: 6 } as League['rosterSlots']);
    const plan = buildAttackPlan(league.teams[0], league);
    // No K group; the XXX QB is skipped from the QB average but counted.
    expect(plan!.groups.some(g => g.group === ('K' as never))).toBe(false);
    const qb = plan!.groups.find(g => g.group === 'QB')!;
    expect(qb.starters.map(s => s.name)).toEqual(['qb']);
    expect(qb.avgRank).toBe(1);
    expect(plan!.unrated).toBe(1);
  });

  it('returns null with no roster or no pricing data', () => {
    const empty = mkLeague([], {}, SLOTS);
    expect(buildAttackPlan(empty.teams[0], empty)).toBeNull();
    const noData = mkLeague(minRoster(), {}, SLOTS);
    expect(buildAttackPlan(noData.teams[0], noData)).toBeNull();
  });
});

describe('attackVerdictFor', () => {
  it('uses the ≤10/≥23 softness thresholds', () => {
    expect(attackVerdictFor(1)).toBe('soft');
    expect(attackVerdictFor(10)).toBe('soft');
    expect(attackVerdictFor(11)).toBe('avg');
    expect(attackVerdictFor(22)).toBe('avg');
    expect(attackVerdictFor(23)).toBe('tough');
    expect(attackVerdictFor(32)).toBe('tough');
  });
});
