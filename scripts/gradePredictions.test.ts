import { describe, expect, it } from 'vitest';
import { weekGamesFinished, WEEK_FINISH_BUFFER_MS } from './gradePredictions';

const WK8: Record<string, string> = {
  GB: '2026-10-30T00:15Z', // Thu night
  KC: '2026-11-01T17:00Z', // Sun 1pm ET
  DAL: '2026-11-02T01:20Z', // SNF
  BUF: '2026-11-03T01:15Z', // MNF — latest
};
const weeks = { '8': WK8 };
const latest = Date.parse('2026-11-03T01:15Z');

describe('weekGamesFinished', () => {
  it('refuses mid-week: Sunday afternoon of week 8 is not finished', () => {
    // Sun Nov 1 18:33 UTC 2026 — exactly when the gate let the polluted
    // grade through. Sun 1pm games in progress, SNF + MNF still ahead.
    expect(weekGamesFinished(2026, 8, weeks, Date.parse('2026-11-01T18:33:38Z'))).toBe(false);
  });

  it('refuses right at kickoff of the last game', () => {
    expect(weekGamesFinished(2026, 8, weeks, latest)).toBe(false);
  });

  it('still refuses 3h59m after the last kickoff (game not over yet)', () => {
    expect(
      weekGamesFinished(2026, 8, weeks, latest + WEEK_FINISH_BUFFER_MS - 60_000),
    ).toBe(false);
  });

  it('passes once the buffer has elapsed', () => {
    expect(weekGamesFinished(2026, 8, weeks, latest + WEEK_FINISH_BUFFER_MS)).toBe(true);
    expect(
      weekGamesFinished(2026, 8, weeks, latest + WEEK_FINISH_BUFFER_MS + 1),
    ).toBe(true);
  });

  it('returns null when the week has no game-times entry (fallback week)', () => {
    expect(weekGamesFinished(2026, 9, weeks, latest + WEEK_FINISH_BUFFER_MS)).toBe(null);
  });

  it('returns null when weeks is undefined (missing file)', () => {
    expect(weekGamesFinished(2026, 8, undefined, Date.now())).toBe(null);
  });

  it('returns null for unparseable kickoffs', () => {
    expect(weekGamesFinished(2026, 8, { '8': { GB: 'not-a-date' } }, Date.now())).toBe(null);
  });
});
