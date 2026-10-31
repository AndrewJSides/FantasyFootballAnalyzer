// League Record Book — backlog item 60: the season's extremes in one place:
// highest/lowest single-week scores, biggest blowout, closest game, and the
// longest win/loss streaks, all from this season's completed-week matchups.
//
// Competitor source: Sleeper's league records and Yahoo's league history
// "records" view (public feature descriptions only — e.g. Sleeper publishes
// per-season all-time single-week highs and biggest blowouts). TraderApe's
// Season Story already names each week's blowout/squeaker, but nothing kept
// the season-long record book. Implemented from TraderApe's own
// completed-week matchup scores, no copied content.
//
// Hides itself (returns null) when the sync fetched no matchups (old
// snapshots, guest mode) or no week is complete yet. The live current week
// is excluded, mirroring completedMatchups: partial scores would crown a
// half-played game as the season high.

import type { League } from '@/types';
import { completedMatchups } from './completedMatchups';

export interface RecordEntry {
  teamId: string;
  teamName: string;
  week: number;
  points: number;
}

export interface GameRecord {
  week: number;
  winnerId: string;
  winnerName: string;
  winnerPoints: number;
  loserId: string;
  loserName: string;
  loserPoints: number;
  /** winnerPoints - loserPoints, one decimal. */
  margin: number;
  /** True when the game was a tie (margin 0). */
  tie: boolean;
}

export interface StreakRecord {
  teamId: string;
  teamName: string;
  /** Number of consecutive wins (or losses). */
  length: number;
  /** First and last week of the streak. */
  fromWeek: number;
  toWeek: number;
}

export interface RecordBook {
  highestWeek: RecordEntry;
  lowestWeek: RecordEntry;
  biggestBlowout: GameRecord;
  closestGame: GameRecord;
  longestWinStreak: StreakRecord;
  longestLossStreak: StreakRecord;
  /** Number of completed weeks priced, for the footnote. */
  weeks: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function recordEntry(
  teams: Map<string, { id: string; name: string }>,
  teamId: string,
  week: number,
  points: number,
): RecordEntry {
  const team = teams.get(teamId);
  return { teamId, teamName: team?.name ?? teamId, week, points: round1(points) };
}

export function buildRecordBook(
  league: Pick<League, 'matchups' | 'status' | 'currentWeek' | 'teams'>,
): RecordBook | null {
  const matchups = completedMatchups(league);
  if (matchups.length === 0) return null;

  const teams = new Map(league.teams.map(t => [t.id, t]));
  const weeks = new Set<number>();

  let highest: RecordEntry | null = null;
  let lowest: RecordEntry | null = null;
  let biggestBlowout: GameRecord | null = null;
  let closestGame: GameRecord | null = null;

  // Per-team result sequences, in week order, for streaks.
  const results = new Map<string, { week: number; won: boolean; lost: boolean }[]>();

  for (const m of matchups) {
    weeks.add(m.week);
    for (const [id, pts] of [
      [m.team1Id, m.team1Points],
      [m.team2Id, m.team2Points],
    ] as const) {
      const entry = recordEntry(teams, id, m.week, pts);
      if (!highest || pts > highest.points) highest = entry;
      if (!lowest || pts < lowest.points) lowest = entry;
    }

    const margin = round1(Math.abs(m.team1Points - m.team2Points));
    const [winnerId, winnerPts, loserId, loserPts] =
      m.team1Points >= m.team2Points
        ? [m.team1Id, m.team1Points, m.team2Id, m.team2Points]
        : [m.team2Id, m.team2Points, m.team1Id, m.team1Points];
    const game: GameRecord = {
      week: m.week,
      winnerId,
      winnerName: teams.get(winnerId)?.name ?? winnerId,
      winnerPoints: round1(winnerPts),
      loserId,
      loserName: teams.get(loserId)?.name ?? loserId,
      loserPoints: round1(loserPts),
      margin,
      tie: margin === 0,
    };
    if (!biggestBlowout || margin > biggestBlowout.margin) biggestBlowout = game;
    if (!closestGame || margin < closestGame.margin) closestGame = game;

    // Streak sequences: a tie ends both streaks, so it counts as neither.
    for (const [id, won, lost] of [
      [m.team1Id, m.team1Points > m.team2Points, m.team1Points < m.team2Points],
      [m.team2Id, m.team2Points > m.team1Points, m.team2Points < m.team1Points],
    ] as const) {
      let seq = results.get(id);
      if (!seq) {
        seq = [];
        results.set(id, seq);
      }
      seq.push({ week: m.week, won, lost });
    }
  }

  // Longest streaks: each team's results in week order; ties reset.
  let longestWin: StreakRecord | null = null;
  let longestLoss: StreakRecord | null = null;
  for (const [id, seq] of results) {
    const sorted = [...seq].sort((a, b) => a.week - b.week);
    let winLen = 0;
    let winFrom = 0;
    let lossLen = 0;
    let lossFrom = 0;
    const team = teams.get(id);
    const name = team?.name ?? id;
    for (const r of sorted) {
      if (r.won) {
        if (winLen === 0) winFrom = r.week;
        winLen += 1;
        if (!longestWin || winLen > longestWin.length) {
          longestWin = { teamId: id, teamName: name, length: winLen, fromWeek: winFrom, toWeek: r.week };
        }
      } else {
        winLen = 0;
      }
      if (r.lost) {
        if (lossLen === 0) lossFrom = r.week;
        lossLen += 1;
        if (!longestLoss || lossLen > longestLoss.length) {
          longestLoss = { teamId: id, teamName: name, length: lossLen, fromWeek: lossFrom, toWeek: r.week };
        }
      } else {
        lossLen = 0;
      }
    }
  }

  // A season of nothing but ties is practically impossible, but a null
  // streak must never crash the page: fall back to a zero-length record.
  const noStreak = (): StreakRecord => ({
    teamId: '',
    teamName: '—',
    length: 0,
    fromWeek: 0,
    toWeek: 0,
  });

  return {
    highestWeek: highest!,
    lowestWeek: lowest!,
    biggestBlowout: biggestBlowout!,
    closestGame: closestGame!,
    longestWinStreak: longestWin ?? noStreak(),
    longestLossStreak: longestLoss ?? noStreak(),
    weeks: weeks.size,
  };
}
