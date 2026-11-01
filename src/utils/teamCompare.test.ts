import { describe, expect, it } from 'vitest';
import { buildTeamComparison } from './teamCompare';
import type { League, Team } from '@/types';

function team(
  id: string,
  name: string,
  wins: number,
  losses: number,
  pointsFor: number,
  pointsAgainst: number,
  isMyTeam = false,
): Team {
  return {
    id,
    name,
    wins,
    losses,
    ties: 0,
    pointsFor,
    pointsAgainst,
    isMyTeam,
  } as Team;
}

const ALPHA = team('a', 'Alpha', 3, 0, 390, 300, true);
const BETA = team('b', 'Beta', 2, 1, 360, 330);
const GAMMA = team('g', 'Gamma', 1, 2, 330, 360);
const DELTA = team('d', 'Delta', 0, 3, 300, 390);

const LEAGUE: League = {
  id: 'l1',
  platform: 'sleeper',
  name: 'Test League',
  season: 2026,
  draftType: 'snake',
  teams: [ALPHA, BETA, GAMMA, DELTA],
  scoringType: 'ppr',
  totalTeams: 4,
  currentWeek: 4,
  isLoaded: true,
  matchups: [
    // Week 1: Alpha 130 - Beta 110; Gamma 120 - Delta 100
    { week: 1, team1Id: 'a', team2Id: 'b', team1Points: 130, team2Points: 110 },
    { week: 1, team1Id: 'g', team2Id: 'd', team1Points: 120, team2Points: 100 },
    // Week 2: Alpha 140 - Gamma 115; Beta 125 - Delta 105
    { week: 2, team1Id: 'a', team2Id: 'g', team1Points: 140, team2Points: 115 },
    { week: 2, team1Id: 'b', team2Id: 'd', team1Points: 125, team2Points: 105 },
    // Week 3: Alpha 120 - Delta 95; Beta 125 - Gamma 95
    { week: 3, team1Id: 'a', team2Id: 'd', team1Points: 120, team2Points: 95 },
    { week: 3, team1Id: 'b', team2Id: 'g', team1Points: 125, team2Points: 95 },
  ],
} as League;

describe('buildTeamComparison', () => {
  it('returns null when comparing a team to itself', () => {
    expect(buildTeamComparison(LEAGUE, undefined, 'a', 'a')).toBeNull();
  });

  it('returns null for an unknown team id', () => {
    expect(buildTeamComparison(LEAGUE, undefined, 'a', 'zzz')).toBeNull();
    expect(buildTeamComparison(LEAGUE, undefined, 'zzz', 'a')).toBeNull();
  });

  it('renders record, points for/against rows with edges', () => {
    const c = buildTeamComparison(LEAGUE, undefined, 'a', 'd');
    expect(c).not.toBeNull();
    const byLabel = new Map(c!.rows.map(r => [r.label, r]));
    const record = byLabel.get('Record')!;
    expect(record.a).toBe('3-0');
    expect(record.b).toBe('0-3');
    expect(record.edge).toBe('a');
    const pf = byLabel.get('Points for')!;
    expect(pf.a).toBe('390.0');
    expect(pf.edge).toBe('a');
    const pa = byLabel.get('Points against')!;
    expect(pa.a).toBe('300.0');
    // Fewer points against wins.
    expect(pa.edge).toBe('a');
  });

  it('ranks the power row by shrunk rating with trend + rank delta detail', () => {
    const c = buildTeamComparison(LEAGUE, undefined, 'a', 'd');
    const row = c!.rows.find(r => r.label === 'Power rating')!;
    expect(row.a).toMatch(/^#1 · /);
    expect(row.b).toMatch(/^#4 · /);
    expect(row.edge).toBe('a');
    expect(row.aTitle).toContain('avg');
  });

  it('includes luck, all-play, and series rows from completed weeks', () => {
    const c = buildTeamComparison(LEAGUE, undefined, 'a', 'b');
    const byLabel = new Map(c!.rows.map(r => [r.label, r]));
    expect(byLabel.get('Luck')!.edge).toBe('none');
    expect(byLabel.get('All-play record')!.a).toContain('-');
    // Alpha beat Beta in week 1.
    expect(byLabel.get('Series this season')!.a).toContain('leads 1–0');
    expect(byLabel.get('Series this season')!.edge).toBe('a');
  });

  it('shows "No meetings yet" with no edge when the teams never met', () => {
    // Alpha vs Gamma met in week 2; Beta vs Gamma met in week 3 — use a
    // league where a and b never met.
    const noMeet = {
      ...LEAGUE,
      matchups: LEAGUE.matchups!.filter(
        m => !((m.team1Id === 'a' && m.team2Id === 'b') || (m.team1Id === 'b' && m.team2Id === 'a')),
      ),
    } as League;
    const c = buildTeamComparison(noMeet, undefined, 'a', 'b');
    const series = c!.rows.find(r => r.label === 'Series this season')!;
    expect(series.a).toBe('No meetings yet');
    expect(series.edge).toBe('none');
  });

  it('skips playoff-odds and team-grade rows when the data is absent', () => {
    const c = buildTeamComparison(LEAGUE, undefined, 'a', 'b');
    const labels = c!.rows.map(r => r.label);
    expect(labels).not.toContain('Playoff odds');
    expect(labels).not.toContain('Team grade');
  });

  it('summarizes the edge count', () => {
    const c = buildTeamComparison(LEAGUE, undefined, 'a', 'd');
    expect(c!.edgeSummary).toContain('Alpha leads Delta');
    const tied = buildTeamComparison(LEAGUE, undefined, 'a', 'a'.toUpperCase());
    expect(tied).toBeNull();
  });

  it('ties on identical teams data', () => {
    const same = {
      ...LEAGUE,
      teams: [team('a', 'Alpha', 2, 1, 350, 320), team('b', 'Beta', 2, 1, 350, 320)],
      matchups: [],
    } as League;
    const c = buildTeamComparison(same, undefined, 'a', 'b');
    const byLabel = new Map(c!.rows.map(r => [r.label, r]));
    expect(byLabel.get('Record')!.edge).toBe('tie');
    expect(byLabel.get('Points for')!.edge).toBe('tie');
    expect(byLabel.get('Points against')!.edge).toBe('tie');
    // No completed weeks: power/luck/all-play rows are skipped.
    expect(c!.rows.map(r => r.label)).not.toContain('Power rating');
    expect(c!.edgeSummary).toBe('Alpha and Beta are even across every metric');
  });
});
