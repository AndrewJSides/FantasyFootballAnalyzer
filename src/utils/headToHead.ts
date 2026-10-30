// Head-to-head series history (backlog item 32): this season's series
// record between two teams from completed-week matchups — the same
// "Head-to-Head: A leads 4-3" line Yahoo/ESPN matchup pages show, priced
// on TraderApe's own stored matchup data.

import type { WeeklyMatchup } from '@/types';

export interface HeadToHead {
  /** Completed games between the two teams this season. */
  games: number;
  aWins: number;
  bWins: number;
  ties: number;
  lastMeeting: { week: number; aScore: number; bScore: number } | null;
  lastMeetingWinner: 'a' | 'b' | 'tie' | null;
  /** Which side holds the current win streak ('a'/'b'), or null when the
   *  last game was a tie or they haven't met. */
  streakSide: 'a' | 'b' | null;
  streak: number;
}

/** Winner of one game from side a's perspective. */
function result(aScore: number, bScore: number): 'a' | 'b' | 'tie' {
  if (aScore > bScore) return 'a';
  if (bScore > aScore) return 'b';
  return 'tie';
}

/**
 * Build the series record between teamA and teamB from completed-week
 * matchups. `matchups` should already be filtered to completed weeks
 * (see completedMatchups).
 */
export function buildHeadToHead(
  teamAId: string,
  teamBId: string,
  matchups: WeeklyMatchup[],
): HeadToHead {
  const empty: HeadToHead = {
    games: 0, aWins: 0, bWins: 0, ties: 0,
    lastMeeting: null, lastMeetingWinner: null,
    streakSide: null, streak: 0,
  };
  if (teamAId === teamBId) return empty;

  const between = matchups
    .filter(
      m =>
        (m.team1Id === teamAId && m.team2Id === teamBId) ||
        (m.team1Id === teamBId && m.team2Id === teamAId),
    )
    .sort((x, y) => x.week - y.week);

  for (const m of between) {
    const aScore = m.team1Id === teamAId ? m.team1Points : m.team2Points;
    const bScore = m.team1Id === teamAId ? m.team2Points : m.team1Points;
    const w = result(aScore, bScore);
    empty.games += 1;
    if (w === 'a') empty.aWins += 1;
    else if (w === 'b') empty.bWins += 1;
    else empty.ties += 1;
    empty.lastMeeting = { week: m.week, aScore, bScore };
    empty.lastMeetingWinner = w;
  }

  // Current win streak, counted from the most recent game backward; a tie
  // or no games ends the streak at zero.
  if (between.length > 0) {
    const recent = [...between].reverse();
    for (const m of recent) {
      const aScore = m.team1Id === teamAId ? m.team1Points : m.team2Points;
      const bScore = m.team1Id === teamAId ? m.team2Points : m.team1Points;
      const w = result(aScore, bScore);
      if (w === 'tie') break;
      if (empty.streak === 0) {
        empty.streakSide = w;
        empty.streak = 1;
      } else if (w === empty.streakSide) {
        empty.streak += 1;
      } else {
        break;
      }
    }
  }

  return empty;
}

/**
 * One-line series headline from side a's perspective, e.g.
 * "Team A leads 2–1" / "Tied 2–2" / "No meetings yet".
 */
export function seriesHeadline(h: HeadToHead, aName: string, bName: string): string {
  if (h.games === 0) return 'No meetings yet';
  if (h.aWins === h.bWins) return `Tied ${h.aWins}–${h.bWins}`;
  const leader = h.aWins > h.bWins ? aName : bName;
  const w = Math.max(h.aWins, h.bWins);
  const l = Math.min(h.aWins, h.bWins);
  return `${leader} leads ${w}–${l}`;
}
