// Defense Leaders board (backlog item 169): team defenses ranked by
// standard D/ST fantasy points per game over the last 3 completed
// weeks, priced on Sleeper's free public weekly team-defense stats
// (via the shared weekly-usage fetch).

import { describe, it, expect } from 'vitest';
import {
  buildDefenseLeaders,
  ptsAllowedBracket,
  scoreDefenseWeek,
  type DefenseLeadersInput,
} from './defenseLeaders';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';
import type { PoolPlayer } from '@/types/draft';

function player(id: string, name: string, pos: string, team = 'HOU'): PoolPlayer {
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
  sacks = 0,
  defInt = 0,
  fumRec = 0,
  defTd = 0,
  ptsAllow = 17,
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
    sacks,
    defInt,
    fumRec,
    defTd,
    safeties: 0,
    blkKick: 0,
    ptsAllow,
  };
}

function input(
  poolPlayers: PoolPlayer[],
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>,
): DefenseLeadersInput {
  return { poolPlayers, usageBySleeperId, currentWeek: 10 };
}

const players = [
  player('HOU', 'Houston Texans', 'DST', 'HOU'),
  player('DEN', 'Denver Broncos', 'DST', 'DEN'),
  player('qb1', 'Some Quarterback', 'QB', 'DAL'),
];

describe('ptsAllowedBracket', () => {
  it('maps the standard D/ST points-allowed brackets', () => {
    expect(ptsAllowedBracket(0)).toBe(10);
    expect(ptsAllowedBracket(6)).toBe(7);
    expect(ptsAllowedBracket(7)).toBe(4);
    expect(ptsAllowedBracket(13)).toBe(4);
    expect(ptsAllowedBracket(14)).toBe(1);
    expect(ptsAllowedBracket(20)).toBe(1);
    expect(ptsAllowedBracket(21)).toBe(0);
    expect(ptsAllowedBracket(27)).toBe(0);
    expect(ptsAllowedBracket(28)).toBe(-1);
    expect(ptsAllowedBracket(34)).toBe(-1);
    expect(ptsAllowedBracket(35)).toBe(-4);
  });
});

describe('scoreDefenseWeek', () => {
  it('prices sacks, takeaways, defensive TDs, and the points bracket', () => {
    // 3 sacks + 1 INT + 1 FR + 1 def TD + 10 pts allowed (bracket 4) = 17.
    expect(scoreDefenseWeek(line(3, 1, 1, 1, 10))).toBe(17);
    // Shutout bracket: 0 sacks, 0 takeaways, 0 allowed = 10.
    expect(scoreDefenseWeek(line(0, 0, 0, 0, 0))).toBe(10);
    // Blowout bracket: 1 sack, 35 allowed = 1 - 4 = -3.
    expect(scoreDefenseWeek(line(1, 0, 0, 0, 35))).toBe(-3);
  });
});

