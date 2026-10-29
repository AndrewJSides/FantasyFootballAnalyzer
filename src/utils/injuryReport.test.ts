// League Injury Report util: severity tiers from Sleeper's injuryOf
// classifier, season-ending first, then by overall rank; startable
// positions only; owner resolution passthrough.
import { describe, it, expect } from 'vitest';
import { buildInjuryReport, injuryTier } from './injuryReport';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

function player(
  id: string,
  name: string,
  pos: 'QB' | 'RB' | 'WR' | 'TE' | 'K',
  overallRank: number,
  injury?: { injuryStatus: string; injuryBodyPart?: string; injuryNotes?: string }
): PoolPlayer {
  return {
    id,
    name,
    team: 'DAL',
    pos,
    posRank: 1,
    overallRank,
    tier: 1,
    bye: 7,
    baseValue: null,
    projPtsPpr: 100,
    ...injury,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [
    player('q1', 'Q Back', 'QB', 30, { injuryStatus: 'Questionable', injuryBodyPart: 'Hamstring' }),
    player('rb1', 'Out Back', 'RB', 5, { injuryStatus: 'Out', injuryBodyPart: 'Knee' }),
    player('wr1', 'Star Wideout', 'WR', 2, { injuryStatus: 'IR', injuryBodyPart: 'Knee - ACL', injuryNotes: 'surgery' }),
    player('te1', 'Healthy Tight', 'TE', 40),
    player('k1', 'Kicker', 'K', 300, { injuryStatus: 'Out', injuryBodyPart: 'Calf' }),
    player('wr2', 'Doubtful Wideout', 'WR', 50, { injuryStatus: 'Doubtful', injuryBodyPart: 'Ankle' }),
  ],
};

describe('injuryTier', () => {
  it('flags ACL-on-IR as season-ending', () => {
    expect(injuryTier(pool.players[2])).toBe('season-ending');
  });

  it('flags Out as out', () => {
    expect(injuryTier(pool.players[1])).toBe('out');
  });

  it('keeps Doubtful and Questionable as their own tiers', () => {
    expect(injuryTier(pool.players[5])).toBe('doubtful');
    expect(injuryTier(pool.players[0])).toBe('questionable');
  });
});

describe('buildInjuryReport', () => {
  it('lists injured skill players worst-first, by rank inside each tier', () => {
    const rows = buildInjuryReport({ pool });
    expect(rows.map(r => r.player.name)).toEqual([
      'Star Wideout', // season-ending
      'Out Back', // out
      'Doubtful Wideout', // doubtful
      'Q Back', // questionable
    ]);
  });

  it('skips healthy players and non-skill positions', () => {
    const rows = buildInjuryReport({ pool });
    expect(rows.some(r => r.player.name === 'Healthy Tight')).toBe(false);
    expect(rows.some(r => r.player.name === 'Kicker')).toBe(false);
  });

  it('resolves owners and builds the detail string', () => {
    const rows = buildInjuryReport({ pool, ownerByPoolId: new Map([['rb1', 'Team A']]) });
    const out = rows.find(r => r.player.id === 'rb1')!;
    expect(out.owner).toBe('Team A');
    expect(out.detail).toBe('Knee');
    expect(rows.find(r => r.player.id === 'wr1')!.detail).toBe('Knee - ACL (surgery)');
    expect(rows.find(r => r.player.id === 'wr1')!.tierLabel).toBe('Season-ending');
  });
});

describe('replacement handcuff', () => {
  function back(
    id: string,
    name: string,
    depth: number,
    overallRank: number,
    injuryStatus?: string
  ): PoolPlayer {
    return {
      id,
      name,
      team: 'DAL',
      pos: 'RB',
      posRank: depth,
      overallRank,
      depthChartOrder: depth,
      tier: 1,
      bye: 7,
      baseValue: null,
      projPtsPpr: 100,
      ...(injuryStatus ? { injuryStatus, injuryBodyPart: 'Knee' } : {}),
    } as PoolPlayer;
  }
  const backfield: DraftPoolFile = {
    season: 2026,
    generatedAt: 'test',
    baseline: { budget: 200, teams: 10, rounds: 15 },
    players: [
      back('lead1', 'Lead Back', 1, 8, 'Out'),
      back('cuff1', 'Backup Back', 2, 95),
      back('third1', 'Third String', 3, 150, 'Out'),
      player('qb2', 'Hurt QB', 'QB', 40, { injuryStatus: 'Questionable', injuryBodyPart: 'Shoulder' }),
    ],
  };

  it('names the depth-chart backup when the lead back is hurt', () => {
    const rows = buildInjuryReport({ pool: backfield });
    const lead = rows.find(r => r.player.id === 'lead1')!;
    expect(lead.replacement?.name).toBe('Backup Back');
  });

  it('shows no replacement for a hurt backup or third-string back', () => {
    const rows = buildInjuryReport({ pool: backfield });
    expect(rows.find(r => r.player.id === 'third1')!.replacement).toBeNull();
  });

  it('shows no replacement for non-RB injuries', () => {
    const rows = buildInjuryReport({ pool: backfield });
    expect(rows.find(r => r.player.id === 'qb2')!.replacement).toBeNull();
  });

  it('still names the depth-chart backup even when the backup is also hurt', () => {
    const bothHurt: DraftPoolFile = {
      ...backfield,
      players: [
        back('lead1', 'Lead Back', 1, 8, 'Out'),
        back('cuff1', 'Backup Back', 2, 95, 'Questionable'),
        back('third1', 'Third String', 3, 150),
      ],
    };
    const rows = buildInjuryReport({ pool: bothHurt });
    expect(rows.find(r => r.player.id === 'lead1')!.replacement?.name).toBe('Backup Back');
  });
});
