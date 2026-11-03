// rosterScoring: injury-out benching (backlog item 67). Players listed Out
// or on season-ending IR never start — the same discipline as bye weeks —
// while Questionable/Doubtful stay eligible as game-time decisions. The
// real bundled pool is mocked: a tiny five-player pool with one Out QB,
// one season-ending-IR RB, one Questionable WR, and two healthy players.

import { describe, expect, it, vi } from 'vitest';
import type { Player, Team } from '@/types';

vi.mock('@/data/draftPool', () => ({
  POOL: {
    season: 2026,
    generatedAt: '2026-10-31T00:00:00Z',
    baseline: { budget: 200, teams: 10, rounds: 16 },
    players: [
      {
        id: 'qb-out',
        name: 'Out Quarterback',
        pos: 'QB',
        sleeperId: '1001',
        injuryStatus: 'Out',
        injuryBodyPart: 'Knee',
        bye: 10,
      },
      {
        id: 'qb-healthy',
        name: 'Healthy Quarterback',
        pos: 'QB',
        sleeperId: '1002',
        bye: 10,
      },
      {
        id: 'rb-ir',
        name: 'IR Runner',
        pos: 'RB',
        sleeperId: '1003',
        injuryStatus: 'IR',
        injuryBodyPart: 'Knee',
        injuryNotes: 'Torn ACL',
        bye: 10,
      },
      {
        id: 'rb-healthy',
        name: 'Healthy Runner',
        pos: 'RB',
        sleeperId: '1004',
        bye: 10,
      },
      {
        id: 'wr-q',
        name: 'Questionable Wideout',
        pos: 'WR',
        sleeperId: '1005',
        injuryStatus: 'Questionable',
        bye: 10,
      },
    ],
  },
}));

import { scoreRosterPlayers } from './rosterScoring';
import { scoreTeamLineup } from './matchupPreview';
import { buildGamePlan } from './gamePlan';

// 'XXX' is not a real NFL team, so no matchup blend fires and projections
// equal the flat weekly averages — deterministic for the assertions.
function mkPlayer(id: string, name: string, pos: string): Player {
  return { id, platformId: id, name, position: pos, team: 'XXX' } as Player;
}

const QB_OUT = () => mkPlayer('qb-out', 'Out Quarterback', 'QB');
const QB_HEALTHY = () => mkPlayer('qb-healthy', 'Healthy Quarterback', 'QB');
const RB_IR = () => mkPlayer('rb-ir', 'IR Runner', 'RB');
const RB_HEALTHY = () => mkPlayer('rb-healthy', 'Healthy Runner', 'RB');
const WR_Q = () => mkPlayer('wr-q', 'Questionable Wideout', 'WR');

// Steady weekly points across completed weeks 1-7; the injured players are
// the better fantasy assets so the optimizer would start them without the
// injury filter.
function steady(pts: number): Record<string, number> {
  const w: Record<string, number> = {};
  for (let week = 1; week <= 7; week++) w[String(week)] = pts;
  return w;
}

const WEEKLY: Record<string, Record<string, number>> = {
  'qb-out': steady(25),
  'qb-healthy': steady(18),
  'rb-ir': steady(20),
  'rb-healthy': steady(14),
  'wr-q': steady(16),
};

const SLOTS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BENCH: 5 };

describe('scoreRosterPlayers injury-out flags', () => {
  const scored = scoreRosterPlayers({
    roster: [QB_OUT(), QB_HEALTHY(), RB_IR(), RB_HEALTHY(), WR_Q()],
    weeklyPoints: WEEKLY,
    season: 2026,
    currentWeek: 8,
  });
  const byId = new Map(scored.map(s => [s.id, s]));

  it('marks Out and season-ending IR players injuredOut', () => {
    expect(byId.get('qb-out')!.injuredOut).toBe(true);
    expect(byId.get('rb-ir')!.injuredOut).toBe(true);
  });

  it('leaves Questionable and healthy players eligible', () => {
    expect(byId.get('wr-q')!.injuredOut).toBe(false);
    expect(byId.get('qb-healthy')!.injuredOut).toBe(false);
    expect(byId.get('rb-healthy')!.injuredOut).toBe(false);
  });

  it('labels the injury for bench copy', () => {
    expect(byId.get('qb-out')!.injuryLabel).toBe('Out (Knee)');
    expect(byId.get('rb-ir')!.injuryLabel).toBe('Season-ending (Knee)');
    expect(byId.get('wr-q')!.injuryLabel).toBeNull();
  });
});

