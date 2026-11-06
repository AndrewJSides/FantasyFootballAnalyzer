// Sole-back term backtest scoring tests (backlog item 137, remainder).
//
// Fixture numbers are the real week-8 grade (2026-week8-sleeper.json) for
// the six RBs whose same-team RB mate scored 0 while the team played:
// Pollard (Spears out), Swift (Monangai out), Stevenson (Henderson out),
// Allen (Hall out), Dobbins (Harvey out), Walker (Wilson out). Terms are
// what soleBackMap computes from weeks 1–7 usage/points (mate recent-3
// usage × lead pts/opp, capped at +10).
import { describe, it, expect } from 'vitest';
import {
  scoreSoleBackTerm,
  type SoleBackGradeEntry,
} from './soleBackBacktest';

const WEEK8_CASES: SoleBackGradeEntry[] = [
  { player_id: '5967', predicted: 12.2, actual: 28.7 }, // Pollard
  { player_id: '6790', predicted: 13.02, actual: 27.9 }, // Swift
  { player_id: '7611', predicted: 10.57, actual: 12.0 }, // Stevenson
  { player_id: '11576', predicted: 9.82, actual: 23.3 }, // Allen
  { player_id: '6806', predicted: 5.59, actual: 1.3 }, // Dobbins
  { player_id: '8151', predicted: 20.78, actual: 12.4 }, // Walker
];

const WEEK8_TERMS = new Map<string, number>([
  ['5967', 3.7],
  ['6790', 10],
  ['7611', 5.2],
  ['11576', 10],
  ['6806', 3.8],
  ['8151', 10],
]);

// Two unaffected graded players, so the overall MAE is computable.
const UNAFFECTED: SoleBackGradeEntry[] = [
  { player_id: 'x1', predicted: 10, actual: 12 },
  { player_id: 'x2', predicted: 20, actual: 15 },
];

describe('scoreSoleBackTerm', () => {
  it('scores each case and the aggregates from the week-8 fixture', () => {
    const r = scoreSoleBackTerm([...WEEK8_CASES, ...UNAFFECTED], WEEK8_TERMS);
    expect(r.gradedCount).toBe(8);
    expect(r.cases).toHaveLength(6);
    // Pollard 16.5 -> 12.8, Swift 14.88 -> 4.88, Stevenson 1.43 -> 3.77,
    // Allen 13.48 -> 3.48, Dobbins 4.29 -> 8.09, Walker 8.38 -> 18.38.
    expect(r.cases.map(c => c.errorAfter)).toEqual([12.8, 4.88, 3.77, 3.48, 8.09, 18.38]);
    // Affected MAE 9.83 -> 8.57; overall (8 players) 8.25 -> 7.3.
    expect(r.affectedMaeBefore).toBe(9.83);
    expect(r.affectedMaeAfter).toBe(8.57);
    expect(r.overallMaeBefore).toBe(8.25);
    expect(r.overallMaeAfter).toBe(7.3);
    expect(r.fold).toBe(true);
  });

  it('scores the injury-gated subset (Pollard, Swift, Allen) — all three improve', () => {
    const gated = new Map<string, number>([
      ['5967', 3.7],
      ['6790', 10],
      ['11576', 10],
    ]);
    const r = scoreSoleBackTerm([...WEEK8_CASES, ...UNAFFECTED], gated);
    expect(r.cases).toHaveLength(3);
    // Affected MAE 14.95 -> 7.05; overall 8.25 -> 5.28.
    expect(r.affectedMaeBefore).toBe(14.95);
    expect(r.affectedMaeAfter).toBe(7.05);
    expect(r.overallMaeBefore).toBe(8.25);
    expect(r.overallMaeAfter).toBe(5.28);
    expect(r.fold).toBe(true);
  });

  it('refuses to fold when the term hurts the affected players', () => {
    const r = scoreSoleBackTerm(
      [{ player_id: 'a', predicted: 10, actual: 12 }],
      new Map([['a', 10]]),
    );
    expect(r.affectedMaeBefore).toBe(2);
    expect(r.affectedMaeAfter).toBe(8);
    expect(r.fold).toBe(false);
  });

  it('refuses to fold with no cases — no evidence, no priced term', () => {
    const r = scoreSoleBackTerm(UNAFFECTED, new Map());
    expect(r.cases).toHaveLength(0);
    expect(r.fold).toBe(false);
  });

  it('ignores terms for players who were not graded', () => {
    const r = scoreSoleBackTerm(UNAFFECTED, new Map([['ghost', 10]]));
    expect(r.cases).toHaveLength(0);
    expect(r.overallMaeBefore).toBe(r.overallMaeAfter);
  });
});
