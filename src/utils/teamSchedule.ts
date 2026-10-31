// Team season schedule (backlog item 47): one team's full fixture list —
// past weeks' opponent + result + score from completed-week matchups,
// remaining weeks' opponent + per-game win probability from the future
// schedule and the Playoff Race's shrunk-rating model, priced analytically
// (no extra sim cost) via gameWinProb.

import type { League } from '@/types';
import { completedMatchups } from '@/utils/completedMatchups';
import { gameWinProb } from '@/utils/playoffOdds';

export interface PastGame {
  week: number;
  opponentId: string;
  opponentName: string;
  teamScore: number;
  oppScore: number;
  result: 'W' | 'L' | 'T';
}

export interface FutureGame {
  week: number;
  opponentId: string;
  opponentName: string;
  /** 0..100, one decimal — the model's probability this team wins the game. */
  winProb: number;
}

export interface TeamSchedule {
  past: PastGame[];
  future: FutureGame[];
}

type LeagueInput = Pick<
  League,
  'teams' | 'matchups' | 'status' | 'currentWeek' | 'futureSchedule'
>;

/** One team's season fixture list: past results + upcoming opponents. */
export function buildTeamSchedule(league: LeagueInput, teamId: string): TeamSchedule {
  const nameOf = (id: string) =>
    league.teams.find(t => t.id === id)?.name ?? `Team ${id}`;

  const past: PastGame[] = [];
  for (const m of completedMatchups(league)) {
    const isT1 = m.team1Id === teamId;
    if (!isT1 && m.team2Id !== teamId) continue;
    const teamScore = isT1 ? m.team1Points : m.team2Points;
    const oppScore = isT1 ? m.team2Points : m.team1Points;
    if (teamScore === 0 && oppScore === 0) continue;
    past.push({
      week: m.week,
      opponentId: isT1 ? m.team2Id : m.team1Id,
      opponentName: nameOf(isT1 ? m.team2Id : m.team1Id),
      teamScore,
      oppScore,
      result: teamScore > oppScore ? 'W' : oppScore > teamScore ? 'L' : 'T',
    });
  }
  past.sort((a, b) => a.week - b.week);

  const cur = league.currentWeek;
  const future: FutureGame[] = (league.futureSchedule ?? [])
    .filter(m => m.team1Id === teamId || m.team2Id === teamId)
    .filter(m => !cur || m.week >= cur)
    .map(m => {
      const opponentId = m.team1Id === teamId ? m.team2Id : m.team1Id;
      return {
        week: m.week,
        opponentId,
        opponentName: nameOf(opponentId),
        winProb: gameWinProb(league, teamId, opponentId),
      };
    })
    .sort((a, b) => a.week - b.week);

  return { past, future };
}
