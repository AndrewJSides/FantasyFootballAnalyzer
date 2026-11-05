import { describe, it, expect } from 'vitest';
import {
  opportunityTargets,
  RECENT_MIN_GAMES,
  SNAP_SHARE_FLAG,
  TARGET_SHARE_FLAG,
  MAX_OPPORTUNITIES,
  type OpportunityWatchInput,
} from './opportunityWatch';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import type { PoolPlayer } from '@/types/draft';

function player(
  id: string,
  name: string,
  pos: string,
  team: string,
  sleeperId?: string,
): PoolPlayer {
  return { id, name, pos, team, sleeperId } as PoolPlayer;
}

function line(
  offSnaps: number,
  teamSnaps: number,
  targets = 0,
  rushAtt = 0,
  receptions = 0,
): WeeklyUsageLine {
  return { offSnaps, teamSnaps, targets, rushAtt, receptions, rzOpps: 0, airYards: 0, deepRec: 0, longRec: 0, yac: 0, recYards: 0, rushYards: 0 };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
  teamByPoolId?: Map<string, string>,
): OpportunityWatchInput {
  return { poolPlayers, usageBySleeperId, teamByPoolId, currentWeek: 8 };
}

const A = player('a', 'Alpha WR', 'WR', 'DET', 's1');
const B = player('b', 'Beta RB', 'RB', 'DET', 's2');
const C = player('c', 'Gamma TE', 'TE', 'KC', 's3');
const K = player('k', 'Kicker K', 'K', 'DET', 's4');

describe('opportunityTargets', () => {
  it('flags a 55%+ snap-share player with the reason naming the number', () => {
    const usage = {
      s1: { 5: line(50, 70), 6: line(55, 70), 7: line(60, 70) },
    };
    const [c] = opportunityTargets(input([A], usage));
    expect(c.player.id).toBe('a');
    expect(c.snapShare).toBeCloseTo(0.79, 1);
    expect(c.games).toBe(3);
    expect(c.reasons[0]).toContain('79%');
    expect(c.rosteredBy).toBeNull();
  });

  it('flags a 20%+ target-share pass-catcher even under the snap bar', () => {
    // Team DET targets: s1 gets 30 of 100 over the window → 30%.
    const usage = {
      s1: { 5: line(20, 70, 10), 6: line(22, 70, 12), 7: line(18, 70, 8) },
      s2: { 5: line(40, 70, 4), 6: line(42, 70, 5), 7: line(38, 70, 3) },
      s9: { 5: line(70, 70, 25), 6: line(70, 70, 28), 7: line(70, 70, 25) },
    };
    const mate = player('z', 'Zed WR', 'WR', 'DET', 's9');
    const out = opportunityTargets(input([A, B, mate], usage));
    const c = out.find(x => x.player.id === 'a');
    expect(c).toBeDefined();
    expect(c!.targetShare).toBeCloseTo(0.25, 1);
    expect(c!.reasons.some(r => r.includes("DET's targets"))).toBe(true);
  });

  it('excludes rostered players in league mode', () => {
    const usage = {
      s1: { 5: line(60, 70), 6: line(60, 70), 7: line(60, 70) },
    };
    const out = opportunityTargets(
      input([A], usage, new Map([['a', 'Delta']])), // rostered
    );
    expect(out).toHaveLength(0);
  });

  it('requires 2+ recent games and skips non-skill positions', () => {
    const usage = {
      s1: { 7: line(65, 70) }, // one game only
      s4: { 5: line(10, 70), 6: line(10, 70), 7: line(10, 70) }, // a kicker
    };
    expect(opportunityTargets(input([A, K], usage))).toHaveLength(0);
    expect(RECENT_MIN_GAMES).toBe(2);
  });

  it('ranks by snap share and caps the list', () => {
    const pool: PoolPlayer[] = [];
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    for (let i = 0; i < 12; i++) {
      const p = player(`p${i}`, `Player ${i}`, 'WR', 'DET', `x${i}`);
      pool.push(p);
      usage[`x${i}`] = {
        5: line(40 + i, 70),
        6: line(40 + i, 70),
        7: line(40 + i, 70),
      };
    }
    const out = opportunityTargets(input(pool, usage));
    expect(out).toHaveLength(MAX_OPPORTUNITIES);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].snapShare).toBeGreaterThanOrEqual(out[i].snapShare);
    }
  });

  it('prices touches per game and leaves QBs target-share-free', () => {
    const qb = player('q', 'Qb Q', 'QB', 'DET', 's5');
    const usage = {
      s5: { 5: line(70, 70, 0, 5, 0), 6: line(70, 70, 0, 6, 0), 7: line(70, 70, 0, 4, 0) },
      s3: { 5: line(45, 70, 6, 0, 5), 6: line(45, 70, 7, 0, 6), 7: line(45, 70, 5, 0, 4) },
    };
    const [first, second] = opportunityTargets(input([qb, C], usage));
    expect(first.player.id).toBe('q');
    expect(first.targetShare).toBeNull();
    expect(first.touchesPerGame).toBe(5);
    expect(second.targetShare).not.toBeNull();
    expect(SNAP_SHARE_FLAG).toBe(0.55);
    expect(TARGET_SHARE_FLAG).toBe(0.2);
  });
});
