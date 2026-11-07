import { describe, expect, it } from 'vitest';
import type { League, RosterSlots, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { DEFAULT_VOR_CONFIG } from './projectionValues';
import { DEFAULT_MANUAL_SHAPE, valueLeagueFor } from './tradeAnalysis';
import { shopOffers } from './shopPlayer';

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

function balancedLeague(pool: DraftPoolFile): League {
  void pool;
  return league([
    team('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'WR1', 'WR2', 'WR3', 'TE1']),
    team('b', 'Team B', ['QB2', 'RB4', 'RB5', 'RB6', 'WR4', 'WR5', 'WR6', 'TE2']),
    team('c', 'Team C', ['QB3', 'RB7', 'RB8', 'RB9', 'WR7', 'WR8', 'WR9', 'TE3']),
    team('d', 'Team D', ['QB4', 'RB10', 'RB11', 'RB12', 'WR10', 'WR11', 'WR12', 'TE4']),
  ]);
}

describe('shopOffers', () => {
  it('finds fair offers for a depth player, ranked by owner gain', () => {
    const pool = makePool();
    const lg = asymmetricLeague(pool);
    // RB2 is Team A's second-best RB — the classic depth trade piece.
    const offers = shopOffers(lg, 'RB2', pool, DEFAULT_VOR_CONFIG);
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      // The owner is always the giver of the shopped player.
      expect(o.ownerTeamId).toBe('a');
      const gives = o.teamA.id === 'a' ? o.aGives : o.bGives;
      expect(gives.some(p => p.id === 'RB2')).toBe(true);
      // Win-win is preserved: the owner's starting value never goes back.
      expect(o.ownerNetGain).toBeGreaterThanOrEqual(0);
      expect(o.reasons.length).toBeGreaterThan(0);
      // The candidate's fair-on-paper band survives the filter.
      expect(o.analysis.marginShare).toBeLessThanOrEqual(0.25);
    }
    // Sorted by owner gain first, then the finder's score.
    for (let i = 1; i < offers.length; i++) {
      expect(offers[i - 1].ownerNetGain).toBeGreaterThanOrEqual(
        offers[i].ownerNetGain,
      );
    }
    // Team B wants RBs and is deep at WR, so it should appear as a buyer.
    const partnerIds = new Set(
      offers.map(o => (o.teamA.id === 'a' ? o.teamB.id : o.teamA.id)),
    );
    expect(partnerIds.has('b')).toBe(true);
  });

  it('finds star-swap offers when shopping a positional star', () => {
    const pool = makePool();
    const lg = asymmetricLeague(pool);
    // RB1 is Team A's RB star; Team B needs an RB and is deep at WR —
    // the "my RB1 for your WR1" swap should surface.
    const offers = shopOffers(lg, 'RB1', pool, DEFAULT_VOR_CONFIG);
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o.ownerTeamId).toBe('a');
      const gives = o.teamA.id === 'a' ? o.aGives : o.bGives;
      expect(gives.some(p => p.id === 'RB1')).toBe(true);
      expect(o.ownerNetGain).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns an empty list for an unknown or blank player id', () => {
    const pool = makePool();
    const lg = asymmetricLeague(pool);
    expect(shopOffers(lg, 'NOPE99', pool, DEFAULT_VOR_CONFIG)).toEqual([]);
    expect(shopOffers(lg, '', pool, DEFAULT_VOR_CONFIG)).toEqual([]);
  });

  it('returns an empty list when no fair deal exists for the player', () => {
    const pool = makePool();
    const lg = balancedLeague(pool);
    expect(shopOffers(lg, 'RB1', pool, DEFAULT_VOR_CONFIG)).toEqual([]);
  });

  it('attributes ownership to the correct team', () => {
    const pool = makePool();
    const lg = asymmetricLeague(pool);
    // WR1 belongs to Team B, which needs RBs.
    const offers = shopOffers(lg, 'WR1', pool, DEFAULT_VOR_CONFIG);
    for (const o of offers) {
      expect(o.ownerTeamId).toBe('b');
      const gives = o.teamA.id === 'b' ? o.aGives : o.bGives;
      expect(gives.some(p => p.id === 'WR1')).toBe(true);
    }
  });
});

describe('shopOffers dynasty mode (backlog item 193)', () => {
  it('prices offers on dynasty value in dynasty mode', () => {
    const pool = makePool();
    const lg = asymmetricLeague(pool);
    const offers = shopOffers(
      lg,
      'RB2',
      pool,
      DEFAULT_VOR_CONFIG,
      valueLeagueFor(lg),
      { valueMode: 'dynasty' },
    );
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o.analysis.valueMode).toBe('dynasty');
      expect(o.reasons.some(r => r.includes('dynasty pts'))).toBe(true);
      expect(o.ownerTeamId).toBe('a');
    }
  });
});
