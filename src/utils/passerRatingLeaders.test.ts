// PasserRatingLeaders util (backlog item 186): quarterbacks ranked
// by NFL passer rating over the last 3 completed weeks, with
// completion %, yards per attempt, TDs, and INTs alongside.

import { describe, expect, it } from 'vitest';
import {
  buildPasserRatingLeaders,
  passerRating,
  MAX_PASSER_RATING_LEADERS,
} from './passerRatingLeaders';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import type { PoolPlayer } from '@/types/draft';

function player(id: string, name: string, pos: string, team = 'BUF'): PoolPlayer {
  return {
    id,
    name,
    team,
    pos,
    posRank: 1,
    overallRank: 10,
    tier: 1,
    bye: 7,
    baseValue: null,
    projPtsPpr: 300,
    sleeperId: id,
  } as PoolPlayer;
}

function line(
  passCmp: number,
  passAtt: number,
  passYards: number,
  passTd = 0,
  passInt = 0,
): WeeklyUsageLine {
  return {
    offSnaps: 70,
    teamSnaps: 70,
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
    passYards,
    passTd,
    passAtt,
    passCmp,
    passInt,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
  };
}

describe('passerRating', () => {
  it('matches Sleeper\'s published week-8 pass_rtg for real lines', () => {
    // Dak Prescott week 8: 30/41, 321 yds, 3 TD, 0 INT → 120.1.
    expect(passerRating(30, 41, 321, 3, 0)).toBe(120.1);
    // Joe Burrow week 8: 38/48, 462 yds, 5 TD, 3 INT → 115.5.
    expect(passerRating(38, 48, 462, 5, 3)).toBe(115.5);
  });

  it('returns 0 with no attempts and caps at a perfect 158.3', () => {
    expect(passerRating(0, 0, 0, 0, 0)).toBe(0);
    expect(passerRating(30, 30, 400, 5, 0)).toBe(158.3);
  });

  it('punishes interceptions', () => {
    expect(passerRating(25, 35, 280, 2, 0)).toBeGreaterThan(
      passerRating(25, 35, 280, 2, 3),
    );
  });
});

