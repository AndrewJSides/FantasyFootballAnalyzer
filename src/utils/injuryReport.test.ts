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

describe('next man up across positions', () => {
  function squad(
    id: string,
    name: string,
    pos: 'QB' | 'RB' | 'WR' | 'TE',
    depth: number | undefined,
    posRank: number,
    overallRank: number,
    injuryStatus?: string
  ): PoolPlayer {
    return {
      id,
      name,
      team: 'KC',
      pos,
      posRank,
      overallRank,
      ...(depth !== undefined ? { depthChartOrder: depth } : {}),
      tier: 1,
      bye: 7,
      baseValue: null,
      projPtsPpr: 100,
      ...(injuryStatus ? { injuryStatus, injuryBodyPart: 'Knee' } : {}),
    } as PoolPlayer;
  }
  const squadPool: DraftPoolFile = {
    season: 2026,
    generatedAt: 'test',
    baseline: { budget: 200, teams: 10, rounds: 15 },
    players: [
      squad('qb1', 'Hurt QB1', 'QB', 1, 1, 25, 'Out'),
      squad('qb2', 'Backup QB', 'QB', 2, 2, 180),
      squad('wr1', 'Hurt WR1', 'WR', 1, 1, 12, 'Questionable'),
      squad('wr2', 'Next WR', 'WR', 2, 2, 90),
      // No depth-chart data: posRank decides.
      squad('te1', 'Hurt TE1', 'TE', undefined, 1, 40, 'Doubtful'),
      squad('te2', 'Backup TE', 'TE', undefined, 2, 150),
      // Hurt non-leader: no next man up named.
      squad('wr3', 'Hurt WR3', 'WR', 3, 3, 120, 'Out'),
      // Lone TE on another team: no pair at all.
      { ...squad('te9', 'Lone TE', 'TE', 1, 1, 60, 'Out'), team: 'FA' } as PoolPlayer,
    ],
  };

  it('names the backup QB for a hurt QB1', () => {
    const rows = buildInjuryReport({ pool: squadPool });
    expect(rows.find(r => r.player.id === 'qb1')!.replacement?.name).toBe('Backup QB');
  });

  it('names the WR2 for a hurt WR1', () => {
    const rows = buildInjuryReport({ pool: squadPool });
    expect(rows.find(r => r.player.id === 'wr1')!.replacement?.name).toBe('Next WR');
  });

  it('falls back to positional rank without depth-chart data', () => {
    const rows = buildInjuryReport({ pool: squadPool });
    expect(rows.find(r => r.player.id === 'te1')!.replacement?.name).toBe('Backup TE');
  });

  it('shows no next man up for a hurt non-leader or a lone starter', () => {
    const rows = buildInjuryReport({ pool: squadPool });
    expect(rows.find(r => r.player.id === 'wr3')!.replacement).toBeNull();
    expect(rows.find(r => r.player.id === 'te9')!.replacement).toBeNull();
  });

  it('resolves the replacement owner, null for free agents and guest mode', () => {
    const owners = new Map([
      ['qb1', 'Team A'],
      ['qb2', 'Team B'],
    ]);
    const rows = buildInjuryReport({ pool: squadPool, ownerByPoolId: owners });
    expect(rows.find(r => r.player.id === 'qb1')!.replacementOwner).toBe('Team B');
    expect(rows.find(r => r.player.id === 'wr1')!.replacementOwner).toBeNull();
    const guest = buildInjuryReport({ pool: squadPool });
    expect(guest.find(r => r.player.id === 'qb1')!.replacementOwner).toBeNull();
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
