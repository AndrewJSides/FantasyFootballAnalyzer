// buildPlayerAges (backlog item 177): age math + join logic for the
// dynasty age file. The network fetch itself isn't tested here.

import { describe, it, expect } from 'vitest';
import { ageOn, buildAges } from './buildPlayerAges';

describe('ageOn', () => {
  it('counts full years lived on the reference date', () => {
    expect(ageOn('2000-09-01', '2026-09-01')).toBe(26);
    // Birthday later in the year hasn't happened yet.
    expect(ageOn('2000-09-02', '2026-09-01')).toBe(25);
    // Birthday earlier in the year has happened.
    expect(ageOn('2000-08-31', '2026-09-01')).toBe(26);
  });

  it('rejects unparseable dates', () => {
    expect(ageOn('', '2026-09-01')).toBeNull();
    expect(ageOn('not-a-date', '2026-09-01')).toBeNull();
    expect(ageOn('2000-13-01', '2026-09-01')).toBeNull();
  });
});

describe('buildAges', () => {
  const players = {
    '1': { birth_date: '2001-03-15' },
    '2': { birth_date: '1998-11-30' },
    '3': {},
    '4': { birth_date: 'garbage' },
  };

  it('ages the ids it can and skips the rest', () => {
    expect(buildAges(players, ['1', '2', '3', '4', '9'], '2026-09-01')).toEqual({
      '1': 25,
      '2': 27,
    });
  });

  it('skips implausible ages', () => {
    expect(
      buildAges({ '5': { birth_date: '2015-01-01' } }, ['5'], '2026-09-01'),
    ).toEqual({});
  });
});
