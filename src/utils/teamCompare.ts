// Team head-to-head comparison (backlog item 73): a side-by-side metric
// table for any two fantasy teams, priced on TraderApe's own engines —
// record, points, Power Rankings, luck, all-play, team grades, playoff
// race, series history, and remaining schedule. The competitor concept is
// FantasyPros' Lineup Assistant ("Compare your lineup side-by-side with
// your opponent") and the team-vs-team blocks on Yahoo/ESPN matchup pages
// (public feature descriptions only); every number here is TraderApe's own.

import type { League, Team } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { completedMatchups } from '@/utils/completedMatchups';
import { buildPowerRankings, type PowerRankingRow } from '@/utils/powerRankings';
import { buildAllPlayRecord, formatRecord, type AllPlayRow } from '@/utils/allPlayRecord';
import {
  calculateLuckMetrics,
  type LuckMetrics,
  type MatchupData,
} from '@/utils/luck';
import { buildTeamGrades, GRADE_POSITIONS, type TeamGrade } from '@/utils/teamGrades';
import { type PlayoffRaceEntry } from '@/utils/playoffOdds';
import { getPlayoffRace } from '@/utils/sharedPlayoffRace';
import { buildHeadToHead, seriesHeadline } from '@/utils/headToHead';

export type CompareEdge = 'a' | 'b' | 'tie' | 'none';

export interface CompareCell {
  /** Row label, e.g. "Power rating". */
  label: string;
  /** Cell text for team A / team B. */
  a: string;
  b: string;
  /** Hover/aria detail. */
  aTitle?: string;
  bTitle?: string;
  /** Which side wins this row; 'none' for informational rows (luck, schedule). */
  edge: CompareEdge;
}

export interface TeamComparison {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  rows: CompareCell[];
  /** e.g. "Alpha leads Beta 5–2 across 9 metrics". */
  edgeSummary: string;
}

const f1 = (n: number) => n.toFixed(1);

function winPct(wins: number, losses: number, ties: number): number {
  const total = wins + losses + ties;
  return total === 0 ? 0 : (wins + 0.5 * ties) / total;
}

function teamRecord(t: Team): string {
  return formatRecord(t.wins ?? null, t.losses ?? null, t.ties ?? null);
}

function powerRow(
  rows: PowerRankingRow[],
  teamId: string,
): PowerRankingRow | undefined {
  return rows.find(r => r.teamId === teamId);
}

function luckLabel(rating: LuckMetrics['luckRating']): string {
  switch (rating) {
    case 'very_lucky':
      return 'very lucky';
    case 'lucky':
      return 'lucky';
    case 'unlucky':
      return 'unlucky';
    case 'very_unlucky':
      return 'very unlucky';
    default:
      return 'neutral';
  }
}

function gradeSummary(g: TeamGrade): string {
  const groups = GRADE_POSITIONS.map(p => `${p} ${g.groups[p].letter}`).join(' · ');
  return `${g.overall} overall (${groups})`;
}

/**
 * Compare two teams side by side. Returns null when either team is missing
 * or both ids are the same. Rows whose data is absent for both teams are
 * skipped (the same hide-convention the Teams page sections use).
 */
