// Waiver Stash Report engine: available players with a cheap-now reason
// (handcuff, injury return, bye discount), ranked by ROS value.
import { describe, expect, it } from 'vitest';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { buildStashReport, STASH_REASONS } from './stashReport';

function poolPlayer(over: Partial<PoolPlayer>): PoolPlayer {
  return {
    id: 'p1',
    name: 'Test Player',
    team: 'KC',
    pos: 'RB',
    posRank: 1,
    overallRank: 1,
    tier: 1,
    bye: 8,
    baseValue: null,
    ...over,
  };
}

const POOL: DraftPoolFile = {
  season: 2026,
  generatedAt: '2026-10-29',
  baseline: { budget: 200, teams: 10, rounds: 16 },
  players: [
    // Lead + handcuff pair on DAL; the cuff is the insurance stash.
    poolPlayer({ id: 'rb1', name: 'Lead Back', pos: 'RB', overallRank: 10, projPtsPpr: 240, team: 'DAL', depthChartOrder: 1 }),
    poolPlayer({ id: 'rb2', name: 'Backup', pos: 'RB', overallRank: 40, projPtsPpr: 130, team: 'DAL', depthChartOrder: 2 }),
    // Questionable WR with a strong season projection: injury-return stash.
    poolPlayer({ id: 'wr1', name: 'Hurt Wideout', pos: 'WR', overallRank: 15, projPtsPpr: 250,
      injuryStatus: 'Questionable', injuryBodyPart: 'Hamstring', bye: 10 }),
    // On bye in the current week (9), strong ROS: bye-discount stash.
    poolPlayer({ id: 'wr2', name: 'Bye Wideout', pos: 'WR', overallRank: 18, projPtsPpr: 230, bye: 9 }),
    // Plain available starter: high ROS but no cheap-now reason — not a stash.
    poolPlayer({ id: 'wr3', name: 'Plain Wideout', pos: 'WR', overallRank: 20, projPtsPpr: 220, bye: 10 }),
    // Rostered cuff of another team: never a stash.
    poolPlayer({ id: 'rb3', name: 'Held Cuff', pos: 'RB', overallRank: 45, projPtsPpr: 110, team: 'BUF', depthChartOrder: 2 }),
    poolPlayer({ id: 'rb4', name: 'Buffalo Lead', pos: 'RB', overallRank: 12, projPtsPpr: 230, team: 'BUF', depthChartOrder: 1 }),
    // Season-ending injury: never a stash, even unrostered.
    poolPlayer({ id: 'rb5', name: 'Done Back', pos: 'RB', overallRank: 8, projPtsPpr: 260,
      injuryStatus: 'IR', injuryBodyPart: 'Knee', injuryNotes: 'Torn ACL (surgery)' }),
    // Kicker: not a startable stash position.
    poolPlayer({ id: 'k1', name: 'Best Kicker', pos: 'K', overallRank: 300, projPtsPpr: 120, bye: 9 }),
  ],
};

const BASE = {
  pool: POOL,
  shape: undefined,
  scoring: 'ppr' as const,
  currentWeek: 9,
};

describe('buildStashReport', () => {
  it('flags the available handcuff, the injury return, and the bye discount', () => {
    const rows = buildStashReport(BASE);
    const byId = new Map(rows.map(r => [r.player.id, r]));
    expect(byId.get('rb2')?.reasons).toEqual(['handcuff']);
    expect(byId.get('wr1')?.reasons).toEqual(['injury-return']);
    expect(byId.get('wr2')?.reasons).toEqual(['bye-discount']);
  });

  it('excludes rostered players, season-ending injuries, kickers, and plain availables', () => {
    const owners = new Map([['rb3', 'Rival Team']]);
    const rows = buildStashReport({ ...BASE, ownerByPoolId: owners });
    const ids = rows.map(r => r.player.id);
    expect(ids).not.toContain('rb3'); // rostered handcuff
    expect(ids).not.toContain('rb5'); // season-ending
    expect(ids).not.toContain('k1'); // kicker
    expect(ids).not.toContain('wr3'); // no cheap-now reason
  });

  it('ranks by ROS projected points and caps the rows', () => {
    const rows = buildStashReport({ ...BASE, maxRows: 2 });
    expect(rows).toHaveLength(2);
    expect(rows[0].outlook.projectedPoints).toBeGreaterThanOrEqual(
      rows[1].outlook.projectedPoints,
    );
  });

  it('treats guest mode (no owners) as everything-available', () => {
    const rows = buildStashReport(BASE);
    expect(rows.some(r => r.player.id === 'rb2')).toBe(true);
    expect(rows.some(r => r.player.id === 'wr1')).toBe(true);
  });

  it('attaches the ROS positional rank from the rankings engine', () => {
    const rows = buildStashReport(BASE);
    const wr1 = rows.find(r => r.player.id === 'wr1')!;
    expect(wr1.posRank).toBeGreaterThan(0);
  });

  it('exports the stable reason vocabulary', () => {
    expect(STASH_REASONS).toEqual(['handcuff', 'injury-return', 'bye-discount']);
  });
});
