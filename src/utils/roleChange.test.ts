// Backup-out role-change detector tests (backlog item 137).
import { describe, it, expect } from 'vitest';
import { soleBackMap } from './roleChange';
import type { WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

const SEASON = 2026;

function player(over: Partial<PoolPlayer>): PoolPlayer {
  return {
    id: 'x',
    name: 'Test Player',
    team: 'TEN',
    pos: 'RB',
    posRank: 1,
    overallRank: 100,
    tier: 1,
    bye: null,
    baseValue: null,
    ...over,
  } as PoolPlayer;
}

function weekly(
  points: Record<string, Record<number, number>>,
  usage: Record<string, Record<number, number>>,
  games: Record<string, number[]>,
): WeeklyPprPoints {
  return {
    season: SEASON,
    weeks: [1, 2, 3, 4],
    pointsBySleeperId: points,
    gamesBySleeperId: games,
    tdPtsBySleeperId: {},
    usageBySleeperId: usage,
  } as WeeklyPprPoints;
}

// Lead back: 48 pts on 60 opps over weeks 1–4 = 0.8 pts per opportunity.
const LEAD_POINTS = { 's-lead': { 1: 8, 2: 16, 3: 8, 4: 16 } };
const LEAD_USAGE = { 's-lead': { 1: 10, 2: 20, 3: 10, 4: 20 } };
const LEAD_GAMES = { 's-lead': [1, 2, 3, 4] };

function poolWithMate(mateOver: Partial<PoolPlayer>): DraftPoolFile {
  return {
    players: [
      player({ id: 'lead', name: 'Lead Back', sleeperId: 's-lead' }),
      player({ id: 'mate', name: 'Backup Mate', sleeperId: 's-mate', ...mateOver }),
    ],
    season: SEASON,
  } as DraftPoolFile;
}

describe('soleBackMap', () => {
  it('flags the lead back when a rotation mate is ruled out, pricing recent usage at his own pts/opp', () => {
    const pool = poolWithMate({ injuryStatus: 'Out' });
    const wk = weekly(
      { ...LEAD_POINTS, 's-mate': { 1: 5, 2: 5, 3: 5, 4: 5 } },
      { ...LEAD_USAGE, 's-mate': { 1: 10, 2: 12, 3: 14, 4: 12 } },
      { ...LEAD_GAMES, 's-mate': [1, 2, 3, 4] },
    );
    const map = soleBackMap(pool, wk, 5);
    // Mate's last-3 usage avg = (12 + 14 + 12) / 3 = 12.67 × 0.8 = 10.1,
    // capped at 10.
    expect(map.get('lead')).toEqual({ mates: ['Backup Mate'], upside: 10 });
  });

  it('does not cap a small vacancy', () => {
    const pool = poolWithMate({ injuryStatus: 'Out' });
    const wk = weekly(
      { ...LEAD_POINTS, 's-mate': { 1: 5, 2: 5, 3: 5, 4: 5 } },
      { ...LEAD_USAGE, 's-mate': { 1: 6, 2: 6, 3: 6, 4: 6 } },
      { ...LEAD_GAMES, 's-mate': [1, 2, 3, 4] },
    );
    const map = soleBackMap(pool, wk, 5);
    // 6.0 recent usage × 0.8 = 4.8, under the cap.
    expect(map.get('lead')).toEqual({ mates: ['Backup Mate'], upside: 4.8 });
  });

  it('ignores a Questionable mate — not ruled out', () => {
    const pool = poolWithMate({ injuryStatus: 'Questionable' });
    const wk = weekly(
      { ...LEAD_POINTS, 's-mate': { 1: 5, 2: 5, 3: 5, 4: 5 } },
      { ...LEAD_USAGE, 's-mate': { 1: 10, 2: 12, 3: 14, 4: 12 } },
      { ...LEAD_GAMES, 's-mate': [1, 2, 3, 4] },
    );
    expect(soleBackMap(pool, wk, 5).size).toBe(0);
  });

  it('flags a season-ending IR mate', () => {
    const pool = poolWithMate({
      injuryStatus: 'IR',
      injuryBodyPart: 'Knee - ACL',
      injuryNotes: 'Surgery',
    });
    const wk = weekly(
      { ...LEAD_POINTS, 's-mate': { 1: 5, 2: 5, 3: 5, 4: 5 } },
      { ...LEAD_USAGE, 's-mate': { 1: 6, 2: 6, 3: 6, 4: 6 } },
      { ...LEAD_GAMES, 's-mate': [1, 2, 3, 4] },
    );
    expect(soleBackMap(pool, wk, 5).get('lead')).toEqual({
      mates: ['Backup Mate'],
      upside: 4.8,
    });
  });

  it('ignores a mate below the rotation floor', () => {
    const pool = poolWithMate({ injuryStatus: 'Out' });
    const wk = weekly(
      { ...LEAD_POINTS, 's-mate': { 1: 2, 2: 2, 3: 2, 4: 2 } },
      { ...LEAD_USAGE, 's-mate': { 1: 4, 2: 4, 3: 4, 4: 4 } },
      { ...LEAD_GAMES, 's-mate': [1, 2, 3, 4] },
    );
    expect(soleBackMap(pool, wk, 5).size).toBe(0);
  });

  it('ignores a ruled-out mate on another team', () => {
    const pool = poolWithMate({ injuryStatus: 'Out', team: 'CHI' });
    const wk = weekly(
      { ...LEAD_POINTS, 's-mate': { 1: 5, 2: 5, 3: 5, 4: 5 } },
      { ...LEAD_USAGE, 's-mate': { 1: 10, 2: 12, 3: 14, 4: 12 } },
      { ...LEAD_GAMES, 's-mate': [1, 2, 3, 4] },
    );
    expect(soleBackMap(pool, wk, 5).size).toBe(0);
  });

  it('sums two ruled-out mates and caps the total', () => {
    const pool = {
      players: [
        player({ id: 'lead', name: 'Lead Back', sleeperId: 's-lead' }),
        player({ id: 'm1', name: 'Mate One', sleeperId: 's-m1', injuryStatus: 'Out' }),
        player({ id: 'm2', name: 'Mate Two', sleeperId: 's-m2', injuryStatus: 'IR' }),
      ],
      season: SEASON,
    } as DraftPoolFile;
    const wk = weekly(
      { ...LEAD_POINTS },
      {
        ...LEAD_USAGE,
        's-m1': { 1: 10, 2: 10, 3: 10, 4: 10 },
        's-m2': { 1: 10, 2: 10, 3: 10, 4: 10 },
      },
      { ...LEAD_GAMES, 's-m1': [1, 2, 3, 4], 's-m2': [1, 2, 3, 4] },
    );
    // (10 + 10) × 0.8 = 16, capped at 10.
    expect(soleBackMap(pool, wk, 5).get('lead')).toEqual({
      mates: ['Mate One', 'Mate Two'],
      upside: 10,
    });
  });

  it('gives no tag when the lead back has no usage history', () => {
    const pool = poolWithMate({ injuryStatus: 'Out' });
    const wk = weekly(
      { 's-mate': { 1: 5, 2: 5, 3: 5, 4: 5 } },
      { 's-mate': { 1: 10, 2: 12, 3: 14, 4: 12 } },
      { 's-mate': [1, 2, 3, 4] },
    );
    expect(soleBackMap(pool, wk, 5).size).toBe(0);
  });

  it('returns empty without weekly data', () => {
    const pool = poolWithMate({ injuryStatus: 'Out' });
    expect(soleBackMap(pool, undefined, 5).size).toBe(0);
  });
});