describe('buildDefenseLeaders', () => {
  it('ranks by fantasy points per game over the last 3 completed weeks', () => {
    const leaders = buildDefenseLeaders(
      input(players, {
        // HOU: W7 3 sacks + 1 INT + 10 allowed = 9; W8 2 sacks + 1 FR +
        // 14 allowed = 5; W9 4 sacks + 1 def TD + 7 allowed = 14.
        // Total 28 / 3 = 9.3.
        HOU: {
          7: line(3, 1, 0, 0, 10),
          8: line(2, 0, 1, 0, 14),
          9: line(4, 0, 0, 1, 7),
        },
        // DEN: W7 1 sack + 20 allowed = 2; W8 1 sack + 13 allowed = 5;
        // W9 2 sacks + 17 allowed = 3. Total 10 / 3 = 3.3.
        DEN: {
          7: line(1, 0, 0, 0, 20),
          8: line(1, 0, 0, 0, 13),
          9: line(2, 0, 0, 0, 17),
        },
      }),
    );
    expect(leaders.map(r => r.player.id)).toEqual(['HOU', 'DEN']);
    expect(leaders[0].fantasyPts).toBe(28);
    expect(leaders[0].fantasyPtsPerGame).toBe(9.3);
    expect(leaders[0].sacks).toBe(9);
    expect(leaders[0].takeaways).toBe(2);
    expect(leaders[0].defTd).toBe(1);
    expect(leaders[0].ptsAllowedPerGame).toBe(10.3);
    expect(leaders[0].games).toBe(3);
    expect(leaders[1].fantasyPtsPerGame).toBe(3.3);
  });

  it('ignores weeks outside the 3-week window and the in-progress week', () => {
    const leaders = buildDefenseLeaders(
      input(players, {
        // Only weeks 7–9 count: 9 + 5 + 14 = 28. Week 6's shutout
        // (10) and week 10's (in-progress) 14 are out.
        HOU: {
          6: line(0, 0, 0, 0, 0),
          7: line(3, 1, 0, 0, 10),
          8: line(2, 0, 1, 0, 14),
          9: line(4, 0, 0, 1, 7),
          10: line(4, 0, 0, 1, 7),
        },
      }),
    );
    expect(leaders).toHaveLength(1);
    expect(leaders[0].fantasyPts).toBe(28);
    expect(leaders[0].fantasyPtsPerGame).toBe(9.3);
  });

  it('requires 2+ games', () => {
    const leaders = buildDefenseLeaders(
      input(players, {
        // HOU: 1 game only (a 17-point spot week). Doesn't qualify.
        HOU: { 9: line(3, 1, 1, 1, 10) },
      }),
    );
    expect(leaders).toHaveLength(0);
  });

  it('excludes defenses scoring zero or fewer points in the window', () => {
    const leaders = buildDefenseLeaders(
      input(players, {
        // DEN: 0 sacks, 0 takeaways, 35 allowed every week = -4 x 3.
        DEN: {
          7: line(0, 0, 0, 0, 35),
          8: line(0, 0, 0, 0, 35),
          9: line(0, 0, 0, 0, 35),
        },
      }),
    );
    expect(leaders).toHaveLength(0);
  });

  it('ignores non-DST pool players', () => {
    const leaders = buildDefenseLeaders(
      input(players, {
        qb1: {
          7: line(5, 2, 2, 2, 0),
          8: line(5, 2, 2, 2, 0),
          9: line(5, 2, 2, 2, 0),
        },
      }),
    );
    expect(leaders).toHaveLength(0);
  });

  it('breaks per-game ties by total points, then sacks', () => {
    const leaders = buildDefenseLeaders(
      input(players, {
        // Both 6.0 pts/game — HOU over 2 games (12 total), DEN over
        // 3 (18 total) — so the tie-break puts DEN first.
        HOU: { 8: line(2, 0, 0, 0, 10), 9: line(2, 0, 0, 0, 10) },
        DEN: {
          7: line(2, 0, 0, 0, 10),
          8: line(2, 0, 0, 0, 10),
          9: line(2, 0, 0, 0, 10),
        },
      }),
    );
    expect(leaders.map(r => r.player.id)).toEqual(['DEN', 'HOU']);
    expect(leaders[0].fantasyPtsPerGame).toBe(6);
    expect(leaders[1].fantasyPtsPerGame).toBe(6);
    expect(leaders[0].fantasyPts).toBe(18);
  });

  it('caps the board at 15 leaders', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`TM${i}`, `Team ${i}`, 'DST', `TM${i}`),
    );
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {};
    many.forEach((p, i) => {
      // Points per game strictly descend with i so the top 15 are TM0..TM14.
      usage[p.id] = {
        7: line(20 - i, 0, 0, 0, 10),
        8: line(20 - i, 0, 0, 0, 10),
        9: line(20 - i, 0, 0, 0, 10),
      };
    });
    const leaders = buildDefenseLeaders(input(many, usage));
    expect(leaders).toHaveLength(15);
    expect(leaders[0].player.id).toBe('TM0');
    expect(leaders[14].player.id).toBe('TM14');
  });

  it('returns an empty board when no defense qualifies', () => {
    expect(buildDefenseLeaders(input(players, {}))).toHaveLength(0);
  });
});
