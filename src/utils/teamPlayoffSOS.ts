// Team Playoff SOS (backlog item 88): per fantasy team, the average
// fantasy-playoff-week (weeks 15–17 by default, shifted to the league's
// playoffStartWeek when known) matchup difficulty of their current optimal
// starters' NFL teams — answering the trade-deadline question "whose
// roster has the soft playoff schedule". FantasyPros' schedule
// winners/losers piece calls out exactly this question at the team level
// ("For the fantasy playoffs (Weeks 15-17), which notable player/team
// jumps out as having a particularly easy schedule?",
// https://www.fantasypros.com/2026/05/15-fantasy-football-schedule-winners-losers-2026/
// — public feature description, researched for feature shape only); these
// numbers are TraderApe's own playoffScheduleStrength engine applied to
// each fantasy team's starters, no copied content.
//
// The starter set comes from scoreTeamLineup — the same shared scoring
// core as the Matchup preview and the game plan — so the column can't
// disagree with them. K and D/ST are excluded: playoffScheduleStrength
// prices only QB/RB/WR/TE. Like the per-player PO SOS column, this is a
// difficulty map (season-to-date averages), not a forecast.

import type { League } from '@/types';
import type { AllowedFile, ScheduleFile } from './matchupRating';
import { scoreTeamLineup } from './matchupPreview';
import {
  labelFor,
  playoffScheduleStrength,
  playoffWeeksForLeague,
  type RosLabel,
} from './rosSchedule';

const PLAYOFF_SOS_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

export interface TeamPlayoffSOS {
  teamId: string;
  teamName: string;
  /** Mean playoff-week opponent allowed-vs-position rank across the team's priced starters (1 = easiest). */
  avgRank: number;
  /** 1-based rank among priced teams (1 = softest playoff schedule). */
  rank: number;
  label: RosLabel;
  /** Starters priced (QB/RB/WR/TE with playoff-week data). */
  starters: number;
}

export interface TeamPlayoffSOSInput {
  league: League;
  /** Defaults to playoffWeeksForLeague(league.playoffStartWeek). */
  weeks?: number[];
  schedule?: ScheduleFile;
  allowed?: AllowedFile;
}

/**
 * Per-team fantasy-playoff schedule softness, in league-teams order, or
 * undefined when the league can't be priced (not live, no rosters, or no
 * team has a pricable starter). Caller hides the column when undefined.
 */
export function buildTeamPlayoffSOS(input: TeamPlayoffSOSInput): TeamPlayoffSOS[] | undefined {
  const { league } = input;
  if (!league.currentWeek || league.status !== 'live') return undefined;
  if (!league.teams.some(t => (t.roster?.length ?? 0) > 0)) return undefined;
  const weeks = input.weeks ?? playoffWeeksForLeague(league.playoffStartWeek);

  const rows: Array<Omit<TeamPlayoffSOS, 'rank'>> = [];
  for (const team of league.teams) {
    const scored = scoreTeamLineup(team, league);
    // A zero projection means no weekly or season data for anyone on the
    // roster — pricing a playoff slate off it would be noise, so bail like
    // the matchup preview does.
    if (!scored || scored.preview.projectedScore <= 0) continue;
    const ranks: number[] = [];
    for (const s of scored.starters) {
      if (!PLAYOFF_SOS_POSITIONS.has(s.position)) continue;
      const strength = playoffScheduleStrength(
        s.nflTeam,
        s.position,
        weeks,
        input.schedule,
        input.allowed,
      );
      if (strength) ranks.push(strength.avgRank);
    }
    if (ranks.length === 0) continue;
    const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    rows.push({
      teamId: team.id,
      teamName: team.name,
      avgRank,
      label: labelFor(avgRank),
      starters: ranks.length,
    });
  }
  if (rows.length === 0) return undefined;
  const rankById = new Map(
    [...rows].sort((a, b) => a.avgRank - b.avgRank).map((r, i) => [r.teamId, i + 1]),
  );
  return rows.map(r => ({ ...r, rank: rankById.get(r.teamId) ?? 0 }));
}