describe('scoreTeamLineup (matchup preview)', () => {
  it('benches the Out starter for the healthy backup', () => {
    const team = { id: 'A', name: 'Team A', roster: [QB_OUT(), QB_HEALTHY()] } as Team;
    const lined = scoreTeamLineup(team, {
      rosterSlots: SLOTS,
      currentWeek: 8,
      season: 2026,
      playerWeeklyPoints: WEEKLY,
    });
    const starterNames = lined!.starters.map(s => s.name);
    expect(starterNames).toContain('Healthy Quarterback');
    expect(starterNames).not.toContain('Out Quarterback');
  });

  it('benches the season-ending IR starter too', () => {
    const team = { id: 'A', name: 'Team A', roster: [RB_IR(), RB_HEALTHY()] } as Team;
    const lined = scoreTeamLineup(team, {
      rosterSlots: SLOTS,
      currentWeek: 8,
      season: 2026,
      playerWeeklyPoints: WEEKLY,
    });
    const starterNames = lined!.starters.map(s => s.name);
    expect(starterNames).toContain('Healthy Runner');
    expect(starterNames).not.toContain('IR Runner');
  });
});

describe('buildGamePlan', () => {
  it('excludes the Out player from the optimal lineup and its swap flags', () => {
    const team = { id: 'A', name: 'Team A', roster: [QB_OUT(), QB_HEALTHY()] } as Team;
    const plan = buildGamePlan(team, {
      rosterSlots: SLOTS,
      currentWeek: 8,
      season: 2026,
      playerWeeklyPoints: WEEKLY,
    });
    const starterNames = plan.starters.map(s => s.name).filter(Boolean);
    expect(starterNames).toContain('Healthy Quarterback');
    expect(starterNames).not.toContain('Out Quarterback');
    // The injured star must not show up as a "close call" challenger either.
    for (const flag of plan.swapFlags) {
      expect(flag.challengerName).not.toBe('Out Quarterback');
    }
  });
});

describe('scoreRosterPlayers TD/usage wiring (pipeline follow-up)', () => {
  // Flat 10-pt weeks 1–7 so the base projection is exactly 10 and any
  // movement is purely the wired term. Team XXX has no matchup rating,
  // so the matchup term stays 0.
  const flat10 = (): Record<string, number> => {
    const w: Record<string, number> = {};
    for (let week = 1; week <= 7; week++) w[String(week)] = 10;
    return w;
  };
  const base = {
    roster: [RB_HEALTHY()],
    weeklyPoints: { 'rb-healthy': flat10() },
    season: 2026,
    currentWeek: 8,
  };

  it('prices a rising usage trend when the series carries every week', () => {
    const usage: Record<string, number> = {};
    for (let week = 1; week <= 7; week++) usage[String(week)] = week <= 4 ? 10 : 20;
    const [scored] = scoreRosterPlayers({
      ...base,
      weeklyUsage: { 'rb-healthy': usage },
      usageTrend: { strength: 1, cap: 5 },
    });
    expect(scored.projection?.usageAdjustment).toBe(3.3);
    expect(scored.projection?.projection).toBe(13.3);
  });

  it('regresses TD-inflated recent form when the series carries every week', () => {
    const td: Record<string, number> = {};
    for (let week = 1; week <= 7; week++) td[String(week)] = week <= 4 ? 0 : 12;
    const [scored] = scoreRosterPlayers({
      ...base,
      weeklyTdPoints: { 'rb-healthy': td },
      tdRegression: { strength: 0.5, cap: 5 },
    });
    expect(scored.projection?.tdAdjustment).toBe(-2.8);
    expect(scored.projection?.projection).toBe(7.2);
  });

  it('skips the term on a partial component series instead of guessing', () => {
    const partial: Record<string, number> = { '1': 10, '2': 10, '3': 10 };
    const [scored] = scoreRosterPlayers({
      ...base,
      weeklyUsage: { 'rb-healthy': partial },
      usageTrend: { strength: 1, cap: 5 },
    });
    expect(scored.projection?.usageAdjustment).toBe(0);
    expect(scored.projection?.projection).toBe(10);
  });

  it('changes nothing under the production defaults (both terms OFF)', () => {
    const usage: Record<string, number> = {};
    for (let week = 1; week <= 7; week++) usage[String(week)] = week <= 4 ? 10 : 20;
    const [scored] = scoreRosterPlayers({ ...base, weeklyUsage: { 'rb-healthy': usage } });
    expect(scored.projection?.usageAdjustment).toBe(0);
    expect(scored.projection?.tdAdjustment).toBe(0);
    expect(scored.projection?.projection).toBe(10);
  });
});
