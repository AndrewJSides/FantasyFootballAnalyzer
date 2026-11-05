// Snap Count Leaders board (backlog item 159): per-position
// snap-share leaders over the last 3 completed weeks, priced on
// Sleeper's free public weekly stats (off_snp / tm_off_snp, via the
// shared weekly-usage fetch).

import { describe, it, expect } from 'vitest';
import {
  buildSnapCountLeaders,
  type SnapCountLeadersInput,
} from './snapCountLeaders';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import type { PoolPlayer } from '@/types/draft';

function player(id: string, name: string, pos: string, team = 'DAL'): PoolPlayer {
  return {
    id,
    name,
    team,
    pos,
    posRank: 10,
    overallRank: 50,
    tier: 2,
    bye: 7,
    baseValue: null,
    projPtsPpr: 120,
    sleeperId: id,
  } as PoolPlayer;
}

function line(offSnaps: number, teamSnaps = 70): WeeklyUsageLine {
  return {
    offSnaps,
    teamSnaps,
    targets: 0,
    rushAtt: 0,
    receptions: 0,
    rzOpps: 0,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards: 0,
    rushTd: 0,
    recTd: 0,
    passYards: 0,
    passTd: 0,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): SnapCountLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 8 };
}

const players = [
  player('beta', 'Beta Back', 'RB'),
  player('gamma', 'Gamma Receiver', 'WR'),
  player('delta', 'Delta Tight End', 'TE'),
];

describe('buildSnapCountLeaders', () => {
  it('ranks by snap share over the last 3 completed weeks', () => {
    const leaders = buildSnapCountLeaders(
      input(players, {
        // Beta: 180/210 = 85.7%; Gamma: 150/210 = 71.4%;
        // Delta: 200/210 = 95.2%.
        beta: { 5: line(60), 6: line(60), 7: line(60) },
        gamma: { 5: line(50), 6: line(50), 7: line(50) },
        delta: { 5: line(65), 6: line(70), 7: line(65) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['beta']);
    expect(rb[0].snaps).toBe(180);
    expect(rb[0].snapSharePct).toBe(85.7);
    expect(rb[0].snapsPerGame).toBe(60);
    expect(rb[0].games).toBe(3);
    expect((leaders.get('WR') ?? [])[0].snapSharePct).toBe(71.4);
    expect((leaders.get('TE') ?? [])[0].snapSharePct).toBe(95.2);
  });

  it('only counts the 3 completed weeks before the current week', () => {
    const leaders = buildSnapCountLeaders(
      input(players, {
        // Week 8 is in progress, week 4 is stale — only 5–7 count.
        beta: { 4: line(70), 5: line(60), 6: line(60), 7: line(60), 8: line(70) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(1);
    expect(rb[0].snaps).toBe(180);
    expect(rb[0].snapSharePct).toBe(85.7);
  });

  it('requires 2+ games and drops zero-snap players', () => {
    const leaders = buildSnapCountLeaders(
      input(players, {
        beta: { 5: line(60) },
        gamma: { 5: line(0), 6: line(0), 7: line(0) },
        delta: { 5: line(65), 6: line(70), 7: line(65) },
      }),
    );
    // Beta has one game only, Gamma played no snaps — neither leads.
    expect(leaders.get('RB')).toBeUndefined();
    expect(leaders.get('WR')).toBeUndefined();
    expect((leaders.get('TE') ?? []).map(r => r.player.id)).toEqual(['delta']);
  });

  it('breaks snap-share ties on total snaps, then games played', () => {
    const rbs = [player('alpha', 'Alpha Back', 'RB'), player('beta', 'Beta Back', 'RB')];
    const leaders = buildSnapCountLeaders(
      input(rbs, {
        // Both 60/70 = 85.7%; beta played 3 games for 180 snaps vs
        // alpha's 2 games for 120 — the total-snaps tie-break puts
        // beta first.
        alpha: { 6: line(60), 7: line(60) },
        beta: { 5: line(60), 6: line(60), 7: line(60) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb.map(r => r.player.id)).toEqual(['beta', 'alpha']);
    expect(rb[0].snaps).toBe(180);
    expect(rb[1].snaps).toBe(120);
    expect(rb[0].snapSharePct).toBe(85.7);
    expect(rb[1].snapSharePct).toBe(85.7);
  });

  it('skips weeks with no team-snap denominator', () => {
    const leaders = buildSnapCountLeaders(
      input(players, {
        // Week 6 has no team snaps recorded — the share prices weeks
        // 5 and 7 only (120/140 = 85.7%), but all 3 weeks count as
        // games played.
        beta: { 5: line(60), 6: line(60, 0), 7: line(60) },
      }),
    );
    const rb = leaders.get('RB') ?? [];
    expect(rb).toHaveLength(1);
    expect(rb[0].snaps).toBe(180);
    expect(rb[0].snapSharePct).toBe(85.7);
    expect(rb[0].games).toBe(3);
  });

  it('caps each position at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`rb${i}`, `Back ${i}`, 'RB'),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      usage[p.sleeperId ?? ''] = {
        5: line(60 - (i % 5)),
        6: line(60 - (i % 5)),
        7: line(60 - (i % 5)),
      };
    });
    const leaders = buildSnapCountLeaders(input(many, usage));
    expect((leaders.get('RB') ?? []).length).toBe(15);
  });

  it('omits a position with no qualifying players', () => {
    const leaders = buildSnapCountLeaders(
      input(players, {
        beta: { 5: line(60), 6: line(60), 7: line(60) },
      }),
    );
    expect(leaders.get('RB')).toHaveLength(1);
    expect(leaders.get('WR')).toBeUndefined();
    expect(leaders.get('TE')).toBeUndefined();
  });
});
