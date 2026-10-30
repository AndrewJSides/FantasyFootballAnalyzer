import { describe, it, expect } from 'vitest';
import { buildLineupEfficiency } from './lineupEfficiency';
import type { League, WeeklyLineup, LineupPlayer } from '@/types';

const p = (id: string, name: string, pos: string, points: number): LineupPlayer => ({
  id,
  name,
  pos,
  points,
});

function lineup(
  week: number,
  teamId: string,
  slots: string[],
  starters: (LineupPlayer | null)[],
  bench: LineupPlayer[] = [],
): WeeklyLineup {
  return { week, teamId, slots, starters, bench };
}

const base = {
  id: 'test',
  name: 'Test League',
  platform: 'sleeper',
  season: 2026,
  draftType: 'snake',
  scoringType: 'ppr',
  totalTeams: 2,
  isLoaded: true,
  teams: [
    { id: 'A', name: 'Alpha' },
    { id: 'B', name: 'Beta' },
  ],
} as unknown as League;

describe('buildLineupEfficiency', () => {
  it('scores actual vs best-legal lineup and sorts best first', () => {
    // Alpha starts a 10-pt RB, benches a 20-pt WR who fits the FLEX.
    // Beta's starters are already optimal (100% efficient).
    const league = {
      ...base,
      status: 'live',
      currentWeek: 3,
      weeklyLineups: [
        lineup(1, 'A', ['RB', 'FLEX'], [p('r1', 'RB One', 'RB', 10), p('w1', 'WR One', 'WR', 5)], [
          p('w2', 'WR Two', 'WR', 20),
        ]),
        lineup(1, 'B', ['RB', 'FLEX'], [p('r2', 'RB Two', 'RB', 18), p('w3', 'WR Three', 'WR', 12)], [
          p('w4', 'WR Four', 'WR', 8),
        ]),
      ],
    } as League;
    const rows = buildLineupEfficiency(league);
    expect(rows).toHaveLength(2);
    // Beta: 30/30 = 100%, Alpha: 15/30 = 50%.
    expect(rows[0].teamId).toBe('B');
    expect(rows[0].efficiency).toBe(100);
    expect(rows[1].teamId).toBe('A');
    expect(rows[1].efficiency).toBe(50);
    expect(rows[1].actual).toBe(15);
    expect(rows[1].best).toBe(30);
    expect(rows[1].leftOnBench).toBe(15);
    expect(rows[1].weeks).toBe(1);
    expect(rows[1].teamName).toBe('Alpha');
  });

  it('accumulates multiple completed weeks per team', () => {
    const l = (w: number, starters: (LineupPlayer | null)[]) =>
      lineup(w, 'A', ['QB'], starters);
    const league = { ...base, status: 'live', currentWeek: 4, weeklyLineups: [
      l(1, [p('q1', 'QB One', 'QB', 20)]),
      l(2, [p('q1', 'QB One', 'QB', 10)]),
    ] } as League;
    const rows = buildLineupEfficiency(league);
    expect(rows).toHaveLength(1);
    expect(rows[0].weeks).toBe(2);
    expect(rows[0].actual).toBe(30);
    expect(rows[0].best).toBe(30);
    expect(rows[0].efficiency).toBe(100);
  });

  it('excludes the in-progress week of a live league', () => {
    const l = (w: number, benchPts: number) =>
      lineup(w, 'A', ['QB'], [p('q1', 'QB One', 'QB', 20)], [p('q2', 'QB Two', 'QB', benchPts)]);
    const league = { ...base, status: 'live', currentWeek: 2, weeklyLineups: [l(1, 5), l(2, 99)] } as League;
    const rows = buildLineupEfficiency(league);
    // Week 1 only: 20/20 = 100%. Week 2's bench QB (99 pts, partial score)
    // must not drag the efficiency down.
    expect(rows).toHaveLength(1);
    expect(rows[0].weeks).toBe(1);
    expect(rows[0].efficiency).toBe(100);
  });

  it('skips weeks with unknown slot types instead of tanking the season', () => {
    const league = {
      ...base,
      status: 'final',
      weeklyLineups: [
        lineup(1, 'A', ['WEIRD_SLOT'], [p('q1', 'QB One', 'QB', 20)]),
        lineup(2, 'A', ['QB'], [p('q1', 'QB One', 'QB', 10)]),
      ],
    } as League;
    const rows = buildLineupEfficiency(league);
    expect(rows).toHaveLength(1);
    expect(rows[0].weeks).toBe(1);
    expect(rows[0].actual).toBe(10);
  });

  it('returns [] without lineups, and in best-ball leagues', () => {
    expect(buildLineupEfficiency(base)).toEqual([]);
    expect(
      buildLineupEfficiency({
        ...base,
        isBestBall: true,
        weeklyLineups: [
          lineup(1, 'A', ['QB'], [p('q1', 'QB One', 'QB', 20)]),
        ],
      } as League),
    ).toEqual([]);
  });

  it('excludes teams with no scoreable weeks', () => {
    const league = {
      ...base,
      status: 'final',
      weeklyLineups: [
        lineup(1, 'A', ['WEIRD_SLOT'], [p('q1', 'QB One', 'QB', 20)]),
        lineup(2, 'B', ['QB'], [p('q2', 'QB Two', 'QB', 10)]),
      ],
    } as League;
    const rows = buildLineupEfficiency(league);
    expect(rows.map(r => r.teamId)).toEqual(['B']);
  });
});
