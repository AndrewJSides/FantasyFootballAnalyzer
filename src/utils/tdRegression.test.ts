// tdRegression (backlog item 179): per-position xTD regression candidates
// from mocked Sleeper usage — rate math, due/cooling split, thresholds,
// min-games gate, QB exclusion, sorting, and the 10-row cap.

import { describe, it, expect } from 'vitest';
import {
  buildTdRegression,
  leagueTdPerRzOppByPosition,
} from './tdRegression';
import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

function pl(id: string, name: string, pos: string, team = 'DAL'): PoolPlayer {
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

function line(rzOpps: number, rushTd = 0, recTd = 0): WeeklyUsageLine {
  return {
    offSnaps: 50,
    teamSnaps: 70,
    targets: 0,
    rushAtt: 0,
    receptions: 0,
    rzOpps,
    airYards: 0,
    deepRec: 0,
    longRec: 0,
    yac: 0,
    recYards: 0,
    rushYards: 0,
    rushTd,
    recTd,
    passYards: 0,
    passTd: 0,
    passAtt: 0,
    passCmp: 0,
    rushFd: 0,
    recFd: 0,
    ptsPpr: 0,
  };
}

/** Three completed weeks (5, 6, 7) of the same per-week line. */
function threeWeeks(
  rzOpps: number,
  rushTd: number,
  recTd = 0,
): Record<number, WeeklyUsageLine> {
  const perWeekRz = Math.floor(rzOpps / 3);
  const perWeekTd = Math.floor(rushTd / 3);
  return {
    5: line(perWeekRz, perWeekTd, Math.floor(recTd / 3)),
    6: line(perWeekRz, perWeekTd, Math.floor(recTd / 3)),
    7: line(
      rzOpps - 2 * perWeekRz,
      rushTd - 2 * perWeekTd,
      recTd - 2 * Math.floor(recTd / 3),
    ),
  };
}

describe('leagueTdPerRzOppByPosition', () => {
  it('prices each position at its own league-wide TD-per-RZ-opp rate', () => {
    const rates = leagueTdPerRzOppByPosition({
      poolPlayers: [
        pl('alpha', 'Alpha Back', 'RB'),
        pl('beta', 'Beta Back', 'RB'),
        pl('delta', 'Delta Receiver', 'WR'),
      ],
      // RB: 4 TDs on 24 RZ opps → 1/6. WR: 1 TD on 9 RZ opps → 1/9.
      usageBySleeperId: {
        alpha: threeWeeks(12, 4),
        beta: threeWeeks(12, 0),
        delta: threeWeeks(9, 0, 1),
      },
      currentWeek: 8,
    });
    expect(rates.get('RB')).toBeCloseTo(1 / 6, 5);
    expect(rates.get('WR')).toBeCloseTo(1 / 9, 5);
    expect(rates.has('TE')).toBe(false);
  });

  it('returns 0 for a position with red-zone opps but no TDs', () => {
    const rates = leagueTdPerRzOppByPosition({
      poolPlayers: [pl('beta', 'Beta Back', 'RB')],
      usageBySleeperId: { beta: threeWeeks(12, 0) },
      currentWeek: 8,
    });
    expect(rates.get('RB')).toBe(0);
  });
});

describe('buildTdRegression', () => {
  it('splits over- and under-performers into cooling and due lists', () => {
    const out = buildTdRegression({
      poolPlayers: [
        pl('alpha', 'Alpha Back', 'RB'),
        pl('beta', 'Beta Back', 'RB'),
        pl('gamma', 'Gamma Back', 'RB'),
        pl('delta', 'Delta Receiver', 'WR'),
        pl('epsilon', 'Epsilon Passer', 'QB'),
      ],
      usageBySleeperId: {
        // RB rate 0.2 (6 TDs / 30 RZ opps): Alpha xTD 2.4, gap +1.6
        // (cooling); Beta xTD 2.4, gap -2.4 (due); Gamma xTD 1.2,
        // gap +0.8 (below the 1.5 threshold, neither list).
        alpha: threeWeeks(12, 4),
        beta: threeWeeks(12, 0),
        gamma: threeWeeks(6, 2),
        // WR rate 1/9: Delta xTD 1.0, gap 0 — neither list, so no WR entry.
        delta: threeWeeks(9, 0, 1),
        // QB with 4 rush TDs on 6 RZ opps: if QBs leaked into the RB
        // lists (or the RB rate) Alpha would drop off cooling — the
        // assertions above pin the exclusion.
        epsilon: threeWeeks(6, 4),
      },
      currentWeek: 8,
    });
    const rb = out.get('RB');
    expect(rb).toBeDefined();
    expect(rb!.cooling).toHaveLength(1);
    expect(rb!.cooling[0].player.name).toBe('Alpha Back');
    expect(rb!.cooling[0].tds).toBe(4);
    expect(rb!.cooling[0].xTd).toBe(2.4);
    expect(rb!.cooling[0].gap).toBe(1.6);
    expect(rb!.cooling[0].rzOpps).toBe(12);
    expect(rb!.cooling[0].games).toBe(3);
    expect(rb!.due).toHaveLength(1);
    expect(rb!.due[0].player.name).toBe('Beta Back');
    expect(rb!.due[0].gap).toBe(-2.4);
    expect(out.has('WR')).toBe(false);
    expect(out.has('TE')).toBe(false);
  });

  it('requires 3 games, even for a big gap', () => {
    const out = buildTdRegression({
      poolPlayers: [
        pl('zeta', 'Zeta Back', 'RB'),
        pl('eta', 'Eta Back', 'RB'),
      ],
      usageBySleeperId: {
        // Zeta: 4 TDs on 10 RZ opps in 2 games — would be cooling, but
        // 2 games is below the minimum.
        zeta: { 6: line(5, 2), 7: line(5, 2) },
        // Eta: 1 TD on 9 RZ opps in 3 games. Rate is (4 + 1) / 19, so
        // Eta xTD is 2.4 and the gap is -1.4 — below the threshold.
        eta: threeWeeks(9, 1),
      },
      currentWeek: 8,
    });
    expect(out.size).toBe(0);
  });

  it('keeps a player who scored TDs on zero red-zone opps', () => {
    const out = buildTdRegression({
      poolPlayers: [pl('theta', 'Theta Back', 'RB')],
      // No RZ opps anywhere, so the rate is 0 and xTD is 0 — the two
      // long scores are the whole gap.
      usageBySleeperId: { theta: threeWeeks(0, 2) },
      currentWeek: 8,
    });
    const rb = out.get('RB');
    expect(rb!.cooling).toHaveLength(1);
    expect(rb!.cooling[0].xTd).toBe(0);
    expect(rb!.cooling[0].gap).toBe(2);
    expect(rb!.due).toHaveLength(0);
  });

  it('sorts each list most-extreme-first and caps at 10 rows', () => {
    const players: PoolPlayer[] = [pl('anchor', 'Anchor Back', 'RB')];
    const usage: Record<string, Record<number, WeeklyUsageLine>> = {
      // Anchor: 40 TDs on 10 RZ opps sets a high rate (40 / 196).
      anchor: threeWeeks(10, 40),
    };
    for (let i = 0; i < 12; i++) {
      players.push(pl(`p${i}`, `Back ${i}`, 'RB'));
      usage[`p${i}`] = threeWeeks(10 + i, 0);
    }
    const out = buildTdRegression({
      poolPlayers: players,
      usageBySleeperId: usage,
      currentWeek: 8,
    });
    const rb = out.get('RB');
    expect(rb!.due).toHaveLength(10);
    // Most negative gap first: the biggest RZ workload (Back 11) leads,
    // and Back 1 / Back 0 fall off the cap.
    expect(rb!.due[0].player.name).toBe('Back 11');
    expect(rb!.due[0].gap).toBe(-4.3);
    expect(rb!.due[9].player.name).toBe('Back 2');
    expect(rb!.due[9].gap).toBe(-2.4);
    expect(rb!.due.some(r => r.player.name === 'Back 0')).toBe(false);
    expect(rb!.cooling).toHaveLength(1);
    expect(rb!.cooling[0].player.name).toBe('Anchor Back');
  });

  it('returns an empty map when nobody has usage', () => {
    expect(
      buildTdRegression({
        poolPlayers: [pl('alpha', 'Alpha Back', 'RB')],
        usageBySleeperId: {},
        currentWeek: 8,
      }).size,
    ).toBe(0);
  });

  it('ignores weeks from the in-progress week onward', () => {
    const out = buildTdRegression({
      poolPlayers: [pl('alpha', 'Alpha Back', 'RB')],
      usageBySleeperId: {
        // Week 8 is in progress: its 4 TDs on 4 RZ opps must not move
        // the rate or the totals. Weeks 5–7: 0 TDs on 12 RZ opps, rate 0.
        alpha: {
          5: line(4, 0),
          6: line(4, 0),
          7: line(4, 0),
          8: line(4, 4),
        },
      },
      currentWeek: 8,
    });
    expect(out.size).toBe(0);
  });
});
