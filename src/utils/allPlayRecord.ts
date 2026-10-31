// All-play record — backlog item 54: each team's record if it had played
// every other team every week, answering "am I unlucky or bad". This is the
// same "Season All-Play" line fantasy tools publish alongside standings,
// priced entirely on TraderApe's own completed-week matchup scores, so no
// data source was copied and no copied content ships.
//
// Hides itself (returns []) when the sync fetched no matchups (old
// snapshots, guest mode) or no week is complete yet. The live current week
// is excluded, mirroring completedMatchups: partial scores would punish
// teams mid-week.

import type { League } from '@/types';
import { completedMatchups } from './completedMatchups';

export interface AllPlayRow {
  teamId: string;
  teamName: string;
  /** Completed weeks the team had a score for. */
  weeks: number;
  allWins: number;
  allLosses: number;
  allTies: number;
  /** (allWins + 0.5 * allTies) / (allWins + allLosses + allTies), one decimal percent. */
  allPlayPct: number;
  /** Actual W-L-T from the sync's season stats; nulls when the sync didn't report them. */
  actualWins: number | null;
  actualLosses: number | null;
  actualTies: number | null;
  /** actualPct (percent points) or null when the sync didn't report a record. */
  actualPct: number | null;
  /** actualPct - allPlayPct, one decimal; positive = the schedule helped him (lucky). */
  luckDiff: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Format a W-L-T record for display. */
export function formatRecord(
  wins: number | null,
  losses: number | null,
  ties: number | null,
): string {
  if (wins == null || losses == null) return '—';
  return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

export function buildAllPlayRecord(
  league: Pick<League, 'matchups' | 'status' | 'currentWeek' | 'teams'>,
): AllPlayRow[] {
  const matchups = completedMatchups(league);
  if (matchups.length === 0) return [];

  // Per-week score sheets: week -> teamId -> points. A team appears once
  // per week; playoff brackets or bye weeks leave some teams out, and those
  // weeks simply don't count for the missing team.
  const weeks = new Map<number, Map<string, number>>();
  for (const m of matchups) {
    let sheet = weeks.get(m.week);
    if (!sheet) {
      sheet = new Map();
      weeks.set(m.week, sheet);
    }
    sheet.set(m.team1Id, m.team1Points);
    sheet.set(m.team2Id, m.team2Points);
  }

  const tallies = new Map<string, { w: number; l: number; t: number; weeks: number }>();
  const tally = (id: string) => {
    let t = tallies.get(id);
    if (!t) {
      t = { w: 0, l: 0, t: 0, weeks: 0 };
      tallies.set(id, t);
    }
    return t;
  };

  for (const sheet of weeks.values()) {
    const entries = [...sheet.entries()];
    for (const [id, score] of entries) {
      const t = tally(id);
      t.weeks += 1;
      for (const [otherId, otherScore] of entries) {
        if (otherId === id) continue;
        if (score > otherScore) t.w += 1;
        else if (score < otherScore) t.l += 1;
        else t.t += 1;
      }
    }
  }

  const teams = new Map(league.teams.map(t => [t.id, t]));
  const rows: AllPlayRow[] = [];
  for (const [id, t] of tallies) {
    const team = teams.get(id);
    const games = t.w + t.l + t.t;
    const allPlayPct = games > 0 ? round1(((t.w + 0.5 * t.t) / games) * 100) : 0;
    const actualWins = team?.wins ?? null;
    const actualLosses = team?.losses ?? null;
    const actualTies = team?.ties ?? 0;
    const actualGames =
      actualWins != null && actualLosses != null
        ? actualWins + actualLosses + (team?.ties ?? 0)
        : 0;
    const actualPct =
      actualGames > 0
        ? round1(
            (((actualWins ?? 0) + 0.5 * (team?.ties ?? 0)) / actualGames) * 100,
          )
        : null;
    rows.push({
      teamId: id,
      teamName: team?.name ?? id,
      weeks: t.weeks,
      allWins: t.w,
      allLosses: t.l,
      allTies: t.t,
      allPlayPct,
      actualWins,
      actualLosses,
      actualTies,
      actualPct,
      luckDiff: actualPct != null ? round1(actualPct - allPlayPct) : null,
    });
  }

  rows.sort(
    (a, b) => b.allPlayPct - a.allPlayPct || b.allWins - a.allWins || b.weeks - a.weeks,
  );
  return rows;
}
