import { describe, expect, it } from 'vitest';
import type { League, RosterSlots, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { DEFAULT_VOR_CONFIG } from './projectionValues';
import { DEFAULT_MANUAL_SHAPE } from './tradeAnalysis';
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
    // Each leg upgrades the receiver's starter and gives from depth, never
    // the star: the given player is the giver's second-best at its position.
    for (const leg of top.legs) {
      expect(leg.starterGain).toBeGreaterThan(0);
      expect(leg.playerVor).toBeGreaterThan(leg.receiverBestBefore);
    }
    // The RB -> WR -> TE circle gains 40 + 40 + 20 VOR of starter value.
    expect(top.totalGain).toBe(100);
    expect(top.score).toBe(100);
    expect(top.reasons.length).toBe(4);
    expect(top.reasons[3]).toMatch(/Total starter gain \+100 VOR/);
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
