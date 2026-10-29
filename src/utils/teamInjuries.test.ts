// Per-owner team injury summaries (backlog item 18 remainder): group
// buildInjuryReport's rows per fantasy team, worst-hit teams first.

import { describe, it, expect } from 'vitest';
import { buildTeamInjurySummaries } from './teamInjuries';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { League, Player, Team } from '@/types';

function poolPlayer(
  id: string,
  name: string,
  pos: 'QB' | 'RB' | 'WR' | 'TE',
  overallRank: number,
  injury?: { injuryStatus: string; injuryBodyPart?: string },
): PoolPlayer {
  return {
    id,
    name,
    team: 'DAL',
    pos,
    posRank: 1,
    overallRank,
    tier: 1,
    bye: 7,
    baseValue: null,
    projPtsPpr: 100,
    ...injury,
  } as PoolPlayer;
}

const pool: DraftPoolFile = {
  season: 2026,
  generatedAt: 'test',
  baseline: { budget: 200, teams: 10, rounds: 15 },
  players: [
    poolPlayer('q1', 'Q Back', 'QB', 30, { injuryStatus: 'Questionable', injuryBodyPart: 'Hamstring' }),
    poolPlayer('rb1', 'Out Back', 'RB', 5, { injuryStatus: 'Out', injuryBodyPart: 'Knee' }),
    poolPlayer('wr1', 'Star Wideout', 'WR', 2, { injuryStatus: 'IR', injuryBodyPart: 'Knee - ACL' }),
    poolPlayer('te1', 'Healthy Tight', 'TE', 40),
    poolPlayer('wr2', 'Doubtful Wideout', 'WR', 50, { injuryStatus: 'Doubtful', injuryBodyPart: 'Ankle' }),
    // Hurt but on no roster — belongs to the league-wide report, not here.
    poolPlayer('wr3', 'Free Agent Hurt', 'WR', 60, { injuryStatus: 'Questionable', injuryBodyPart: 'Shoulder' }),
  ],
};

function rosterPlayer(id: string, name: string, pos: string): Player {
  return { id, name, position: pos, team: 'DAL' } as Player;
}

function team(id: string, name: string, roster: Player[]): Team {
  return { id, name, wins: 0, losses: 0, ties: 0, pointsFor: 0, roster } as Team;
}

function league(teams: Team[]): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'yahoo',
    season: 2026,
    draftType: 'snake',
    scoringType: 'ppr',
    totalTeams: teams.length,
    isLoaded: true,
    teams,
    currentWeek: 9,
  } as League;
}

describe('buildTeamInjurySummaries', () => {
  const l = league([
    team('A', 'Alpha', [
      rosterPlayer('wr1', 'Star Wideout', 'WR'),
      rosterPlayer('te1', 'Healthy Tight', 'TE'),
    ]),
    team('B', 'Beta', [
      rosterPlayer('rb1', 'Out Back', 'RB'),
      rosterPlayer('q1', 'Q Back', 'QB'),
    ]),
    team('C', 'Gamma', [rosterPlayer('te1', 'Healthy Tight', 'TE')]),
  ]);

  it('groups each team\'s injured players, worst severity first', () => {
    const summaries = buildTeamInjurySummaries(l, pool);
    // Alpha: season-ending star first. Beta: Out back before Questionable QB.
    // Gamma: all clear.
    expect(summaries.map(s => s.teamName)).toEqual(['Alpha', 'Beta', 'Gamma']);
    const alpha = summaries[0];
    expect(alpha.rows.map(r => r.player.id)).toEqual(['wr1']);
    expect(alpha.worstTier).toBe('season-ending');
    const beta = summaries[1];
    expect(beta.rows.map(r => r.player.id)).toEqual(['rb1', 'q1']);
    expect(beta.worstTier).toBe('out');
    const gamma = summaries[2];
    expect(gamma.rows).toHaveLength(0);
    expect(gamma.worstTier).toBeNull();
  });

  it('excludes injured players on no roster', () => {
    const summaries = buildTeamInjurySummaries(l, pool);
    const allIds = summaries.flatMap(s => s.rows.map(r => r.player.id));
    expect(allIds).not.toContain('wr3');
  });

  it('orders healthy teams after injured ones', () => {
    const summaries = buildTeamInjurySummaries(l, pool);
    expect(summaries[summaries.length - 1].teamName).toBe('Gamma');
  });
});
