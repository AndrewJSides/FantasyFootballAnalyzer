import { describe, expect, it } from 'vitest';
import { buildHeadToHead, seriesHeadline } from './headToHead';
import type { WeeklyMatchup } from '@/types';

const mk = (week: number, team1Id: string, team1Points: number, team2Id: string, team2Points: number): WeeklyMatchup => ({
  week, team1Id, team1Points, team2Id, team2Points,
});

describe('buildHeadToHead', () => {
  it('returns an empty record when the teams have never met', () => {
    const h = buildHeadToHead('A', 'B', [mk(1, 'A', 120, 'C', 110)]);
    expect(h.games).toBe(0);
    expect(h.lastMeeting).toBeNull();
    expect(seriesHeadline(h, 'Alpha', 'Beta')).toBe('No meetings yet');
  });

  it('counts wins from both team slots and names the leader', () => {
    const h = buildHeadToHead('A', 'B', [
      mk(1, 'A', 120.5, 'B', 110.2),
      mk(5, 'B', 130.0, 'A', 125.4),
      mk(8, 'A', 99.0, 'B', 101.3),
    ]);
    expect(h.games).toBe(3);
    expect(h.aWins).toBe(1);
    expect(h.bWins).toBe(2);
    expect(h.ties).toBe(0);
    expect(seriesHeadline(h, 'Alpha', 'Beta')).toBe('Beta leads 2–1');
    expect(h.lastMeeting).toEqual({ week: 8, aScore: 99.0, bScore: 101.3 });
    expect(h.lastMeetingWinner).toBe('b');
  });

  it('names a tied series without a leader', () => {
    const h = buildHeadToHead('A', 'B', [
      mk(1, 'A', 120, 'B', 110),
      mk(4, 'B', 121, 'A', 111),
    ]);
    expect(seriesHeadline(h, 'Alpha', 'Beta')).toBe('Tied 1–1');
  });

  it('counts ties as ties, not wins', () => {
    const h = buildHeadToHead('A', 'B', [mk(2, 'A', 115.0, 'B', 115.0)]);
    expect(h.games).toBe(1);
    expect(h.ties).toBe(1);
    expect(h.lastMeetingWinner).toBe('tie');
    expect(h.streak).toBe(0);
    expect(h.streakSide).toBeNull();
  });

  it('tracks the current win streak from the most recent game backward', () => {
    const h = buildHeadToHead('A', 'B', [
      mk(1, 'A', 120, 'B', 110),
      mk(3, 'A', 118, 'B', 112),
      mk(5, 'A', 122, 'B', 119),
      mk(9, 'B', 130, 'A', 128), // most recent: B wins, resets to B's streak of 1
    ]);
    expect(h.streakSide).toBe('b');
    expect(h.streak).toBe(1);
  });

  it('extends a streak across several consecutive wins', () => {
    const h = buildHeadToHead('A', 'B', [
      mk(1, 'B', 120, 'A', 110),
      mk(3, 'A', 118, 'B', 112),
      mk(5, 'A', 122, 'B', 119),
    ]);
    expect(h.streakSide).toBe('a');
    expect(h.streak).toBe(2);
  });

  it('ignores matchups that do not involve both teams', () => {
    const h = buildHeadToHead('A', 'B', [mk(1, 'A', 120, 'C', 90), mk(2, 'D', 100, 'B', 80)]);
    expect(h.games).toBe(0);
  });

  it('guards against a team matched against itself', () => {
    const h = buildHeadToHead('A', 'A', [mk(1, 'A', 120, 'A', 110)]);
    expect(h.games).toBe(0);
  });
});
