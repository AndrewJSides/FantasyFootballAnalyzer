import { describe, expect, it } from 'vitest';
import { buildPowerRankings } from './powerRankings';
import type { League } from '@/types';

const mkLeague = (
  scores: Record<string, number[]>,
  opts: { status?: string; currentWeek?: number } = {},
): League => {
  const teams = Object.keys(scores).map(id => ({
    id,
    name: id,
    wins: 0,
    losses: 0,
    ties: 0,
    roster: [],
  }));
  const ids = Object.keys(scores);
  const matchups: League['matchups'] = [];
  const nWeeks = Math.max(...Object.values(scores).map(s => s.length));
  for (let w = 1; w <= nWeeks; w++) {
    const playing = ids.filter(id => scores[id][w - 1] != null);
    // Rotate the bye through the playing order so every team gets games
    // when the count is odd (mirrors real leagues' bye weeks).
    const field =
      playing.length % 2 === 0
        ? playing
        : playing.filter((_, i) => i !== (w - 1) % playing.length);
    for (let i = 0; i + 1 < field.length; i += 2) {
      const a = field[i];
      const b = field[i + 1];
      matchups.push({
        week: w,
        team1Id: a,
        team2Id: b,
        team1Points: scores[a][w - 1],
        team2Points: scores[b][w - 1],
      });
    }
  }
  return {
    teams,
    matchups,
    status: (opts.status ?? 'live') as League['status'],
    currentWeek: opts.currentWeek ?? nWeeks + 1,
  } as League;
};

describe('buildPowerRankings', () => {
  it('ranks by the shrunk scoring rating, best first', () => {
    const rows = buildPowerRankings(
      mkLeague({ A: [120, 118, 122], B: [100, 102, 98] }),
    );
    expect(rows.map(r => r.teamId)).toEqual(['A', 'B']);
    expect(rows[0].avg).toBe(120);
    expect(rows[0].weeks).toBe(3);
  });

  it('shrinks small samples toward the league mean, both directions', () => {
    // Hot scores 200 in his only game; the rest play 5 games each (one
    // rotating bye per week after week 1).
    const rows = buildPowerRankings(
      mkLeague({
        Hot: [200],
        Steady: [110, 110, 110, 110, 110, 110, 110],
        Mid: [105, 105, 105, 105, 105, 105, 105],
        Low: [100, 100, 100, 100, 100, 100, 100],
      }),
    );
    const byId = new Map(rows.map(r => [r.teamId, r]));
    const hot = byId.get('Hot')!;
    const steady = byId.get('Steady')!;
    // League mean of avgs = (200 + 110 + 105 + 100) / 4 = 128.75.
    // Hot: (200 + 128.75*2) / 3 = 152.5 — pulled down hard off one game.
    expect(hot.rating).toBeCloseTo(152.5, 0);
    expect(hot.rating).toBeLessThan(hot.avg);
    // Steady: (110*5 + 128.75*2) / 7 ≈ 115.4 — pulled up toward the mean.
    expect(steady.rating).toBeCloseTo(115.4, 0);
    expect(steady.rating).toBeGreaterThan(steady.avg);
    expect(rows[0].teamId).toBe('Hot');
  });

  it('flags hot / cold / steady trends against the team’s own average', () => {
    const rows = buildPowerRankings(
      mkLeague({
        Hot: [100, 100, 100, 120, 120, 120],
        Cold: [120, 120, 120, 100, 100, 100],
        SteadyA: [110, 110, 110, 110, 110, 110],
        SteadyB: [100, 100, 100, 100, 100, 100],
      }),
    );
    const byId = new Map(rows.map(r => [r.teamId, r]));
    expect(byId.get('Hot')!.last3).toBe(120);
    expect(byId.get('Hot')!.trend).toBe('hot');
    expect(byId.get('Cold')!.trend).toBe('cold');
    expect(byId.get('SteadyA')!.trend).toBe('steady');
  });

  it('leaves trend null under 3 completed weeks', () => {
    const rows = buildPowerRankings(mkLeague({ A: [120, 118], B: [100, 102] }));
    expect(rows[0].last3).toBeNull();
    expect(rows[0].trend).toBeNull();
  });

  it('excludes the live current week', () => {
    // currentWeek = 4 means week 3 is the latest completed week.
    const rows = buildPowerRankings(
      mkLeague(
        { A: [120, 118, 122, 200], B: [100, 102, 98, 50] },
        { currentWeek: 4 },
      ),
    );
    expect(rows[0].weeks).toBe(3);
    expect(rows[0].avg).toBe(120);
  });

  it('reports priorWeekRank from the same table one completed week back', () => {
    // A surges in week 4; B held rank 1 through week 3.
    const rows = buildPowerRankings(
      mkLeague({ A: [100, 100, 100, 200], B: [110, 110, 110, 90] }),
    );
    const byId = new Map(rows.map(r => [r.teamId, r]));
    expect(rows[0].teamId).toBe('A');
    expect(byId.get('A')!.priorWeekRank).toBe(2);
    expect(byId.get('B')!.priorWeekRank).toBe(1);
  });

  it('leaves priorWeekRank null with a single completed week', () => {
    const rows = buildPowerRankings(mkLeague({ A: [120], B: [100] }));
    expect(rows).toHaveLength(2);
    expect(rows[0].priorWeekRank).toBeNull();
    expect(rows[1].priorWeekRank).toBeNull();
  });

  it('prices the prior week on completed weeks only, ignoring the live week', () => {
    // currentWeek = 4: week 3 is the latest completed week, so the prior
    // table covers weeks 1-2 and the live week-4 blowout never counts.
    const rows = buildPowerRankings(
      mkLeague(
        { A: [120, 118, 122, 200], B: [100, 102, 98, 50] },
        { currentWeek: 4 },
      ),
    );
    const byId = new Map(rows.map(r => [r.teamId, r]));
    expect(rows[0].teamId).toBe('A');
    expect(byId.get('A')!.priorWeekRank).toBe(1);
    expect(byId.get('B')!.priorWeekRank).toBe(2);
  });

  it('returns [] with no completed matchups', () => {
    const league = mkLeague({ A: [120], B: [100] }, { currentWeek: 1 });
    expect(buildPowerRankings(league)).toEqual([]);
    expect(buildPowerRankings({ teams: [], matchups: [] } as League)).toEqual([]);
  });
});
