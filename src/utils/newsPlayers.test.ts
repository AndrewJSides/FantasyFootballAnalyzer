import { describe, it, expect } from 'vitest';
import { matchNewsAthletes, indexPoolNames } from './newsPlayers';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

function poolPlayer(overrides: Partial<PoolPlayer>): PoolPlayer {
  return {
    id: 'pool-1',
    name: 'Josh Jacobs',
    team: 'GB',
    pos: 'RB',
    posRank: 5,
    overallRank: 12,
    tier: 2,
    bye: 5,
    baseValue: 40,
    ...overrides,
  } as PoolPlayer;
}

function pool(players: PoolPlayer[]): DraftPoolFile {
  return {
    season: 2026,
    generatedAt: '2026-10-30',
    baseline: { budget: 200, teams: 10, rounds: 16 },
    players,
  };
}

describe('matchNewsAthletes', () => {
  it('matches exact athlete names to pool players', () => {
    const p = poolPlayer({ id: 'jacobs' });
    const matched = matchNewsAthletes(['Josh Jacobs'], pool([p]));
    expect(matched.get('Josh Jacobs')).toBe(p);
  });

  it('normalizes case, punctuation, and suffixes', () => {
    const p = poolPlayer({ id: 'odell', name: "Odell Beckham Jr." });
    const matched = matchNewsAthletes(['odell beckham'], pool([p]));
    expect(matched.get('odell beckham')).toBe(p);
  });

  it('drops ambiguous names instead of guessing', () => {
    const a = poolPlayer({ id: 'a', name: 'Mike Williams', team: 'LAC' });
    const b = poolPlayer({ id: 'b', name: 'Mike Williams', team: 'NYJ' });
    const matched = matchNewsAthletes(['Mike Williams'], pool([a, b]));
    expect(matched.has('Mike Williams')).toBe(false);
  });

  it('omits names with no pool match', () => {
    const p = poolPlayer({ id: 'jacobs' });
    const matched = matchNewsAthletes(['Some Rookie'], pool([p]));
    expect(matched.size).toBe(0);
  });

  it('dedupes repeated names', () => {
    const p = poolPlayer({ id: 'jacobs' });
    const matched = matchNewsAthletes(
      ['Josh Jacobs', 'Josh Jacobs'],
      pool([p]),
    );
    expect(matched.size).toBe(1);
  });
});

describe('indexPoolNames', () => {
  it('marks ambiguous normalized names as null', () => {
    const index = indexPoolNames(
      pool([
        poolPlayer({ id: 'a', name: 'Mike Williams' }),
        poolPlayer({ id: 'b', name: 'Mike Williams' }),
      ]),
    );
    expect(index.get('mike williams')).toBeNull();
  });
});
