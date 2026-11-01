import { describe, expect, it } from 'vitest';
import {
  buildAllowedByWeek,
  buildOpponentMap,
  matchupContextForWeek,
} from './backtestMatchup';

const SCHEDULE = {
  '1': [
    ['KC', 'DEN'],
    ['SEA', 'SF'],
  ],
  '2': [
    ['KC', 'SEA'],
    ['DEN', 'SF'],
  ],
  '3': [['KC', 'SF']],
};

describe('buildOpponentMap', () => {
  it('maps each team to its opponent in both directions', () => {
    const map = buildOpponentMap(SCHEDULE);
    expect(map[1]['KC']).toBe('DEN');
    expect(map[1]['DEN']).toBe('KC');
    expect(map[2]['KC']).toBe('SEA');
    expect(map[3]['DEN']).toBeUndefined(); // bye week — no game
  });
});

const PLAYERS = {
  kcq: { team: 'KC', position: 'QB' },
  denwr: { team: 'DEN', position: 'WR' },
  seawr: { team: 'SEA', position: 'WR' },
  sfwr: { team: 'SF', position: 'WR' },
  dente: { team: 'DEN', position: 'TE' },
};

const STATS = {
  1: {
    kcq: { pts_ppr: 25 },
    denwr: { pts_ppr: 18 },
    seawr: { pts_ppr: 12 },
    sfwr: { pts_ppr: 30 },
  },
  2: {
    kcq: { pts_ppr: 20 },
    denwr: { pts_ppr: 8 },
    seawr: { pts_ppr: 22 },
    sfwr: { pts_ppr: 14 },
  },
};

describe('buildAllowedByWeek', () => {
  it('attributes scored points to the defending team', () => {
    const opp = buildOpponentMap(SCHEDULE);
    const allowed = buildAllowedByWeek(PLAYERS, STATS, opp);
    // Week 1: KC vs DEN — DEN allowed KC's 25 QB pts; KC allowed DEN's 18 WR pts
    expect(allowed[1]['DEN']['QB']).toBe(25);
    expect(allowed[1]['KC']['WR']).toBe(18);
  });

  it('gives teams on bye no entry', () => {
    const opp = buildOpponentMap(SCHEDULE);
    const statsW3 = { 3: { sfwr: { pts_ppr: 10 } } };
    const allowed = buildAllowedByWeek(PLAYERS, statsW3, opp);
    // Week 3: only KC vs SF — DEN and SEA are on bye
    expect(allowed[3]['DEN']).toBeUndefined();
    expect(allowed[3]['SF']['WR']).toBe(0);
  });
});

describe('matchupContextForWeek', () => {
  const opp = buildOpponentMap(SCHEDULE);
  const allowed = buildAllowedByWeek(PLAYERS, STATS, opp);

  it('averages only completed weeks before the target (no lookahead)', () => {
    // Week 3 target: KC plays SF. SF allowed 12 WR pts in week 1 (vs SEA)
    // and 8 in week 2 (vs DEN) — the target week itself contributes
    // nothing, and week 1 (the "current" week at replay time) is included.
    const ctx = matchupContextForWeek(3, 'KC', 'WR', opp, allowed);
    expect(ctx?.avgAllowed).toBe(10);
    // League average: 104 total WR pts allowed over 8 team-weeks = 13.0
    expect(ctx?.leagueAverage).toBe(13);
  });

  it('returns null with no completed-week history', () => {
    expect(matchupContextForWeek(1, 'KC', 'WR', opp, allowed)).toBeNull();
  });

  it('returns null when the target-week opponent is unknown (bye)', () => {
    // Week 3: DEN is on bye
    expect(matchupContextForWeek(3, 'DEN', 'WR', opp, allowed)).toBeNull();
  });

  it('returns null for positions without a matchup term (K/DST)', () => {
    expect(matchupContextForWeek(3, 'KC', 'K', opp, allowed)).toBeNull();
  });
});
