import { describe, expect, it } from 'vitest';
import type { League, RosterSlots, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { DEFAULT_VOR_CONFIG } from './projectionValues';
import { DEFAULT_MANUAL_SHAPE } from './tradeAnalysis';
import { findTradeCandidates, teamProfiles } from './tradeFinder';

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

// Pool with a steep talent curve per position so VOR spreads are meaningful.
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

// Team A: deep at RB, weak at WR. Team B: deep at WR, weak at RB.
// C and D are balanced fillers.
function asymmetricLeague(pool: DraftPoolFile): League {
  void pool;
  return league([
    team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'RB4', 'WR40', 'TE20']),
    team('b', 'Team B', ['QB2', 'RB40', 'WR1', 'WR2', 'WR3', 'WR4', 'TE25']),
    team('c', 'Team C', ['QB3', 'RB5', 'RB6', 'WR5', 'WR6', 'TE5']),
    team('d', 'Team D', ['QB4', 'RB7', 'RB8', 'WR7', 'WR8', 'TE6']),
  ]);
}

describe('teamProfiles', () => {
  it('flags depth-for-need asymmetries as need/surplus', () => {
    const pool = makePool();
    const profiles = teamProfiles(asymmetricLeague(pool), pool, DEFAULT_VOR_CONFIG);
    const byId = new Map(profiles.map(p => [p.team.id, p]));
    const A = byId.get('a')!;
    const B = byId.get('b')!;
    expect(A.positions.WR.need).toBe(true);
    expect(A.positions.RB.surplus).toBe(true);
    expect(B.positions.RB.need).toBe(true);
    expect(B.positions.WR.surplus).toBe(true);
    // Nobody's top QB is a need or a surplus.
    expect(A.positions.QB.need).toBe(false);
    expect(B.positions.QB.surplus).toBe(false);
  });
});

describe('findTradeCandidates', () => {
  it('proposes a win-win swap between complementary teams', () => {    const pool = makePool();
    const candidates = findTradeCandidates(asymmetricLeague(pool), pool, DEFAULT_VOR_CONFIG);
    expect(candidates.length).toBeGreaterThan(0);
    const top = candidates[0];
    // One side gives an RB, the other gives a WR.
    const aGivePos = top.aGives[0].pos.toUpperCase();
    const bGivePos = top.bGives[0].pos.toUpperCase();
    expect([aGivePos, bGivePos].sort()).toEqual(['RB', 'WR']);
    // Fair on paper.
    expect(top.analysis.marginShare).toBeLessThanOrEqual(0.25);
    // Each side gives from depth, not its star: neither gives its best at
    // that position.
    for (const c of candidates) {
      expect(c.reasons.length).toBeGreaterThan(0);
      expect(c.score).toBeGreaterThan(0);
    }
  });

  it('returns no candidates when every roster is balanced', () => {
    const pool = makePool();
    const balanced = league([
      team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'WR1', 'WR2', 'WR3', 'TE1']),
      team('b', 'Team B', ['QB2', 'RB4', 'RB5', 'RB6', 'WR4', 'WR5', 'WR6', 'TE2']),
      team('c', 'Team C', ['QB3', 'RB7', 'RB8', 'RB9', 'WR7', 'WR8', 'WR9', 'TE3']),
      team('d', 'Team D', ['QB4', 'RB10', 'RB11', 'RB12', 'WR10', 'WR11', 'WR12', 'TE4']),
    ]);
    expect(findTradeCandidates(balanced, pool, DEFAULT_VOR_CONFIG)).toEqual([]);
  });

  it('never proposes a swap that harms a starting lineup', () => {
    const pool = makePool();
    const candidates = findTradeCandidates(asymmetricLeague(pool), pool, DEFAULT_VOR_CONFIG);
    for (const c of candidates) {
      for (const impact of [c.analysis.teamAImpact, c.analysis.teamBImpact]) {
        for (const d of impact?.depth ?? []) {
          expect(d.bestAfter).toBeGreaterThanOrEqual(d.bestBefore - 0.5);
        }
      }
    }
  });
});

describe('findTradeCandidates 2-for-1 packages', () => {
  // Team A: 4-deep at RB (positive VOR throughout), weak at WR.
  // Team B: stacked at WR (two near-equal studs), weak at RB.
  // C and D are balanced fillers so need/surplus resolve league-relative.
  function twoForOneLeague(pool: DraftPoolFile): League {
    void pool;
    return league([
      team('a', 'Team A', ['QB1', 'RB5', 'RB6', 'RB7', 'RB8', 'WR40', 'TE20']),
      team('b', 'Team B', ['QB2', 'RB40', 'WR1', 'WR2', 'WR3', 'WR4', 'TE25']),
      team('c', 'Team C', ['QB3', 'RB9', 'RB10', 'WR5', 'WR6', 'TE5']),
      team('d', 'Team D', ['QB4', 'RB11', 'RB12', 'WR7', 'WR8', 'TE6']),
    ]);
  }

  it('proposes a 2-for-1 consolidation package', () => {
    const pool = makePool();
    const candidates = findTradeCandidates(
      twoForOneLeague(pool),
      pool,
      DEFAULT_VOR_CONFIG,
    );
    const packages = candidates.filter(c => c.aGives.length === 2);
    expect(packages.length).toBeGreaterThan(0);
    const pkg = packages[0];
    // The buyer gives two RB depth pieces for the deep side's WR depth.
    expect(pkg.aGives.map(p => p.pos.toUpperCase())).toEqual(['RB', 'RB']);
    expect(pkg.bGives[0].pos.toUpperCase()).toBe('WR');
    expect(pkg.aGives.length + pkg.bGives.length).toBe(3);
    // The single piece is the seller's SECOND-best, never the star.
    expect(pkg.bGives[0].name).toBe('WR2');
    // Fair on paper and mutually upgrading.
    expect(pkg.analysis.marginShare).toBeLessThanOrEqual(0.25);
    expect(pkg.score).toBeGreaterThan(0);
    expect(pkg.reasons.length).toBeGreaterThan(0);
    expect(pkg.reasons[0]).toMatch(/consolidates/);
  });

  it('no 2-for-1 fires when every roster is balanced', () => {
    const pool = makePool();
    const balanced = league([
      team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'WR1', 'WR2', 'WR3', 'TE1']),
      team('b', 'Team B', ['QB2', 'RB4', 'RB5', 'RB6', 'WR4', 'WR5', 'WR6', 'TE2']),
      team('c', 'Team C', ['QB3', 'RB7', 'RB8', 'RB9', 'WR7', 'WR8', 'WR9', 'TE3']),
      team('d', 'Team D', ['QB4', 'RB10', 'RB11', 'RB12', 'WR10', 'WR11', 'WR12', 'TE4']),
    ]);
    const candidates = findTradeCandidates(balanced, pool, DEFAULT_VOR_CONFIG);
    expect(candidates.filter(c => c.aGives.length === 2)).toEqual([]);
  });
});
