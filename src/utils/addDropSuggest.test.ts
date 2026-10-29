// Add/Drop suggestions: the least valuable bench player beyond starter
// demand pairs with the best available target it beats by the margin.
import { describe, expect, it } from 'vitest';
import type { League, RosterSlots, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { DEFAULT_MANUAL_SHAPE } from './tradeAnalysis';
import {
  addDropSuggestions,
  addTargets,
  dropCandidates,
  MAX_SUGGESTIONS,
  MIN_VOR_GAIN,
} from './addDropSuggest';

const SLOTS: RosterSlots = { ...DEFAULT_MANUAL_SHAPE };

function poolPlayer(id: string, pos: string, proj: number): PoolPlayer {
  return {
    id,
    name: id,
    pos,
    team: 'FA',
    projPts: proj,
    projPtsPpr: proj,
    projPtsStd: proj,
  } as PoolPlayer;
}

// 10-team replacement levels with a thin QB pool: 3 real QBs + 11 fillers
// at 120 so the replacement level sits near 120 and every real QB has
// clearly positive VOR.
function makePool(extra: PoolPlayer[] = []): DraftPoolFile {
  const players: PoolPlayer[] = [
    poolPlayer('hot', 'QB', 420),
    poolPlayer('a', 'QB', 380),
    poolPlayer('b', 'QB', 300),
    poolPlayer('k1', 'K', 150),
    ...Array.from({ length: 11 }, (_, i) =>
      poolPlayer(`qf${i}`, 'QB', 120),
    ),
    ...extra,
  ];
  return { players } as DraftPoolFile;
}

function rosterPlayer(id: string, pos: string) {
  return { id, platformId: id, name: id, position: pos, team: 'FA' };
}

function team(id: string, rosterIds: string[]): Team {
  return {
    id,
    name: id,
    roster: rosterIds.map(rid => rosterPlayer(rid, 'QB')),
  } as Team;
}

function leagueWith(teams: Team[]): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    totalTeams: 10,
    rosterSlots: SLOTS,
    scoringType: 'ppr',
    teams,
  } as League;
}

describe('dropCandidates', () => {
  it('cuts only players beyond QB starter demand (1), least valuable first', () => {
    const pool = makePool();
    const lg = leagueWith([team('me', ['a', 'b'])]);
    const drops = dropCandidates(lg, lg.teams[0], pool);
    // Sorted desc by VOR: a (380) is the protected starter; b is cuttable.
    expect(drops.map(d => d.player.id)).toEqual(['b']);
    expect(drops[0].vor).toBeGreaterThan(0);
  });

  it('never names the starter the cuttable player', () => {
    const pool = makePool();
    const lg = leagueWith([team('me', ['a'])]);
    expect(dropCandidates(lg, lg.teams[0], pool)).toEqual([]);
  });

  it('returns empty for a team with no roster', () => {
    const pool = makePool();
    const lg = leagueWith([team('me', [])]);
    expect(dropCandidates(lg, lg.teams[0], pool)).toEqual([]);
  });
});

describe('addTargets', () => {
  it('lists unrostered positive-VOR players, most valuable first', () => {
    const pool = makePool();
    const lg = leagueWith([team('me', ['a', 'b'])]);
    const targets = addTargets(lg, pool);
    const ids = targets.map(t => t.player.id);
    expect(ids[0]).toBe('hot');
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('b');
    expect(targets.every(t => t.vor > 0)).toBe(true);
  });
});

describe('addDropSuggestions', () => {
  it('pairs the best target with the least valuable bench player it beats', () => {
    const pool = makePool();
    const lg = leagueWith([team('me', ['a', 'b'])]);
    const moves = addDropSuggestions(lg, lg.teams[0], undefined, pool);
    expect(moves.length).toBeGreaterThan(0);
    const first = moves[0];
    expect(first.add.id).toBe('hot');
    expect(first.drop.id).toBe('b');
    expect(first.gain).toBeGreaterThanOrEqual(MIN_VOR_GAIN);
    expect(first.gain).toBeCloseTo(first.addVor - first.dropVor, 5);
  });

  it('fires nothing when the best target does not beat the bench by the margin', () => {
    const pool = makePool([
      poolPlayer('hot2', 'QB', 301), // beats b (300) by ~1 VOR: under the margin
    ]);
    // 'hot' is rostered so it can't be the pairing target.
    const lg = leagueWith([team('me', ['a', 'b', 'hot'])]);
    const moves = addDropSuggestions(lg, lg.teams[0], undefined, pool);
    expect(moves).toEqual([]);
  });

  it('names the positional need when the profile has one', () => {
    const pool = makePool();
    const lg = leagueWith([team('me', ['a', 'b'])]);
    const profile = {
      positions: { QB: { need: true } },
    } as unknown as Parameters<typeof addDropSuggestions>[2];
    const moves = addDropSuggestions(lg, lg.teams[0], profile, pool);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves[0].reasons.some(r => r.includes('need at QB'))).toBe(true);
  });

  it('caps at MAX_SUGGESTIONS and never reuses a drop candidate', () => {
    const extras = [
      poolPlayer('h2', 'QB', 415),
      poolPlayer('h3', 'QB', 410),
      poolPlayer('h4', 'QB', 405),
      poolPlayer('h5', 'QB', 400),
    ];
    const pool = makePool(extras);
    // Roster 5 QBs: a is the starter, b + qf0..qf2 are beyond demand.
    // (qf fillers have VOR ~0, so pairs fire against the hot extras.)
    const lg = leagueWith([team('me', ['a', 'b', 'qf0', 'qf1', 'qf2'])]);
    const moves = addDropSuggestions(lg, lg.teams[0], undefined, pool);
    expect(moves.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    const dropIds = moves.map(m => m.drop.id);
    expect(new Set(dropIds).size).toBe(dropIds.length);
  });

  it('returns empty when the team has no cuttable players', () => {
    const pool = makePool();
    const lg = leagueWith([team('me', ['a'])]);
    expect(addDropSuggestions(lg, lg.teams[0], undefined, pool)).toEqual([]);
  });
});
