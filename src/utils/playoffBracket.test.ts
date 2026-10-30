import { describe, it, expect } from 'vitest';
import { buildPlayoffBracket, type BracketSeedSource } from './playoffBracket';

function entry(
  id: string,
  name: string,
  seed: number,
  prob: number,
  wins = 0,
): BracketSeedSource {
  return {
    teamId: id,
    teamName: name,
    projectedSeed: seed,
    playoffProb: prob,
    wins,
  };
}

const six = [
  entry('a', 'Alpha', 1.1, 100),
  entry('b', 'Beta', 2.0, 99),
  entry('c', 'Gamma', 3.2, 92),
  entry('d', 'Delta', 4.1, 80),
  entry('e', 'Epsilon', 5.0, 66),
  entry('f', 'Zeta', 5.9, 61),
  entry('g', 'Eta', 8.5, 0), // eliminated: never enters the bracket
  entry('h', 'Theta', 7.7, 0),
];

describe('buildPlayoffBracket', () => {
  it('pairs a 6-team bracket 3v6 / 4v5 with byes for seeds 1 and 2', () => {
    const rounds = buildPlayoffBracket(six, 6);
    expect(rounds.map(r => r.label)).toEqual([
      'Quarterfinals',
      'Semifinals',
      'Final',
    ]);
    const [qf1, qf2] = rounds[0].matchups;
    expect([qf1.slotA.seed, qf1.slotB.seed]).toEqual([3, 6]);
    expect(qf1.slotA.name).toBe('Gamma');
    expect(qf1.slotB.name).toBe('Zeta');
    expect([qf2.slotA.seed, qf2.slotB.seed]).toEqual([4, 5]);
    // Higher seed is favored.
    expect(qf1.favoredTeamId).toBe('c');
    expect(qf2.favoredTeamId).toBe('d');
    const [sf1, sf2] = rounds[1].matchups;
    expect(sf1.slotA.name).toBe('Alpha');
    expect(sf1.slotB.name).toBe('Winner of 4 vs 5');
    expect(sf2.slotA.name).toBe('Beta');
    expect(sf2.slotB.name).toBe('Winner of 3 vs 6');
    expect(sf1.favoredTeamId).toBeNull();
    expect(rounds[2].matchups).toHaveLength(1);
  });

  it('pairs a 4-team bracket 1v4 / 2v3', () => {
    const rounds = buildPlayoffBracket(six.slice(0, 4), 4);
    expect(rounds.map(r => r.label)).toEqual(['Semifinals', 'Final']);
    const [s1, s2] = rounds[0].matchups;
    expect([s1.slotA.seed, s1.slotB.seed]).toEqual([1, 4]);
    expect([s2.slotA.seed, s2.slotB.seed]).toEqual([2, 3]);
    expect(s1.favoredTeamId).toBe('a');
    expect(rounds[1].matchups[0].slotA.name).toBe('Winner of 1 vs 4');
  });

  it('plays a 2-team bracket as a single final', () => {
    const rounds = buildPlayoffBracket(six.slice(0, 2), 2);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].label).toBe('Final');
    expect(rounds[0].matchups[0].favoredTeamId).toBe('a');
  });

  it('orders by mean seed with playoff odds breaking ties', () => {
    const tied = [
      entry('x', 'X', 2.0, 70),
      entry('y', 'Y', 2.0, 90),
      entry('z', 'Z', 1.0, 100),
      entry('w', 'W', 3.0, 50),
    ];
    const rounds = buildPlayoffBracket(tied, 4);
    const seeds = rounds[0].matchups.flatMap(m => [
      m.slotA.seed,
      m.slotB.seed,
    ]);
    expect(seeds).toContain(1);
    // Y (higher odds) takes seed 2 over X.
    const s1 = rounds[0].matchups[0];
    expect(s1.slotB.name).toBe('W'); // 1 vs 4
    expect(rounds[0].matchups[1].slotA.name).toBe('Y'); // 2 vs 3
    expect(rounds[0].matchups[1].slotB.name).toBe('X');
  });

  it('excludes 0%-odds teams and returns nothing when fewer than two qualify', () => {
    expect(buildPlayoffBracket(six.slice(6), 6)).toEqual([]);
    expect(buildPlayoffBracket(six.slice(0, 1), 6)).toEqual([]);
    expect(buildPlayoffBracket([], 6)).toEqual([]);
  });

  it('clips to the available qualifiers for unusual playoff sizes', () => {
    const rounds = buildPlayoffBracket(six.slice(0, 3), 6);
    expect(rounds[0].label).toBe('First round');
    const [m] = rounds[0].matchups;
    expect([m.slotA.seed, m.slotB.seed]).toEqual([1, 3]);
  });
});
