// Kicker Leaders board (backlog item 170): kickers ranked by
// standard kicker fantasy points per game over the last 3 completed
// weeks, priced on Sleeper's free public weekly kicker stats
// (via the shared weekly-usage fetch).

import { describe, it, expect } from 'vitest';
import {
  buildKickerLeaders,
  scoreKickerWeek,
  type KickerLeadersInput,
} from './kickerLeaders';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import type { PoolPlayer } from '@/types/draft';

function player(id: string, name: string, pos: string, team = 'BUF'): PoolPlayer {
  return {
    id,
    name,
    team,
    pos,
    posRank: 1,
    overallRank: 179,
    tier: 8,
    bye: 8,
    baseValue: null,
    projPtsPpr: 104,
    sleeperId: id,
  } as PoolPlayer;
}

function line(
  fgm = 0,
  fga = 0,
  xpm = 0,
): WeeklyUsageLine {
  return {
    offSnaps: 0,
    teamSnaps: 0,
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
    passAtt: 0,
    passCmp: 0,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
    fgm,
    fga,
    xpm,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): KickerLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 10 };
}

const players = [
  player('k1', 'Tyler Bass', 'K', 'BUF'),
  player('k2', 'Brandon Aubrey', 'K', 'DAL'),
  player('qb1', 'Some Quarterback', 'QB', 'DAL'),
];

describe('scoreKickerWeek', () => {
  it('prices FGs, PATs, and missed FGs at standard kicker scoring', () => {
    // 4 FG made of 4 + 4 PAT = 12 + 4 = 16.
    expect(scoreKickerWeek(line(4, 4, 4))).toBe(16);
    // 2 FG made of 3 + 1 PAT = 6 + 1 - 1 = 6.
    expect(scoreKickerWeek(line(2, 3, 1))).toBe(6);
    // No kicks at all scores 0.
    expect(scoreKickerWeek(line(0, 0, 0))).toBe(0);
  });
});

describe('buildKickerLeaders', () => {
  it('ranks by fantasy points per game over the last 3 completed weeks', () => {
    const leaders = buildKickerLeaders(
      input(players, {
        // Bass: W7 3/3 + 2 PAT = 11; W8 2/2 + 3 PAT = 9; W9 4/4 + 4 PAT
        // = 16. Total 36 / 3 = 12.0.
        k1: {
          7: line(3, 3, 2),
          8: line(2, 2, 3),
          9: line(4, 4, 4),
        },
        // Aubrey: W7 2/3 + 1 PAT = 6; W8 3/3 + 2 PAT = 11; W9 1/2 +
        // 2 PAT = 4. Total 21 / 3 = 7.0.
        k2: {
          7: line(2, 3, 1),
          8: line(3, 3, 2),
          9: line(1, 2, 2),
        },
      }),
    );
    expect(leaders.map(r => r.player.id)).toEqual(['k1', 'k2']);
    expect(leaders[0].fantasyPts).toBe(36);
    expect(leaders[0].fantasyPtsPerGame).toBe(12);
    expect(leaders[0].fgMade).toBe(9);
    expect(leaders[0].fgAtt).toBe(9);
    expect(leaders[0].fgPct).toBe(100);
    expect(leaders[0].patMade).toBe(9);
    expect(leaders[0].games).toBe(3);
    expect(leaders[1].fantasyPts).toBe(21);
    expect(leaders[1].fantasyPtsPerGame).toBe(7);
    expect(leaders[1].fgMade).toBe(6);
    expect(leaders[1].fgAtt).toBe(8);
    expect(leaders[1].fgPct).toBe(75);
    expect(leaders[1].patMade).toBe(5);
  });

  it('ignores weeks outside the 3-week window and the in-progress week', () => {
    const leaders = buildKickerLeaders(
      input(players, {
        // Only weeks 7–9 count: 11 + 9 + 16 = 36. Week 6's 16 and week
        // 10's (in-progress) 16 are out.
        k1: {
          6: line(4, 4, 4),
          7: line(3, 3, 2),
          8: line(2, 2, 3),
          9: line(4, 4, 4),
          10: line(4, 4, 4),
        },
      }),
    );
    expect(leaders).toHaveLength(1);
    expect(leaders[0].fantasyPts).toBe(36);
    expect(leaders[0].fantasyPtsPerGame).toBe(12);
  });

  it('requires 2+ games', () => {
    const leaders = buildKickerLeaders(
      input(players, {
        // Bass: 1 game only (a 16-point spot week). Doesn't qualify.
        k1: { 9: line(4, 4, 4) },
      }),
    );
    expect(leaders).toHaveLength(0);
  });

  it('excludes kickers scoring zero or fewer points in the window', () => {
    const leaders = buildKickerLeaders(
      input(players, {
        // Aubrey: 0/1 + 0 PAT every week = -1 a week.
        k2: {
          7: line(0, 1, 0),
          8: line(0, 1, 0),
          9: line(0, 1, 0),
        },
      }),
    );
    expect(leaders).toHaveLength(0);
  });

  it('ignores non-K pool players', () => {
    const leaders = buildKickerLeaders(
      input(players, {
        qb1: {
          7: line(4, 4, 4),
          8: line(4, 4, 4),
          9: line(4, 4, 4),
        },
      }),
    );
    expect(leaders).toHaveLength(0);
  });

  it('breaks per-game ties by total points, then FGs made', () => {
    const leaders = buildKickerLeaders(
      input(players, {
        // Both 11.0 pts/game — Bass over 2 games (22 total, 6 FGs),
        // Aubrey over 3 (33 total, 9 FGs) — so the tie-break puts
        // Aubrey first.
        k1: { 8: line(3, 3, 2), 9: line(3, 3, 2) },
        k2: {
          7: line(3, 3, 2),
          8: line(3, 3, 2),
          9: line(3, 3, 2),
        },
      }),
    );
    expect(leaders.map(r => r.player.id)).toEqual(['k2', 'k1']);
    expect(leaders[0].fantasyPtsPerGame).toBe(11);
    expect(leaders[1].fantasyPtsPerGame).toBe(11);
    expect(leaders[0].fantasyPts).toBe(33);
  });

  it('caps the board at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`K${i}`, `Kicker ${i}`, 'K', `TM${i}`),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Points per game strictly descend with i so the top 15 are K0..K14.
      usage[p.id] = {
        7: line(20 - i, 20 - i, 0),
        8: line(20 - i, 20 - i, 0),
        9: line(20 - i, 20 - i, 0),
      };
    });
    const leaders = buildKickerLeaders(input(many, usage));
    expect(leaders).toHaveLength(15);
    expect(leaders[0].player.id).toBe('K0');
    expect(leaders[14].player.id).toBe('K14');
  });

  it('returns an empty board when no kicker qualifies', () => {
    expect(buildKickerLeaders(input(players, {}))).toHaveLength(0);
  });
});
