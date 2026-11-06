import { describe, expect, it } from 'vitest';
import type { League, RosterSlots, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { DEFAULT_VOR_CONFIG, vorPoints } from './projectionValues';
import { DEFAULT_MANUAL_SHAPE, valueLeagueFor } from './tradeAnalysis';
import { teamProfiles } from './tradeFinder';
import { findThreeTeamCycles } from './threeTeamTrades';

const SLOTS: RosterSlots = { ...DEFAULT_MANUAL_SHAPE };

let rank = 1;
function player(partial: Partial<PoolPlayer> & { id: string; pos: string }): PoolPlayer {
  return {
    name: partial.id,
    team: 'FA',
    posRank: 1,
    overallRank: partial.overallRank ?? rank++,
    tier: 1,
    bye: null,
    baseValue: null,
    ...partial,
  } as PoolPlayer;
}

// Same steep talent curve as the pair finder's tests, so VOR spreads are
// meaningful: RB2/WR2 40 VOR, TE2 20 VOR in a 4-team league.
function makePool(): DraftPoolFile {
  const players: PoolPlayer[] = [];
  const add = (pos: string, count: number, base: number, step: number) => {
    for (let i = 0; i < count; i++) {
      const pts = base - i * step;
      players.push(
        player({
          id: `${pos}${i + 1}`,
          pos,
          projPts: pts,
          projPtsPpr: pts,
          projPtsStd: pts,
        }),
      );
    }
  };
  add('QB', 20, 380, 8);
  add('RB', 60, 300, 4);
  add('WR', 60, 280, 4);
  add('TE', 30, 220, 5);
  return { players } as DraftPoolFile;
}

function team(id: string, name: string, rosterIds: string[]): Team {
  return {
    id,
    name,
    roster: rosterIds.map(rid => ({
      id: rid,
      platformId: rid,
      name: rid,
      position: rid.replace(/[0-9]+$/, ''),
      team: 'FA',
    })),
  } as Team;
}

function league(teams: Team[]): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    totalTeams: teams.length,
    rosterSlots: SLOTS,
    scoringType: 'ppr',
    teams,
  } as League;
}

// A three-way circle with no two-team fix: A is RB-deep / WR- and TE-weak,
// B is WR-deep / RB- and TE-weak, C is TE-deep / RB- and WR-weak. D is a
// balanced filler that sets the league medians.
function cycleLeague(): League {
  return league([
    team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'RB4', 'WR40', 'TE20']),
    team('b', 'Team B', ['QB2', 'RB40', 'WR1', 'WR2', 'WR3', 'WR4', 'TE25']),
    team('c', 'Team C', ['QB3', 'RB45', 'WR41', 'WR46', 'TE1', 'TE2', 'TE3']),
    team('d', 'Team D', ['QB4', 'RB5', 'RB6', 'WR7', 'WR8', 'TE5']),
  ]);
}

