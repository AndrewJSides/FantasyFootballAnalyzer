import { describe, it, expect } from 'vitest';
import { timeAgo } from './relativeTime';

const NOW = Date.parse('2026-10-30T23:00:00Z');

describe('timeAgo', () => {
  it('says "just now" under a minute', () => {
    expect(timeAgo('2026-10-30T22:59:30Z', NOW)).toBe('just now');
  });

  it('uses minutes under an hour', () => {
    expect(timeAgo('2026-10-30T22:45:00Z', NOW)).toBe('15m ago');
  });

  it('uses hours under a day', () => {
    expect(timeAgo('2026-10-30T19:00:00Z', NOW)).toBe('4h ago');
  });

  it('uses days beyond a day', () => {
    expect(timeAgo('2026-10-27T23:00:00Z', NOW)).toBe('3d ago');
  });

  it('falls back to the raw string for invalid or future timestamps', () => {
    expect(timeAgo('not-a-date', NOW)).toBe('not-a-date');
    expect(timeAgo('2026-10-31T23:00:00Z', NOW)).toBe(
      '2026-10-31T23:00:00Z',
    );
  });
});
