import { describe, expect, it } from 'vitest';
import type { League, Player, Team } from '@/types';
import { buildGamePlan, TOSS_UP_THRESHOLD } from './gamePlan';

// Roster player helper: weekly points keyed by platformId drive the
// projection (no prior weeks → projection from the entries given). The NFL
// team code 'XXX' is not a real team, so the matchup blend never fires and
// projections equal the flat weekly averages — deterministic for the
// threshold assertions.
function mkPlayer(id: string, pos: string): Player {
  return { id, platformId: id, name: id, position: pos, team: 'XXX' } as Player;
}

// Weekly scores per player id, weeks 1-3 of a week-4 league.
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

function mkLeague(roster: Player[], pw: Record<string, Record<number, number>>): League {
  const team: Team = { id: 'A', name: 'Alpha', roster } as Team;
  return {
    id: 'L',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    currentWeek: 4,
    teams: [team],
    rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BENCH: 6 },
    playerWeeklyPoints: pw,
  } as League;
}

describe('buildGamePlan', () => {
  // Four RBs: rb1/rb2 start the RB slots, rb3 takes FLEX, rb4 (13) sits on
  // the bench within 2 of rb2's 15 — the toss-up call.
  it('flags a bench player within the toss-up threshold of a starter', () => {
    const roster = [
      mkPlayer('rb1', 'RB'),
      mkPlayer('rb2', 'RB'),
      mkPlayer('rb3', 'RB'),
      mkPlayer('rb4', 'RB'),
      mkPlayer('wr1', 'WR'),
      mkPlayer('wr2', 'WR'),
      mkPlayer('te1', 'TE'),
      mkPlayer('qb1', 'QB'),
    ];
    const pw = weekly({
      rb1: [16, 16, 16],
      rb2: [15, 15, 15],
      rb3: [14, 14, 14],
      rb4: [13, 13, 13],
      wr1: [12, 12, 12],
      wr2: [10, 10, 10],
      te1: [8, 8, 8],
      qb1: [20, 20, 20],
    });
    const league = mkLeague(roster, pw);
    const plan = buildGamePlan(league.teams[0], league);
    expect(plan.teamId).toBe('A');
    expect(plan.starters.length).toBeGreaterThan(0);
    const flag = plan.swapFlags.find(f => f.starterName === 'rb2');
    expect(flag).toBeDefined();
    expect(flag!.kind).toBe('toss-up');
    expect(flag!.challengerName).toBe('rb4');
    expect(flag!.starterScore - flag!.challengerScore).toBeLessThanOrEqual(TOSS_UP_THRESHOLD);
    expect(flag!.note).toContain('coin flip');
  });

  it('shows no flags when every starter outprojects his cover by 2+', () => {
    const roster = [
      mkPlayer('rb1', 'RB'),
      mkPlayer('rb2', 'RB'),
      mkPlayer('rb3', 'RB'),
      mkPlayer('rb4', 'RB'), // 5 avg — far below the 14-16 starters/FLEX
      mkPlayer('wr1', 'WR'),
      mkPlayer('wr2', 'WR'),
      mkPlayer('te1', 'TE'),
      mkPlayer('qb1', 'QB'),
    ];
    const pw = weekly({
      rb1: [16, 16, 16],
      rb2: [15, 15, 15],
      rb3: [5, 5, 5],
      wr1: [12, 12, 12],
      wr2: [10, 10, 10],
      te1: [8, 8, 8],
      qb1: [20, 20, 20],
    });
    const league = mkLeague(roster, pw);
    const plan = buildGamePlan(league.teams[0], league);
    expect(plan.swapFlags).toHaveLength(0);
  });

  it('keeps only the best challenger per slot and sorts by gain', () => {
    const roster = [
      mkPlayer('rb1', 'RB'),
      mkPlayer('rb2', 'RB'),
      mkPlayer('rb3', 'RB'), // 14 avg — takes FLEX
      mkPlayer('rb4', 'RB'), // 13 avg — best challenger, on the bench
      mkPlayer('rb5', 'RB'), // 12.5 avg — worse challenger, dropped
      mkPlayer('wr1', 'WR'),
      mkPlayer('wr2', 'WR'),
      mkPlayer('te1', 'TE'),
      mkPlayer('qb1', 'QB'),
    ];
    const pw = weekly({
      rb1: [16, 16, 16],
      rb2: [15, 15, 15],
      rb3: [14, 14, 14],
      rb4: [13, 13, 13],
      rb5: [12.5, 12.5, 12.5],
      wr1: [12, 12, 12],
      wr2: [10, 10, 10],
      te1: [8, 8, 8],
      qb1: [20, 20, 20],
    });
    const league = mkLeague(roster, pw);
    const plan = buildGamePlan(league.teams[0], league);
    const rbFlags = plan.swapFlags.filter(f => f.slot === 'RB');
    const flexFlags = plan.swapFlags.filter(f => f.slot === 'FLEX');
    // Each slot keeps exactly its best challenger: rb4 (13) outranks rb5
    // (12.5) everywhere it qualifies, so rb5 — within 2 only of the FLEX
    // starter — is dropped in favor of rb4.
    expect(rbFlags).toHaveLength(1);
    expect(rbFlags[0].challengerName).toBe('rb4');
    expect(flexFlags).toHaveLength(1);
    expect(flexFlags[0].challengerName).toBe('rb4');
    expect(plan.swapFlags.some(f => f.challengerName === 'rb5')).toBe(false);
    // Sorted by gain descending: the FLEX flag (gain -1) outranks the RB
    // flag (gain -2).
    expect(plan.swapFlags[0].slot).toBe('FLEX');
  });

  it('returns an empty plan for a team with no roster', () => {
    const team = { id: 'B', name: 'Beta', roster: [] } as Team;
    const league = mkLeague([], {});
    league.teams = [team];
    const plan = buildGamePlan(team, league);
    expect(plan.starters).toHaveLength(0);
    expect(plan.swapFlags).toHaveLength(0);
  });
});