describe('findThreeTeamCycles', () => {
  it('finds the three-way circle where each team gives depth and gains a starter', () => {
    const pool = makePool();
    const cycles = findThreeTeamCycles(cycleLeague(), pool, DEFAULT_VOR_CONFIG);
    expect(cycles.length).toBeGreaterThan(0);
    const top = cycles[0];
    // One leg per team, flowing in a circle: three distinct givers.
    const givers = top.legs.map(l => l.giver.id);
    expect(new Set(givers).size).toBe(3);
    const receivers = top.legs.map(l => l.receiver.id);
    expect(new Set(receivers).size).toBe(3);
    // Each leg upgrades the receiver's starter. The best variant of the
    // circle moves stars, not depth: RB1/WR1/TE1 beat RB2/WR2/TE2 by
    // 4/4/5 VOR, so the top cycle is all-star at 44 + 44 + 25.
    for (const leg of top.legs) {
      expect(leg.starterGain).toBeGreaterThan(0);
      expect(leg.playerVor).toBeGreaterThan(leg.receiverBestBefore);
      expect(leg.kind).toBe('star');
      expect(leg.fallbackName).toBeTruthy();
      expect(leg.fallbackVor).toBeGreaterThan(0);
    }
    expect(top.totalGain).toBe(113);
    expect(top.score).toBe(113);
    expect(top.reasons.length).toBe(4);
    expect(top.reasons[3]).toMatch(/Total starter gain \+113 VOR/);
    // The star reasons name the fallback, so the cost is visible.
    expect(top.reasons[0]).toMatch(/star RB1.*falls back to RB2/);
  });

  it('finds a cycle only star legs can close: depth pieces tie the receiver best', () => {
    const pool = makePool();
    // Duplicate-projection players: same VOR as a pool regular, distinct id.
    // RBx/WRx tie the depth pieces (32 VOR after the duplicates shift the
    // replacement level); the stars sit 4 VOR above them.
    for (const extra of [
      { id: 'RBx', pos: 'RB', projPts: 296 },
      { id: 'WRx', pos: 'WR', projPts: 276 },
      { id: 'WRy', pos: 'WR', projPts: 280 },
      { id: 'WRz', pos: 'WR', projPts: 280 },
      { id: 'RBy', pos: 'RB', projPts: 300 },
      { id: 'TEy', pos: 'TE', projPts: 220 },
    ]) {
      pool.players.push(
        player({ ...extra, projPtsPpr: extra.projPts, projPtsStd: extra.projPts }),
      );
    }
    // A is RB-deep but B's best RB (RBx, 32 VOR) ties A's depth RB2, so the
    // depth leg gains 0 and only the RB1 star (+4) closes it; same shape at
    // WR (B's WRy star over C's WRx) while C's TE star is simply the best
    // variant. D is a neutral filler that sets the medians and can't give.
    const starOnly = league([
      team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'RB4', 'WR40', 'TE20']),
      team('b', 'Team B', ['QB2', 'RBx', 'WRy', 'WR2', 'WR3', 'WR4', 'TE25']),
      team('c', 'Team C', ['QB3', 'RBy', 'WRx', 'TEy', 'TE2', 'TE3']),
      team('d', 'Team D', ['QB4', 'RB5', 'RB6', 'WRz', 'WR5', 'TE4']),
    ]);
    const cycles = findThreeTeamCycles(starOnly, pool, DEFAULT_VOR_CONFIG);
    expect(cycles.length).toBe(1);
    const top = cycles[0];
    expect(top.legs.map(l => `${l.giver.id}->${l.receiver.id}:${l.position}`)).toEqual([
      'a->b:RB',
      'b->c:WR',
      'c->a:TE',
    ]);
    for (const leg of top.legs) {
      expect(leg.kind).toBe('star');
      expect(leg.starterGain).toBeGreaterThan(0);
    }
    expect(top.totalGain).toBe(
      top.legs.reduce((sum, l) => sum + l.starterGain, 0),
    );
    // Direct proof the depth variant can't form: A's second-best RB is
    // worth no more than B's best RB, so a depth leg gains nothing.
    const profiles = teamProfiles(starOnly, pool, DEFAULT_VOR_CONFIG);
    const vor = vorPoints(pool.players, valueLeagueFor(starOnly), DEFAULT_VOR_CONFIG);
    const aRb = profiles.find(p => p.team.id === 'a')!.positions.RB;
    const bRb = profiles.find(p => p.team.id === 'b')!.positions.RB;
    expect(vor.get(aRb.depthChart[1].id) ?? 0).toBeLessThanOrEqual(bRb.best);
  });

  it('finds 2-for-1 package legs when a team is deep enough to give two pieces and keep cover', () => {
    const pool = makePool();
    // A is five-deep at RB (RB7 is the fifth startable piece): giving its
    // second- and third-best still leaves RB1 + RB4 + RB7 covering RB2 +
    // FLEX demand, so the A -> B leg can move two pieces.
    const deep = league([
      team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'RB4', 'RB7', 'WR40', 'TE20']),
      team('b', 'Team B', ['QB2', 'RB40', 'WR1', 'WR2', 'WR3', 'WR4', 'TE25']),
      team('c', 'Team C', ['QB3', 'RB45', 'WR41', 'WR46', 'TE1', 'TE2', 'TE3']),
      team('d', 'Team D', ['QB4', 'RB5', 'RB6', 'WR7', 'WR8', 'TE5']),
    ]);
    const cycles = findThreeTeamCycles(deep, pool, DEFAULT_VOR_CONFIG);
    expect(cycles.length).toBeGreaterThan(0);
    const top = cycles[0];
    const rbLeg = top.legs.find(l => l.position === 'RB');
    expect(rbLeg?.kind).toBe('package');
    expect(rbLeg?.player.id).toBe('RB2');
    expect(rbLeg?.extraPlayer?.id).toBe('RB3');
    // Both pieces beat B's best RB (0 VOR): starter gain 40, depth gain 36.
    expect(rbLeg?.starterGain).toBe(40);
    expect(rbLeg?.depthGain).toBe(36);
    // totalGain stays starter-only; the depth gain only lifts the score,
    // so the package variant beats the 1-for-1 of the same shape.
    expect(top.totalGain).toBe(109);
    expect(top.totalDepthGain).toBe(36);
    expect(top.score).toBe(145);
    expect(top.reasons.join(' ')).toMatch(
      /RB2.*RB3.*2-for-1.*frees a bench spot/,
    );
    expect(top.reasons[top.reasons.length - 1]).toMatch(
      /Total starter gain \+109 VOR, plus \+36 VOR of bench depth/,
    );
  });

  it('never forms a package leg when giving two pieces would break starter cover', () => {
    const pool = makePool();
    // cycleLeague: A is four-deep at RB against demand 3 — giving RB2 +
    // RB3 would leave only RB1 + RB4 for RB2 + FLEX, so no package leg
    // fires anywhere in the circle (and the all-star top cycle is intact).
    const cycles = findThreeTeamCycles(cycleLeague(), pool, DEFAULT_VOR_CONFIG);
    expect(cycles.length).toBeGreaterThan(0);
    for (const cycle of cycles) {
      expect(cycle.legs.every(l => l.kind !== 'package')).toBe(true);
      expect(cycle.totalDepthGain).toBe(0);
      expect(cycle.score).toBe(cycle.totalGain);
    }
    expect(cycles[0].totalGain).toBe(113);
  });

  it('does not form a package leg when the extra piece only ties the receiver best', () => {
    const pool = makePool();
    // Duplicate-projection players: RBz ties A's third-best RB3 (same 292
    // pts, so the same VOR once the replacement level shifts), and RBy
    // lifts D's best so B still counts as needing RB. The depth leg still
    // fires (RB2 beats RBz), but the extra piece adds no bench depth
    // (depth gain 0), so the package variant never forms.
    for (const extra of [
      { id: 'RBz', pos: 'RB', projPts: 292 },
      { id: 'RBy', pos: 'RB', projPts: 296 },
    ]) {
      pool.players.push(
        player({ ...extra, projPtsPpr: extra.projPts, projPtsStd: extra.projPts }),
      );
    }
    const tied = league([
      team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'RB4', 'RB7', 'WR40', 'TE20']),
      team('b', 'Team B', ['QB2', 'RBz', 'WR1', 'WR2', 'WR3', 'WR4', 'TE25']),
      team('c', 'Team C', ['QB3', 'RB45', 'WR41', 'WR46', 'TE1', 'TE2', 'TE3']),
      team('d', 'Team D', ['QB4', 'RBy', 'RB6', 'WR7', 'WR8', 'TE5']),
    ]);
    const cycles = findThreeTeamCycles(tied, pool, DEFAULT_VOR_CONFIG);
    expect(cycles.length).toBeGreaterThan(0);
    // The tie blocks the package only where the extra piece ties: the A -> B
    // leg (B's best RB is RBz, worth exactly RB3) never moves two pieces —
    // while the same giver's A -> C leg (C's best RB is worthless) does,
    // proving the gate is per-receiver, not a global block.
    const toB = cycles.flatMap(c => c.legs).filter(l => l.giver.id === 'a' && l.receiver.id === 'b');
    expect(toB.length).toBeGreaterThan(0);
    expect(toB.every(l => l.kind !== 'package')).toBe(true);
    const toC = cycles.flatMap(c => c.legs).filter(l => l.giver.id === 'a' && l.receiver.id === 'c');
    expect(toC.some(l => l.kind === 'package')).toBe(true);
    // Direct proof the gate is the tie, not cover: A is five-deep, and
    // its third-best RB is worth exactly B's best RB.
    const profiles = teamProfiles(tied, pool, DEFAULT_VOR_CONFIG);
    const vor = vorPoints(pool.players, valueLeagueFor(tied), DEFAULT_VOR_CONFIG);
    const aRb = profiles.find(p => p.team.id === 'a')!.positions.RB;
    const bRb = profiles.find(p => p.team.id === 'b')!.positions.RB;
    expect(aRb.startable).toBeGreaterThan(4);
    expect(vor.get(aRb.depthChart[2].id) ?? 0).toBe(bRb.best);
  });

  it('returns no cycles when no three-way circle of need and depth exists', () => {
    const pool = makePool();
    // Every team is balanced at every position: nobody needs anything, so
    // no leg can form even though the rosters are full.
    const balanced = league([
      team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'WR1', 'WR2', 'WR3', 'TE1']),
      team('b', 'Team B', ['QB2', 'RB4', 'RB5', 'RB6', 'WR4', 'WR5', 'WR6', 'TE2']),
      team('c', 'Team C', ['QB3', 'RB7', 'RB8', 'RB9', 'WR7', 'WR8', 'WR9', 'TE3']),
      team('d', 'Team D', ['QB4', 'RB10', 'RB11', 'RB12', 'WR10', 'WR11', 'WR12', 'TE4']),
    ]);
    expect(findThreeTeamCycles(balanced, pool, DEFAULT_VOR_CONFIG)).toEqual([]);
  });

  it('returns no cycles with fewer than three teams', () => {
    const pool = makePool();
    const twoTeam = league([
      team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'RB4', 'WR40', 'TE20']),
      team('b', 'Team B', ['QB2', 'RB40', 'WR1', 'WR2', 'WR3', 'WR4', 'TE25']),
    ]);
    expect(findThreeTeamCycles(twoTeam, pool, DEFAULT_VOR_CONFIG)).toEqual([]);
  });

  it('caps the list at four cycles, best total gain first', () => {
    const pool = makePool();
    const cycles = findThreeTeamCycles(cycleLeague(), pool, DEFAULT_VOR_CONFIG);
    expect(cycles.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < cycles.length; i++) {
      expect(cycles[i - 1].score).toBeGreaterThanOrEqual(cycles[i].score);
    }
  });
});
