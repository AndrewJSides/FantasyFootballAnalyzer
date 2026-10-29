// RB Handcuff Report engine: lead/backups per NFL team, ownership status,
// and graceful no-roster handling.
import { describe, it, expect } from 'vitest';
import { buildHandcuffReport, leadAndHandcuff } from './handcuffReport';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

function rb(
  id: string,
  name: string,
  team: string,
  posRank: number,
  overallRank: number,
  depthChartOrder?: number
): PoolPlayer {
  return {
    id,
    name,
    team,
    pos: 'RB',
    posRank,
    overallRank,
    tier: 1,
    bye: 7,
    baseValue: null,
    projPtsPpr: 100,
    ...(depthChartOrder !== undefined ? { depthChartOrder } : {}),
  } as PoolPlayer;
}

function poolOf(players: PoolPlayer[]): DraftPoolFile {
  return {
    season: 2026,
    generatedAt: 'test',
    baseline: { budget: 200, teams: 10, rounds: 15 },
    players,
  };
}

describe('leadAndHandcuff', () => {
  it('prefers depth-chart order over positional rank', () => {
    const players = [
      rb('a', 'Lead Back', 'DAL', 1, 10, 1),
      rb('b', 'Backup', 'DAL', 2, 40, 2),
      rb('c', 'Third', 'DAL', 3, 80, 3),
    ];
    const pair = leadAndHandcuff(players);
    expect(pair?.lead.id).toBe('a');
    expect(pair?.handcuff.id).toBe('b');
  });

  it('falls back to positional rank when depth-chart order is absent', () => {
    const players = [
      rb('a', 'Lead Back', 'DAL', 1, 10),
      rb('b', 'Backup', 'DAL', 2, 40),
    ];
    const pair = leadAndHandcuff(players);
    expect(pair?.lead.id).toBe('a');
    expect(pair?.handcuff.id).toBe('b');
  });

  it('skips non-RBs when picking the pair', () => {
    const players = [
      rb('a', 'Lead Back', 'DAL', 1, 10, 1),
      { ...rb('w', 'Wideout', 'DAL', 1, 5, 1), pos: 'WR' },
      rb('b', 'Backup', 'DAL', 2, 40, 2),
    ];
    const pair = leadAndHandcuff(players);
    expect(pair?.handcuff.id).toBe('b');
  });

  it('returns null when the team has fewer than two RBs', () => {
    expect(leadAndHandcuff([rb('a', 'Lead Back', 'DAL', 1, 10, 1)])).toBeNull();
    expect(leadAndHandcuff([])).toBeNull();
  });
});

describe('buildHandcuffReport', () => {
  const players = [
    rb('dal1', 'Dal Lead', 'DAL', 1, 5, 1),
    rb('dal2', 'Dal Cuff', 'DAL', 2, 45, 2),
    rb('gb1', 'Gb Lead', 'GB', 1, 12, 1),
    rb('gb2', 'Gb Cuff', 'GB', 2, 60, 2),
    rb('sea1', 'Sea Lead', 'SEA', 1, 20, 1),
    rb('sea2', 'Sea Cuff', 'SEA', 2, 70, 2),
  ];

  it('marks a handcuff on no roster as available', () => {
    const owners = new Map([['dal1', 'Team A']]);
    const rows = buildHandcuffReport({ pool: poolOf(players), ownerByPoolId: owners });
    const dal = rows.find(r => r.nflTeam === 'DAL');
    expect(dal?.status).toBe('available');
    expect(dal?.leadOwner).toBe('Team A');
    expect(dal?.handcuffOwner).toBeNull();
  });

  it('marks a handcuff owned by the lead back\u2019s team as secured', () => {
    const owners = new Map([
      ['gb1', 'Team B'],
      ['gb2', 'Team B'],
    ]);
    const rows = buildHandcuffReport({ pool: poolOf(players), ownerByPoolId: owners });
    expect(rows.find(r => r.nflTeam === 'GB')?.status).toBe('secured');
  });

  it('marks a handcuff owned by another team as rival-held', () => {
    const owners = new Map([
      ['sea1', 'Team A'],
      ['sea2', 'Team C'],
    ]);
    const rows = buildHandcuffReport({ pool: poolOf(players), ownerByPoolId: owners });
    expect(rows.find(r => r.nflTeam === 'SEA')?.status).toBe('rival-held');
  });

  it('reports unknown ownership when no rosters exist (guest mode)', () => {
    const rows = buildHandcuffReport({ pool: poolOf(players) });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.status).toBe('unknown');
      expect(row.leadOwner).toBeNull();
      expect(row.handcuffOwner).toBeNull();
    }
  });

  it('skips FA players and teams without a pair, and sorts by lead rank', () => {
    const extra = [
      ...players,
      { ...rb('x1', 'Free Agent', 'FA', 1, 3, 1), team: 'FA' },
      { ...rb('x2', 'Free Cuff', 'FA', 2, 50, 2), team: 'FA' },
      rb('solo1', 'Solo Back', 'NYG', 1, 25, 1),
    ];
    const rows = buildHandcuffReport({ pool: poolOf(extra) });
    expect(rows.map(r => r.nflTeam)).toEqual(['DAL', 'GB', 'SEA']);
  });
});
