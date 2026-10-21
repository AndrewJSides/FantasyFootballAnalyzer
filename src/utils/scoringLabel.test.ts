import { describe, it, expect } from 'vitest';
import { scoringLabel } from './scoringLabel';

describe('scoringLabel', () => {
  it('returns the capitalized label each scoring select shows', () => {
    expect(scoringLabel('ppr')).toBe('PPR');
    expect(scoringLabel('half_ppr')).toBe('Half PPR');
    expect(scoringLabel('standard')).toBe('Standard');
  });

  it('falls back to the old replace form for unknown values', () => {
    expect(scoringLabel('custom')).toBe('custom');
    expect(scoringLabel('weird_scoring')).toBe('weird scoring');
  });
});
