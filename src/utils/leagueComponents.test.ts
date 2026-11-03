// leagueComponents: the Sleeper TD/usage join that wires league-mode
// Start/Sit into the projection model's component terms (pipeline
// follow-up). The bundled pool is mocked: one Yahoo-id QB resolved by
// name, one Sleeper-id RB resolved directly, one WR with no Sleeper
// series, plus K/DST players whose series must be ignored.

import { describe, expect, it, vi } from 'vitest';
import type { Player } from '@/types';

vi.mock('@/data/draftPool', () => ({
  POOL: {
    season: 2026,
    generatedAt: '2026-11-03T00:00:00Z',
    baseline: { budget: 200, teams: 10, rounds: 16 },
    players: [
      { id: 'qb-yahoo', name: 'Yahoo Quarterback', pos: 'QB', sleeperId: '2001' },
      { id: 'rb-pool', name: 'Pool Runner', pos: 'RB', sleeperId: '2002' },
      { id: 'wr-missing', name: 'Ghost Wideout', pos: 'WR', sleeperId: '2003' },
      { id: 'k-kicker', name: 'Pool Kicker', pos: 'K', sleeperId: '2004' },
      { id: 'dst-team', name: 'Pool Defense', pos: 'DST', sleeperId: '2005' },
    ],
  },
}));

import { mapSleeperComponentsToRosterKeys } from './leagueComponents';
import { scoreRosterPlayers } from './rosterScoring';

function mkPlayer(platformId: string, name: string, pos: string): Player {
  return { id: platformId, platformId, name, position: pos, team: 'XXX' } as Player;
}

const TD = {
  '2001': { 1: 6, 2: 6, 3: 6, 4: 6 },
  '2002': { 1: 0, 2: 0, 3: 0, 4: 24 },
  '2004': { 1: 0, 2: 0, 3: 0, 4: 0 },
  '2005': { 1: 0, 2: 0, 3: 0, 4: 0 },
};
const USAGE = {
  '2001': { 1: 40, 2: 40, 3: 40, 4: 40 },
  '2002': { 1: 10, 2: 10, 3: 10, 4: 30 },
  '2004': { 1: 0, 2: 0, 3: 0, 4: 0 },
  '2005': { 1: 0, 2: 0, 3: 0, 4: 0 },
};

const ROSTER = [
  // Yahoo id, not in the pool — resolves by name to sleeper 2001.
  mkPlayer('yahoo-999', 'Yahoo Quarterback', 'QB'),
  mkPlayer('2002', 'Pool Runner', 'RB'),
  mkPlayer('2003', 'Ghost Wideout', 'WR'),
  mkPlayer('2004', 'Pool Kicker', 'K'),
  mkPlayer('2005', 'Pool Defense', 'DST'),
  // No pool match at all.
  mkPlayer('nobody-1', 'Unknown Player', 'WR'),
];

describe('mapSleeperComponentsToRosterKeys', () => {
  it('re-keys Sleeper series onto platform ids, resolving Yahoo ids by name', () => {
    const maps = mapSleeperComponentsToRosterKeys(ROSTER, TD, USAGE);
    expect(maps.weeklyTdPoints['yahoo-999']).toEqual(TD['2001']);
    expect(maps.weeklyUsage['yahoo-999']).toEqual(USAGE['2001']);
    expect(maps.weeklyTdPoints['2002']).toEqual(TD['2002']);
  });

  it('skips players with no Sleeper series, K/DST, and unknown players', () => {
    const maps = mapSleeperComponentsToRosterKeys(ROSTER, TD, USAGE);
    expect(maps.weeklyTdPoints['2003']).toBeUndefined();
    expect(maps.weeklyTdPoints['2004']).toBeUndefined();
    expect(maps.weeklyTdPoints['2005']).toBeUndefined();
    expect(maps.weeklyTdPoints['nobody-1']).toBeUndefined();
    expect(Object.keys(maps.weeklyTdPoints).sort()).toEqual(['2002', 'yahoo-999']);
  });

  it('passes partial series through as-is for the model to gate', () => {
    const maps = mapSleeperComponentsToRosterKeys(ROSTER, { '2002': { 4: 24 } }, {});
    expect(maps.weeklyTdPoints['2002']).toEqual({ 4: 24 });
    expect(maps.weeklyUsage['2002']).toBeUndefined();
  });
});

describe('joined maps price the model terms', () => {
  // Flat 20-pt weeks with a TD spike / usage surge in week 4 only.
  const weeklyPoints = { '2002': { 1: 20, 2: 20, 3: 20, 4: 20 } };
  const rb = [mkPlayer('2002', 'Pool Runner', 'RB')];
  const maps = mapSleeperComponentsToRosterKeys(rb, TD, USAGE);

  it('a TD-inflated recent week regresses under a nonzero TD term', () => {
    const [scored] = scoreRosterPlayers({
      roster: rb,
      weeklyPoints,
      weeklyTdPoints: maps.weeklyTdPoints,
      tdRegression: { strength: 1, cap: 5 },
      currentWeek: 5,
    });
    expect(scored.projection?.tdAdjustment).toBeLessThan(0);
  });

  it('a usage surge prices positively under a nonzero usage term', () => {
    const [scored] = scoreRosterPlayers({
      roster: rb,
      weeklyPoints,
      weeklyUsage: maps.weeklyUsage,
      usageTrend: { strength: 1, cap: 5 },
      currentWeek: 5,
    });
    expect(scored.projection?.usageAdjustment).toBeGreaterThan(0);
  });

  it('both terms stay 0 under the production defaults', () => {
    const [scored] = scoreRosterPlayers({
      roster: rb,
      weeklyPoints,
      weeklyTdPoints: maps.weeklyTdPoints,
      weeklyUsage: maps.weeklyUsage,
      currentWeek: 5,
    });
    expect(scored.projection?.tdAdjustment).toBe(0);
    expect(scored.projection?.usageAdjustment).toBe(0);
  });
});