describe('buildPasserRatingLeaders', () => {
  it('ranks QBs by rating over the last 3 completed weeks', () => {
    const leaders = buildPasserRatingLeaders({
      poolPlayers: [
        player('allen', 'Josh Allen', 'QB', 'BUF'),
        player('burrow', 'Joe Burrow', 'QB', 'CIN'),
      ],
      usageBySleeperId: {
        allen: {
          6: line(22, 30, 260, 2, 0),
          7: line(24, 32, 290, 3, 1),
          8: line(20, 28, 240, 2, 0),
        },
        burrow: {
          6: line(25, 35, 310, 2, 1),
          7: line(26, 34, 300, 2, 1),
          8: line(28, 38, 330, 3, 1),
        },
      },
      currentWeek: 9,
    });
    expect(leaders).toHaveLength(2);
    // Allen: 66/90, 790 yds, 7 TD, 1 INT. Burrow: 79/107, 940 yds,
    // 7 TD, 3 INT. Allen's cleaner line outrates Burrow's volume.
    expect(leaders[0].player.name).toBe('Josh Allen');
    expect(leaders[0].rating).toBeGreaterThan(leaders[1].rating);
    expect(leaders[0].games).toBe(3);
    expect(leaders[0].cmpPct).toBeCloseTo(73.3, 1);
    expect(leaders[0].ydsPerAtt).toBeCloseTo(8.8, 1);
    expect(leaders[0].passTd).toBe(7);
    expect(leaders[0].passInt).toBe(1);
  });

  it('only prices weeks strictly before the current week', () => {
    const leaders = buildPasserRatingLeaders({
      poolPlayers: [player('allen', 'Josh Allen', 'QB', 'BUF')],
      usageBySleeperId: {
        allen: {
          5: line(30, 40, 400, 4, 0),
          6: line(22, 30, 260, 2, 0),
          7: line(24, 32, 290, 3, 1),
          8: line(20, 28, 240, 2, 0),
          // Week 9 is in progress — must not count.
          9: line(30, 30, 400, 5, 0),
        },
      },
      currentWeek: 9,
    });
    expect(leaders).toHaveLength(1);
    expect(leaders[0].games).toBe(3);
    expect(leaders[0].passYards).toBe(790);
  });

  it('excludes single-game QBs and low-volume passers', () => {
    const leaders = buildPasserRatingLeaders({
      poolPlayers: [
        player('starter', 'Starter QB', 'QB', 'BUF'),
        player('spot', 'Spot Starter', 'QB', 'CIN'),
        player('trick', 'Trick Play WR', 'QB', 'PHI'),
      ],
      usageBySleeperId: {
        starter: {
          7: line(24, 32, 290, 3, 1),
          8: line(20, 28, 240, 2, 0),
        },
        // One game only.
        spot: { 8: line(30, 40, 400, 4, 0) },
        // Perfect rate on 3 attempts a game — below the volume floor.
        trick: {
          7: line(3, 3, 45, 1, 0),
          8: line(3, 3, 40, 1, 0),
        },
      },
      currentWeek: 9,
    });
    expect(leaders.map(l => l.player.name)).toEqual(['Starter QB']);
  });

  it('breaks rating ties by passing yards, then touchdowns', () => {
    const leaders = buildPasserRatingLeaders({
      poolPlayers: [
        player('a', 'QB A', 'QB', 'BUF'),
        player('b', 'QB B', 'QB', 'CIN'),
      ],
      usageBySleeperId: {
        // Identical per-attempt efficiency — A played one more game,
        // so the same rating with more total yards wins the tie.
        a: {
          6: line(20, 30, 300, 2, 0),
          7: line(20, 30, 300, 2, 0),
          8: line(20, 30, 300, 2, 0),
        },
        b: { 7: line(20, 30, 300, 2, 0), 8: line(20, 30, 300, 2, 0) },
      },
      currentWeek: 9,
    });
    expect(leaders[0].rating).toBe(leaders[1].rating);
    expect(leaders[0].player.name).toBe('QB A');
    expect(leaders[0].passYards).toBe(900);
    expect(leaders[1].passYards).toBe(600);
  });

  it('treats a missing passInt as zero and ignores non-QBs', () => {
    const rbLine = line(25, 35, 300, 2, 0);
    delete (rbLine as Partial<WeeklyUsageLine>).passInt;
    const leaders = buildPasserRatingLeaders({
      poolPlayers: [
        player('allen', 'Josh Allen', 'QB', 'BUF'),
        player('barkley', 'Saquon Barkley', 'RB', 'PHI'),
      ],
      usageBySleeperId: {
        allen: {
          7: rbLine,
          8: line(25, 35, 300, 2, 0),
        },
        barkley: {
          7: line(30, 40, 400, 4, 0),
          8: line(30, 40, 400, 4, 0),
        },
      },
      currentWeek: 9,
    });
    expect(leaders.map(l => l.player.name)).toEqual(['Josh Allen']);
    expect(leaders[0].passInt).toBe(0);
  });

  it('returns an empty board when nobody qualifies', () => {
    expect(
      buildPasserRatingLeaders({
        poolPlayers: [player('allen', 'Josh Allen', 'QB', 'BUF')],
        usageBySleeperId: {},
        currentWeek: 9,
      }),
    ).toEqual([]);
  });

  it('caps the board at 15', () => {
    const poolPlayers = Array.from({ length: 20 }, (_, i) =>
      player(`qb${i}`, `QB ${i}`, 'QB', 'BUF'),
    );
    const usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>> = {};
    poolPlayers.forEach((p, i) => {
      usageBySleeperId[p.sleeperId ?? ''] = {
        7: line(20 + i, 30, 250 + i * 10, 2, 0),
        8: line(20 + i, 30, 250 + i * 10, 2, 0),
      };
    });
    const leaders = buildPasserRatingLeaders({
      poolPlayers,
      usageBySleeperId,
      currentWeek: 9,
    });
    expect(leaders).toHaveLength(MAX_PASSER_RATING_LEADERS);
  });
});
