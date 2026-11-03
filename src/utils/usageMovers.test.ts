// Usage Risers: snap-share jumps vs the player's own earlier baseline.
import { describe, it, expect } from 'vitest';
import {
  usageRisers,
  SNAP_SHARE_JUMP,
  MAX_RISERS,
  type UsageRisersInput,
} from './usageMovers';
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

function line(offSnaps: number, teamSnaps: number): WeeklyUsageLine {
  return { offSnaps, teamSnaps, targets: 0, rushAtt: 0, receptions: 0 };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
  teamByPoolId?: Map<string, string>,
): UsageRisersInput {
  return { poolPlayers, usageBySleeperId, teamByPoolId, currentWeek: 9 };
}

// Recent window at week 9 = weeks 6-8; earlier window = weeks 1-5.
const riserUsage = {
  1: line(20, 70),
  2: line(25, 70),
  3: line(20, 70),
  6: line(55, 70),
  7: line(60, 70),
  8: line(58, 70),
};

describe('usageRisers', () => {
  it('flags a 15+ point snap-share jump with both ends in the reason', () => {
    const p = player('a', 'Alpha WR', 'WR', 'DET', 's1');
    const [r] = usageRisers(input([p], { s1: riserUsage }));
    expect(r).toBeDefined();
    expect(r.recentSnapShare).toBeCloseTo(0.82, 2);
    expect(r.earlierSnapShare).toBeCloseTo(0.31, 2);
    expect(r.delta).toBeGreaterThanOrEqual(SNAP_SHARE_JUMP);
    expect(r.reason).toContain('31%');
    expect(r.reason).toContain('82%');
  });

  it('skips a jump that never reaches a real role now', () => {
    const p = player('b', 'Beta RB', 'RB', 'DET', 's2');
    const usage = {
      1: line(2, 70),
      2: line(3, 70),
      6: line(25, 70),
      7: line(27, 70),
    };
    expect(usageRisers(input([p], { s2: usage }))).toEqual([]);
  });

  it('skips a small gain even at a high level', () => {
    const p = player('c', 'Gamma WR', 'WR', 'KC', 's3');
    const usage = {
      1: line(55, 70),
      2: line(58, 70),
      6: line(60, 70),
      7: line(62, 70),
    };
    expect(usageRisers(input([p], { s3: usage }))).toEqual([]);
  });

  it('skips QBs — their snap share carries no jump signal', () => {
    const p = player('q', 'Quarter Back', 'QB', 'DET', 's4');
    const usage = {
      1: line(10, 70),
      2: line(12, 70),
      6: line(70, 70),
      7: line(70, 70),
    };
    expect(usageRisers(input([p], { s4: usage }))).toEqual([]);
  });

  it('requires 2+ games in each window', () => {
    const p = player('d', 'Delta TE', 'TE', 'DET', 's5');
    const thinRecent = {
      1: line(20, 70),
      2: line(20, 70),
      8: line(65, 70),
    };
    expect(usageRisers(input([p], { s5: thinRecent }))).toEqual([]);
    const thinEarlier = {
      1: line(20, 70),
      6: line(60, 70),
      7: line(62, 70),
    };
    expect(usageRisers(input([p], { s5: thinEarlier }))).toEqual([]);
  });

  it('excludes rostered players in league mode and ranks by delta', () => {
    const a = player('a', 'Alpha WR', 'WR', 'DET', 's1');
    const b = player('b', 'Beta RB', 'RB', 'DET', 's2');
    const usageB = {
      1: line(10, 70),
      2: line(12, 70),
      6: line(65, 70),
      7: line(68, 70),
    };
    const teamByPoolId = new Map([['a', 'Rivals']]);
    const out = usageRisers(
      input([a, b], { s1: riserUsage, s2: usageB }, teamByPoolId),
    );
    expect(out.map(r => r.player.id)).toEqual(['b']);
    expect(out[0].rosteredBy).toBeNull();
  });

  it('caps at MAX_RISERS, biggest jump first', () => {
    const players: PoolPlayer[] = [];
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    for (let i = 0; i < MAX_RISERS + 3; i++) {
      const id = `p${i}`;
      players.push(player(id, `Player ${i}`, 'WR', 'DET', `s${i}`));
      usage[`s${i}`] = {
        1: line(10, 70),
        2: line(10, 70),
        6: line(45 + i, 70),
        7: line(45 + i, 70),
      };
    }
    const out = usageRisers(input(players, usage));
    expect(out).toHaveLength(MAX_RISERS);
    expect(out[0].delta).toBeGreaterThanOrEqual(out[out.length - 1].delta);
  });
});
