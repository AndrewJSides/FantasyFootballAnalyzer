import { describe, expect, it } from 'vitest';
import type { League, Player, Team } from '@/types';
import { buildPositionBattles, EVEN_BAND } from './positionBattles';

// Same fixture convention as gamePlan.test.ts: weekly points keyed by
// platformId drive the projection; 'XXX' is not a real NFL team so the
// matchup blend never fires and projections equal the flat weekly averages.
function mkPlayer(id: string, pos: string): Player {
  return { id, platformId: id, name: id, position: pos, team: 'XXX' } as Player;
}

function weekly(entries: Record<string, number[]>): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = {};
  for (const [id, scores] of Object.entries(entries)) {
    out[id] = {};
    scores.forEach((s, i) => {
      out[id][i + 1] = s;
    });
  }
  return out;
}

function mkLeague(a: Player[], b: Player[], pw: Record<string, Record<number, number>>): League {
  const teamA: Team = { id: 'A', name: 'Alpha', roster: a } as Team;
  const teamB: Team = { id: 'B', name: 'Beta', roster: b } as Team;
  return {
    id: 'L',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    currentWeek: 4,
    teams: [teamA, teamB],
    rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BENCH: 6 },
    playerWeeklyPoints: pw,
  } as League;
}

describe('buildPositionBattles', () => {
  it('compares position groups in fixed order and skips empty groups', () => {
    const league = mkLeague(
      [mkPlayer('aqb', 'QB'), mkPlayer('arb1', 'RB'), mkPlayer('ak', 'K')],
      [mkPlayer('bqb', 'QB'), mkPlayer('brb1', 'RB'), mkPlayer('bk', 'K')],
      weekly({
        aqb: [20, 20, 20],
        arb1: [16, 16, 16],
        ak: [8, 8, 8],
        bqb: [24, 24, 24],
        brb1: [12, 12, 12],
        bk: [9, 9, 9],
      }),
    );
    const battles = buildPositionBattles(league.teams[0], league.teams[1], league);
    expect(battles).not.toBeNull();
    expect(battles!.map(b => b.group)).toEqual(['QB', 'RB', 'K']);
    const qb = battles!.find(b => b.group === 'QB')!;
    expect(qb.a.proj).toBe(20);
    expect(qb.b.proj).toBe(24);
    expect(qb.edge).toBe('b');
    expect(qb.margin).toBe(-4);
    const rb = battles!.find(b => b.group === 'RB')!;
    expect(rb.edge).toBe('a');
  });

  it('counts a FLEXed RB in the RB group', () => {
    const league = mkLeague(
      [
        mkPlayer('arb1', 'RB'),
        mkPlayer('arb2', 'RB'),
        mkPlayer('arb3', 'RB'),
        mkPlayer('awr1', 'WR'),
        mkPlayer('awr2', 'WR'),
        mkPlayer('aqb', 'QB'),
        mkPlayer('ate', 'TE'),
      ],
      [
        mkPlayer('bqb', 'QB'),
        mkPlayer('brb1', 'RB'),
        mkPlayer('brb2', 'RB'),
        mkPlayer('bwr1', 'WR'),
        mkPlayer('bwr2', 'WR'),
        mkPlayer('bte', 'TE'),
      ],
      weekly({
        arb1: [16, 16, 16],
        arb2: [15, 15, 15],
        arb3: [14, 14, 14],
        awr1: [12, 12, 12],
        awr2: [11, 11, 11],
        aqb: [20, 20, 20],
        ate: [8, 8, 8],
        bqb: [20, 20, 20],
        brb1: [10, 10, 10],
        brb2: [10, 10, 10],
        bwr1: [10, 10, 10],
        bwr2: [10, 10, 10],
        bte: [8, 8, 8],
      }),
    );
    const battles = buildPositionBattles(league.teams[0], league.teams[1], league);
    const rb = battles!.find(b => b.group === 'RB')!;
    // arb1 + arb2 in the RB slots, arb3 (14) in FLEX — all three land in RB.
    expect(rb.a.players.map(p => p.name)).toEqual(['arb1', 'arb2', 'arb3']);
    expect(rb.a.proj).toBe(45);
  });

  it('scores margins inside the even band as even', () => {
    const league = mkLeague(
      [mkPlayer('ak', 'K')],
      [mkPlayer('bk', 'K')],
      weekly({ ak: [8.0, 8.0, 8.0], bk: [8.3, 8.3, 8.3] }),
    );
    const battles = buildPositionBattles(league.teams[0], league.teams[1], league);
    const k = battles!.find(b => b.group === 'K')!;
    expect(Math.abs(k.margin)).toBeLessThan(EVEN_BAND);
    expect(k.edge).toBe('even');
  });

  it('normalizes DEF to the DST group', () => {
    const league = mkLeague(
      [mkPlayer('adst', 'DEF')],
      [mkPlayer('bdst', 'DST')],
      weekly({ adst: [7, 7, 7], bdst: [5, 5, 5] }),
    );
    const battles = buildPositionBattles(league.teams[0], league.teams[1], league);
    expect(battles!.map(b => b.group)).toEqual(['DST']);
    expect(battles![0].edge).toBe('a');
  });

  it('returns null when a team has no roster or no pricing data', () => {
    const league = mkLeague([mkPlayer('aqb', 'QB')], [], weekly({ aqb: [20, 20, 20] }));
    expect(buildPositionBattles(league.teams[0], league.teams[1], league)).toBeNull();
    const noData = mkLeague(
      [mkPlayer('aqb', 'QB')],
      [mkPlayer('bqb', 'QB')],
      weekly({}),
    );
    expect(buildPositionBattles(noData.teams[0], noData.teams[1], noData)).toBeNull();
  });
});
