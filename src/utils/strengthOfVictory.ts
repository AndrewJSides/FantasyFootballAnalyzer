// Strength of victory — backlog item 96: the combined win % of the teams
// each fantasy team actually beat, the NFL's quality-of-wins tiebreaker,
// answering "were his wins legit or padded by beating weak teams".
//
// Competitor source: the NFL's official tiebreaking procedures, which list
// strength of victory ("the combined winning percentage of all opponents a
// team defeated") ahead of strength of schedule (public descriptions only,
// e.g. https://www.crunchsports.com/nfl-guides/nfl-playoff-picture-tiebreakers-explained/).
// Implemented from TraderApe's own data (the synced completed-week matchup
// scores), no copied content.
//
// Opponent records are derived from the same completed weeks (ties count as
// half a win, the NFL convention); beating the same opponent twice counts
// twice, and the live current week is excluded via completedMatchups, so a
// half-played game never moves anyone's number. Returns one row per team
// that played a completed week; teams with no wins get sovPct null.

import type { League } from '@/types';
import { formatRecord } from './allPlayRecord';
import { completedMatchups } from './completedMatchups';

export interface StrengthOfVictoryRow {
  teamId: string;
  teamName: string;
  /** Wins counted toward SOV — beating the same opponent twice counts twice. */
  wins: number;
  /** Mean defeated-opponent win %, one decimal; null when the team has no wins. */
  sovPct: number | null;
  /** Combined record of the defeated opponents (e.g. "4-3-1"), for hover/aria detail. */
  opponentsCombined: string;
  /** The read on the win quality: quality ≥55%, soft ≤45%, else balanced. */
  verdict: 'quality' | 'balanced' | 'soft' | 'none';
}

export const SOV_VERDICT_LABEL: Record<StrengthOfVictoryRow['verdict'], string> = {
  quality: 'quality wins',
  balanced: 'balanced',
  soft: 'soft schedule',
  none: 'no wins yet',
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildStrengthOfVictory(
  league: Pick<League, 'matchups' | 'status' | 'currentWeek' | 'teams'>,
): StrengthOfVictoryRow[] {
  const matchups = completedMatchups(league);
  if (matchups.length === 0) return [];

  const records = new Map<string, { w: number; l: number; t: number }>();
  const recordOf = (id: string) => {
    let r = records.get(id);
    if (!r) {
      r = { w: 0, l: 0, t: 0 };
      records.set(id, r);
    }
    return r;
  };

  const winsOver: Array<{ winnerId: string; loserId: string }> = [];
  for (const m of matchups) {
    const a = recordOf(m.team1Id);
    const b = recordOf(m.team2Id);
    if (m.team1Points > m.team2Points) {
      a.w += 1;
      b.l += 1;
      winsOver.push({ winnerId: m.team1Id, loserId: m.team2Id });
    } else if (m.team1Points < m.team2Points) {
      b.w += 1;
      a.l += 1;
      winsOver.push({ winnerId: m.team2Id, loserId: m.team1Id });
    } else {
      a.t += 1;
      b.t += 1;
    }
  }

  const winPct = (id: string) => {
    const r = records.get(id)!;
    const games = r.w + r.l + r.t;
    return games > 0 ? (r.w + 0.5 * r.t) / games : 0;
  };

  const beaten = new Map<string, string[]>();
  for (const { winnerId, loserId } of winsOver) {
    const list = beaten.get(winnerId) ?? [];
    list.push(loserId);
    beaten.set(winnerId, list);
  }

  const teams = new Map(league.teams.map(t => [t.id, t]));
  const rows: StrengthOfVictoryRow[] = [];
  for (const [id] of records) {
    const foes = beaten.get(id) ?? [];
    let ow = 0;
    let ol = 0;
    let ot = 0;
    for (const fid of foes) {
      const r = records.get(fid)!;
      ow += r.w;
      ol += r.l;
      ot += r.t;
    }
    const sovPct =
      foes.length > 0
        ? round1((foes.reduce((sum, fid) => sum + winPct(fid), 0) / foes.length) * 100)
        : null;
    rows.push({
      teamId: id,
      teamName: teams.get(id)?.name ?? id,
      wins: foes.length,
      sovPct,
      opponentsCombined: formatRecord(ow, ol, ot),
      verdict:
        sovPct == null ? 'none' : sovPct >= 55 ? 'quality' : sovPct <= 45 ? 'soft' : 'balanced',
    });
  }

  rows.sort(
    (a, b) => (b.sovPct ?? -1) - (a.sovPct ?? -1) || a.teamName.localeCompare(b.teamName),
  );
  return rows;
}
