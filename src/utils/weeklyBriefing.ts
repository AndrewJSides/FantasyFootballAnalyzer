// "My Week" at-a-glance briefing (backlog item 196): one section answering
// "what do I need to do this week" for the selected team, composing the
// engines TraderApe already has — the Matchup preview, Roster Alerts, the
// Waiver Priority Queue, the Trade Finder, and the shared Playoff Race — so
// the briefing's numbers can never disagree with the pages each row links to.
// Guidance only: nothing here sets lineups, claims players, or proposes trades.
//
// League mode only: guests have no team profiles or finder, so the page
// hides the section for them instead of rendering a degraded copy.

import type { League, Team } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { currentWeekEstimate } from './matchupRating';
import type { MatchupPreview } from './matchupPreview';
import type { PlayoffRaceEntry } from './playoffOdds';
import { teamRosterAlerts, type RosterAlert } from './rosterAlerts';
import { buildWaiverPriority } from './waiverPriority';
import { findTradeCandidates } from './tradeFinder';

export interface WeeklyBriefingMatchup {
  opponentName: string;
  myProj: number;
  oppProj: number;
  /** 0..100, one decimal — this team's win probability. */
  myWinProb: number;
}

export interface WeeklyBriefingWaiver {
  playerName: string;
  position: string;
  nflTeam: string;
  /** Strongest reason first, e.g. the gap-fill or need line. */
  reason: string;
  bid: { low: number; high: number } | null;
}

export interface WeeklyBriefingPlayoff {
  /** 0..100, one decimal — share of the simulated seasons making the playoffs. */
  playoffProb: number;
  /** Mean playoff seed (1..N), one decimal. */
  projectedSeed: number;
  /** Projected final wins / losses, one decimal. */
  projectedWins: number;
  projectedLosses: number;
  /** Model verdict from the simulated seasons, not league-official. */
  playoffStatus: 'clinched' | 'eliminated' | 'alive';
}

export interface WeeklyBriefingTrade {
  otherTeamName: string;
  /** "Give X · Get Y", oriented from this team's side. */
  headline: string;
  /** Ranking score: mutual starter-upgrade gain + fairness. */
  score: number;
}

export interface WeeklyBriefing {
  week: number;
  teamId: string;
  teamName: string;
  /** Null when the sync fetched no future schedule (old snapshots). */
  matchup: WeeklyBriefingMatchup | null;
  /** Lineup holes (a slot loses its starter with no cover) across the scanned weeks. */
  holeCount: number;
  /** Bye-watch slots (a slot loses its starter but has cover) across the scanned weeks. */
  watchCount: number;
  /** Plain-language top alert, holes first, earliest week first; null when all clear. */
  topAlertLine: string | null;
  /** Null when no available target prices above zero. */
  topWaiver: WeeklyBriefingWaiver | null;
  /** Null when no finder deal involves this team. */
  topTrade: WeeklyBriefingTrade | null;
  /** Null when the shared Playoff Race has no entry for this team (no future schedule). */
  playoff: WeeklyBriefingPlayoff | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** One plain-language line per alert, e.g. "Week 9 · RB hole: My RB on bye, no cover." */
export function describeBriefingAlert(alert: RosterAlert): string {
  const slots = [...new Set(alert.slots)].join('/');
  const names = [
    ...alert.onBye.map(p => p.name),
    ...alert.outInjured.map(p => p.name),
  ];
  const out = names.length > 0 ? names.join(', ') : 'a starter';
  const cause = alert.cause === 'injury' ? 'out' : 'on bye';
  const cover =
    alert.severity === 'hole'
      ? 'no cover'
      : alert.cover
        ? `${alert.cover.name} covers`
        : 'covered';
  return (
    `Week ${alert.week} · ${slots} ` +
    `${alert.severity === 'hole' ? 'hole' : 'bye-watch'}: ${out} ${cause}, ${cover}.`
  );
}

/**
 * Build the briefing for one team. The matchup preview is passed in (the
 * Start/Sit page already computed it for the lineup-mode suggestion) so
 * the briefing and the suggestion price the same Monte Carlo run; the
 * race entry is passed in the same way (the page reads the shared
 * Playoff Race, so the briefing's playoff row prices the same sim as the
 * Teams page); the alerts, waiver, and trade rows are priced here from
 * the same engines their pages use.
 */
export function buildWeeklyBriefing(
  league: League,
  team: Team,
  preview: MatchupPreview | null,
  pool: DraftPoolFile = POOL,
  raceEntry: PlayoffRaceEntry | null = null,
): WeeklyBriefing {
  const week = league.currentWeek ?? currentWeekEstimate();

  let matchup: WeeklyBriefingMatchup | null = null;
  if (preview) {
    const mineIsA = preview.teamAId === team.id;
    const oppId = mineIsA ? preview.teamBId : preview.teamAId;
    const opponentName =
      league.teams.find(t => t.id === oppId)?.name ?? 'your opponent';
    matchup = {
      opponentName,
      myProj: mineIsA ? preview.projA : preview.projB,
      oppProj: mineIsA ? preview.projB : preview.projA,
      myWinProb: round1(mineIsA ? preview.winProbA : 100 - preview.winProbA),
    };
  }

  const alerts = teamRosterAlerts(league, team, pool);
  const holes = alerts.filter(a => a.severity === 'hole');
  const watches = alerts.filter(a => a.severity === 'bye-watch');
  const topAlert =
    [...holes, ...watches].sort((a, b) => a.week - b.week)[0] ?? null;

  const topTarget = buildWaiverPriority(league, team, pool, 1)[0] ?? null;
  const topWaiver: WeeklyBriefingWaiver | null = topTarget
    ? {
        playerName: topTarget.player.name,
        position: topTarget.player.pos,
        nflTeam: topTarget.player.team,
        reason: topTarget.reasons[0] ?? '',
        bid: topTarget.bid,
      }
    : null;

  const candidate = findTradeCandidates(league, pool).find(
    c => c.teamA.id === team.id || c.teamB.id === team.id,
  );
  let topTrade: WeeklyBriefingTrade | null = null;
  if (candidate) {
    const mineIsA = candidate.teamA.id === team.id;
    const gives = (mineIsA ? candidate.aGives : candidate.bGives)
      .map(p => p.name)
      .join(', ');
    const gets = (mineIsA ? candidate.bGives : candidate.aGives)
      .map(p => p.name)
      .join(', ');
    topTrade = {
      otherTeamName: mineIsA ? candidate.teamB.name : candidate.teamA.name,
      headline: `Give ${gives} · Get ${gets}`,
      score: candidate.score,
    };
  }

  return {
    week,
    teamId: team.id,
    teamName: team.name,
    matchup,
    holeCount: holes.length,
    watchCount: watches.length,
    topAlertLine: topAlert ? describeBriefingAlert(topAlert) : null,
    topWaiver,
    topTrade,
    playoff: raceEntry
      ? {
          playoffProb: raceEntry.playoffProb,
          projectedSeed: raceEntry.projectedSeed,
          projectedWins: raceEntry.projectedWins,
          projectedLosses: raceEntry.projectedLosses,
          playoffStatus: raceEntry.playoffStatus,
        }
      : null,
  };
}