export function buildTeamComparison(
  league: League,
  pool: DraftPoolFile | undefined,
  teamAId: string,
  teamBId: string,
): TeamComparison | null {
  if (teamAId === teamBId) return null;
  const teamById = new Map(league.teams.map(t => [t.id, t]));
  const teamA = teamById.get(teamAId);
  const teamB = teamById.get(teamBId);
  if (!teamA || !teamB) return null;

  const done = completedMatchups(league);
  const rows: CompareCell[] = [];

  // Record.
  {
    const aPct = winPct(teamA.wins ?? 0, teamA.losses ?? 0, teamA.ties ?? 0);
    const bPct = winPct(teamB.wins ?? 0, teamB.losses ?? 0, teamB.ties ?? 0);
    rows.push({
      label: 'Record',
      a: teamRecord(teamA),
      b: teamRecord(teamB),
      edge: aPct > bPct ? 'a' : bPct > aPct ? 'b' : 'tie',
    });
  }

  // Points for / against.
  {
    const aPF = teamA.pointsFor ?? 0;
    const bPF = teamB.pointsFor ?? 0;
    rows.push({
      label: 'Points for',
      a: f1(aPF),
      b: f1(bPF),
      edge: aPF > bPF ? 'a' : bPF > aPF ? 'b' : 'tie',
    });
    const aPA = teamA.pointsAgainst ?? 0;
    const bPA = teamB.pointsAgainst ?? 0;
    rows.push({
      label: 'Points against',
      a: f1(aPA),
      b: f1(bPA),
      aTitle: 'Lower is better — fewer points allowed to opponents',
      bTitle: 'Lower is better — fewer points allowed to opponents',
      edge: aPA < bPA ? 'a' : bPA < aPA ? 'b' : 'tie',
    });
  }

  // Power rankings.
  if (done.length > 0) {
    const rankings = buildPowerRankings(league);
    const aR = powerRow(rankings, teamAId);
    const bR = powerRow(rankings, teamBId);
    if (aR && bR) {
      const rankOf = (id: string) => rankings.findIndex(x => x.teamId === id) + 1;
      const trendLabel = (r: PowerRankingRow) =>
        r.trend === 'hot'
          ? 'hot last 3'
          : r.trend === 'cold'
            ? 'cold last 3'
            : 'steady last 3';
      const rankDelta = (r: PowerRankingRow, rank: number) => {
        if (r.priorWeekRank == null || r.priorWeekRank === rank) return '';
        return `, ${r.priorWeekRank > rank ? 'up' : 'down'} from #${r.priorWeekRank}`;
      };
      const cell = (r: PowerRankingRow) => `#${rankOf(r.teamId)} · ${f1(r.rating)}`;
      const aRank = rankOf(teamAId);
      const bRank = rankOf(teamBId);
      rows.push({
        label: 'Power rating',
        a: cell(aR),
        b: cell(bR),
        aTitle: `${teamA.name}: rating ${f1(aR.rating)}, avg ${f1(aR.avg)} pts/wk, ${trendLabel(aR)}${rankDelta(aR, aRank)}`,
        bTitle: `${teamB.name}: rating ${f1(bR.rating)}, avg ${f1(bR.avg)} pts/wk, ${trendLabel(bR)}${rankDelta(bR, bRank)}`,
        edge: aRank < bRank ? 'a' : 'b',
      });
    }
  }

  // Luck.
  if (done.length > 0) {
    const matchupData: MatchupData[] = done.map(m => ({
      week: m.week,
      team1Id: m.team1Id,
      team1Points: m.team1Points,
      team2Id: m.team2Id,
      team2Points: m.team2Points,
    }));
    const teams = league.teams.map(t => ({
      id: t.id,
      name: t.name,
      wins: t.wins || 0,
      losses: t.losses || 0,
      ties: t.ties || 0,
      pointsFor: t.pointsFor || 0,
    }));
    const metrics = new Map(
      calculateLuckMetrics(matchupData, teams, 10, {
        medianMatchup: league.hasMedianMatchup,
      }).map(m => [m.teamId, m]),
    );
    const aL = metrics.get(teamAId);
    const bL = metrics.get(teamBId);
    if (aL && bL) {
      rows.push({
        label: 'Luck',
        a: `${aL.luckScore >= 0 ? '+' : ''}${f1(aL.luckScore)} · ${luckLabel(aL.luckRating)}`,
        b: `${bL.luckScore >= 0 ? '+' : ''}${f1(bL.luckScore)} · ${luckLabel(bL.luckRating)}`,
        aTitle: 'Actual wins vs expected wins from scoring — luck, not skill',
        bTitle: 'Actual wins vs expected wins from scoring — luck, not skill',
        edge: 'none',
      });
    }
  }

  // All-play record + schedule luck.
  if (done.length > 0) {
    const allPlay = new Map<string, AllPlayRow>(
      buildAllPlayRecord(league).map(r => [r.teamId, r]),
    );
    const aP = allPlay.get(teamAId);
    const bP = allPlay.get(teamBId);
    if (aP && bP) {
      const aLuck =
        aP.luckDiff == null
          ? ''
          : aP.luckDiff > 0
            ? ' · lucky schedule'
            : aP.luckDiff < 0
              ? ' · unlucky schedule'
              : ' · even schedule';
      const bLuck =
        bP.luckDiff == null
          ? ''
          : bP.luckDiff > 0
            ? ' · lucky schedule'
            : bP.luckDiff < 0
              ? ' · unlucky schedule'
              : ' · even schedule';
      rows.push({
        label: 'All-play record',
        a: `${formatRecord(aP.allWins, aP.allLosses, aP.allTies)}${aLuck}`,
        b: `${formatRecord(bP.allWins, bP.allLosses, bP.allTies)}${bLuck}`,
        aTitle: `Record if ${teamA.name} played every team every week (${f1(aP.allPlayPct)}%)`,
        bTitle: `Record if ${teamB.name} played every team every week (${f1(bP.allPlayPct)}%)`,
        edge: aP.allPlayPct > bP.allPlayPct ? 'a' : bP.allPlayPct > aP.allPlayPct ? 'b' : 'tie',
      });
    }
  }

  // Team grades.
  if (pool) {
    const grades = new Map<string, TeamGrade>(
      (buildTeamGrades({ league, pool }) ?? []).map(g => [g.teamId, g]),
    );
    const aG = grades.get(teamAId);
    const bG = grades.get(teamBId);
    if (aG && bG) {
      rows.push({
        label: 'Team grade',
        a: `${aG.overall} · ${aG.strength} best, ${aG.weakness} weakest`,
        b: `${bG.overall} · ${bG.strength} best, ${bG.weakness} weakest`,
        aTitle: gradeSummary(aG),
        bTitle: gradeSummary(bG),
        edge:
          aG.overallRatio > bG.overallRatio
            ? 'a'
            : bG.overallRatio > aG.overallRatio
              ? 'b'
              : 'tie',
      });
    }
  }

  // Playoff race.
  {
    const race = new Map<string, PlayoffRaceEntry>(
      getPlayoffRace(league).map(e => [e.teamId, e]),
    );
    const aE = race.get(teamAId);
    const bE = race.get(teamBId);
    if (aE && bE) {
      const cell = (e: PlayoffRaceEntry) =>
        `${f1(e.playoffProb)}% · seed ${f1(e.projectedSeed)}`;
      rows.push({
        label: 'Playoff odds',
        a: cell(aE),
        b: cell(bE),
        aTitle: `${teamA.name}: ${f1(aE.championProb)}% championship odds, ${aE.playoffStatus} (model verdict)`,
        bTitle: `${teamB.name}: ${f1(bE.championProb)}% championship odds, ${bE.playoffStatus} (model verdict)`,
        edge:
          aE.playoffProb > bE.playoffProb
            ? 'a'
            : bE.playoffProb > aE.playoffProb
              ? 'b'
              : 'tie',
      });
      // Remaining schedule: opponents with per-game win probabilities.
      const teamById = new Map(league.teams.map(t => [t.id, t.name]));
      const oppName = (id: string) => teamById.get(id) ?? '?';
      const schedCell = (e: PlayoffRaceEntry) =>
        e.remaining.length === 0
          ? 'No games left'
          : e.remaining
              .map(r => `W${r.week} ${oppName(r.opponentId)} (${f1(r.winProb)}%)`)
              .join(' · ');
      rows.push({
        label: 'Remaining schedule',
        a: schedCell(aE),
        b: schedCell(bE),
        aTitle: `SOS rank ${aE.sosRank} of ${race.size} (1 = toughest)`,
        bTitle: `SOS rank ${bE.sosRank} of ${race.size} (1 = toughest)`,
        edge: 'none',
      });
    }
  }

  // Series history.
  {
    const series = buildHeadToHead(teamAId, teamBId, done);
    rows.push({
      label: 'Series this season',
      a: seriesHeadline(series, teamA.name, teamB.name),
      b: seriesHeadline(series, teamB.name, teamA.name),
      edge:
        series.aWins > series.bWins
          ? 'a'
          : series.bWins > series.aWins
            ? 'b'
            : series.games > 0
              ? 'tie'
              : 'none',
    });
  }

  // Edge summary.
  const aWins = rows.filter(r => r.edge === 'a').length;
  const bWins = rows.filter(r => r.edge === 'b').length;
  const contested = aWins + bWins;
  const edgeSummary =
    contested === 0
      ? `${teamA.name} and ${teamB.name} are even across every metric`
      : aWins === bWins
        ? `${teamA.name} and ${teamB.name} split the metrics ${aWins}–${bWins}`
        : aWins > bWins
          ? `${teamA.name} leads ${teamB.name} ${aWins}–${bWins} across ${contested} contested metrics`
          : `${teamB.name} leads ${teamA.name} ${bWins}–${aWins} across ${contested} contested metrics`;

  return { aId: teamAId, aName: teamA.name, bId: teamBId, bName: teamB.name, rows, edgeSummary };
}