describe('componentMaps wiring (league-mode TD/usage terms)', () => {
  // rb1 scores a steady 12 pts/week over 7 weeks; his TD line spikes only
  // in week 7 (12 TD pts after six scoreless weeks) and his usage line
  // surges in week 7 (20 opps after six 10-opp weeks). Same series as the
  // Matchup preview's wiring tests, so the same ~3.1-pt TD drop and
  // ~2.7-pt usage gain are expected when the terms are priced.
  const tdSpike: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 12 };
  const usageSurge: Record<number, number> = { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 20 };

  function week8League(): League {
    const roster = [
      mkPlayer('rb1', 'RB'),
      mkPlayer('rb2', 'RB'),
      mkPlayer('wr1', 'WR'),
      mkPlayer('wr2', 'WR'),
      mkPlayer('te1', 'TE'),
      mkPlayer('qb1', 'QB'),
    ];
    const flat7 = (v: number) => [v, v, v, v, v, v, v];
    const pw = weekly({
      rb1: flat7(12),
      rb2: flat7(11),
      wr1: flat7(12),
      wr2: flat7(10),
      te1: flat7(8),
      qb1: flat7(20),
    });
    const league = mkLeague(roster, pw);
    league.currentWeek = 8;
    return league;
  }

  function rb1Score(plan: ReturnType<typeof buildGamePlan>): number {
    return plan.starters.find(s => s.id === 'rb1')!.score;
  }

  it('changes nothing at the production defaults', () => {
    const league = week8League();
    const base = rb1Score(buildGamePlan(league.teams[0], league));
    const wired = rb1Score(
      buildGamePlan(league.teams[0], league, {
        componentMaps: { weeklyTdPoints: { rb1: tdSpike }, weeklyUsage: { rb1: usageSurge } },
      }),
    );
    expect(wired).toBe(base);
  });

  it('regresses a TD spike when the term is priced', () => {
    const league = week8League();
    const base = rb1Score(buildGamePlan(league.teams[0], league));
    const wired = rb1Score(
      buildGamePlan(league.teams[0], league, {
        componentMaps: { weeklyTdPoints: { rb1: tdSpike }, weeklyUsage: {} },
        tdRegression: { strength: 1, cap: 5 },
      }),
    );
    const drop = base - wired;
    expect(drop).toBeGreaterThan(2.5);
    expect(drop).toBeLessThan(3.5);
  });

  it('prices a usage surge when the term is priced', () => {
    const league = week8League();
    const base = rb1Score(buildGamePlan(league.teams[0], league));
    const wired = rb1Score(
      buildGamePlan(league.teams[0], league, {
        componentMaps: { weeklyTdPoints: {}, weeklyUsage: { rb1: usageSurge } },
        usageTrend: { strength: 1, cap: 5 },
      }),
    );
    const gain = wired - base;
    expect(gain).toBeGreaterThan(2.0);
    expect(gain).toBeLessThan(3.5);
  });
});
