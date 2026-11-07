import { describe, expect, it } from 'vitest';
import type { League, Player, RosterSlots, Team, Transaction } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import type { MatchupPreview } from './matchupPreview';
import { buildWeeklyBriefing, describeBriefingAlert } from './weeklyBriefing';

const SLOTS: RosterSlots = {
  QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 5, IR: 0,
};

function poolPlayer(over: Partial<PoolPlayer> & { id: string }): PoolPlayer {
  return {
    name: over.id, team: 'FA', pos: 'WR', posRank: 1, overallRank: 1,
    tier: 1, bye: null, baseValue: null, projPtsPpr: 100, ...over,
  } as PoolPlayer;
}

// Mine: weak at WR (need); only QB is on bye in week 8, with no cover.
const QB1 = poolPlayer({ id: 'qb1', name: 'My QB', pos: 'QB', team: 'KC', bye: 8, projPtsPpr: 320 });
const RB1 = poolPlayer({ id: 'rb1', name: 'My RB', pos: 'RB', team: 'DET', bye: 6, projPtsPpr: 300 });
const WR_WEAK = poolPlayer({ id: 'wr-weak', name: 'My Weak WR', pos: 'WR', team: 'CIN', bye: 10, projPtsPpr: 120 });
const TE1 = poolPlayer({ id: 'te1', name: 'My TE', pos: 'TE', team: 'KC', bye: 9, projPtsPpr: 160 });
// Theirs: strong at WR, so mine is a need there.
const WR_STAR = poolPlayer({ id: 'wr-star', name: 'Their WR', pos: 'WR', team: 'PHI', bye: 11, projPtsPpr: 280 });
const RB2 = poolPlayer({ id: 'rb2', name: 'Their RB', pos: 'RB', team: 'SF', bye: 9, projPtsPpr: 190 });
const QB2 = poolPlayer({ id: 'qb2', name: 'Their QB', pos: 'QB', team: 'BUF', bye: 12, projPtsPpr: 180 });
// Free agents.
const WR_FREE = poolPlayer({ id: 'wr-free', name: 'Free WR', pos: 'WR', team: 'NYJ', bye: 13, projPtsPpr: 250 });
const RB_FREE = poolPlayer({ id: 'rb-free', name: 'Free RB', pos: 'RB', team: 'DEN', bye: 10, projPtsPpr: 260 });
const QB_FREE = poolPlayer({ id: 'qb-free', name: 'Free QB', pos: 'QB', team: 'MIA', bye: 9, projPtsPpr: 150 });

const POOL_ALL = [QB1, RB1, WR_WEAK, TE1, WR_STAR, RB2, QB2, WR_FREE, RB_FREE, QB_FREE];

function testPool(): DraftPoolFile {
  return { players: POOL_ALL } as DraftPoolFile;
}

function leaguePlayer(pool: PoolPlayer): Player {
  return { id: pool.id, platformId: '', name: pool.name, position: pool.pos, team: pool.team };
}

function team(id: string, name: string, roster: PoolPlayer[], transactions: Transaction[] = []): Team {
  return { id, name, roster: roster.map(leaguePlayer), transactions } as Team;
}

function testLeague(currentWeek = 8): { league: League; mine: Team } {
  const mine = team('mine', 'Mine', [QB1, RB1, WR_WEAK, TE1]);
  const theirs = team('theirs', 'Theirs', [WR_STAR, RB2, QB2]);
  const league = {
    id: 'l', platform: 'sleeper', name: 'L', season: 2026, draftType: 'snake',
    teams: [mine, theirs], scoringType: 'ppr', totalTeams: 10, currentWeek,
    isLoaded: true, rosterSlots: SLOTS,
  } as League;
  return { league, mine };
}

function preview(over: Partial<MatchupPreview> = {}): MatchupPreview {
  return {
    week: 8,
    teamAId: 'mine',
    teamBId: 'theirs',
    projA: 120.5,
    projB: 100.2,
    winProbA: 72.4,
    swingPlayers: [],
    distA: { p10: 90, median: 120, p90: 150 },
    distB: { p10: 75, median: 100, p90: 125 },
    ...over,
  };
}

describe('buildWeeklyBriefing', () => {
  it('orients the matchup to my team and rounds the win probability', () => {
    const { league, mine } = testLeague();
    const b = buildWeeklyBriefing(league, mine, preview(), testPool());
    expect(b.week).toBe(8);
    expect(b.matchup?.opponentName).toBe('Theirs');
    expect(b.matchup?.myProj).toBe(120.5);
    expect(b.matchup?.oppProj).toBe(100.2);
    expect(b.matchup?.myWinProb).toBe(72.4);
  });

  it('flips the matchup when my team is team B', () => {
    const { league, mine } = testLeague();
    const b = buildWeeklyBriefing(
      league,
      mine,
      preview({ teamAId: 'theirs', teamBId: 'mine', winProbA: 72.4 }),
      testPool(),
    );
    expect(b.matchup?.opponentName).toBe('Theirs');
    expect(b.matchup?.myProj).toBe(100.2);
    expect(b.matchup?.oppProj).toBe(120.5);
    // 100 - 72.4 without rounding would be 27.600000000000001.
    expect(b.matchup?.myWinProb).toBe(27.6);
  });

  it('reports null matchup when there is no preview', () => {
    const { league, mine } = testLeague();
    const b = buildWeeklyBriefing(league, mine, null, testPool());
    expect(b.matchup).toBeNull();
  });

  it('counts the bye-week hole and names it first', () => {
    const { league, mine } = testLeague();
    const b = buildWeeklyBriefing(league, mine, preview(), testPool());
    expect(b.holeCount).toBeGreaterThanOrEqual(1);
    expect(b.topAlertLine).toMatch(/^Week 8 · QB hole: My QB on bye, no cover\./);
  });

  it('names the top waiver claim with its strongest reason', () => {
    const { league, mine } = testLeague();
    const b = buildWeeklyBriefing(league, mine, preview(), testPool());
    // WR_FREE 250 x 1.25 (need) beats RB_FREE 260 and the gap-fill QB.
    expect(b.topWaiver?.playerName).toBe('Free WR');
    expect(b.topWaiver?.position).toBe('WR');
    // The gap-fill reason leads (Free WR also covers the Week 10 bye hole),
    // with the need line behind it.
    expect(b.topWaiver?.reason).toMatch(/Fills your Week 10 WR gap/);
    // No recorded bids in this fixture, so no bid band.
    expect(b.topWaiver?.bid).toBeNull();
  });

  it('reports no trade when no finder deal involves my team', () => {
    const { league, mine } = testLeague();
    const b = buildWeeklyBriefing(league, mine, preview(), testPool());
    expect(b.topTrade).toBeNull();
  });
});

describe('buildWeeklyBriefing trade row', () => {
  // Steep-curve pool + complementary teams, mirroring the Trade Finder
  // fixture: A is deep at RB and weak at WR, B the reverse.
  let rank = 1;
  function steepPlayer(partial: Partial<PoolPlayer> & { id: string; pos: string }): PoolPlayer {
    return {
      name: partial.id, team: 'FA', posRank: 1,
      overallRank: partial.overallRank ?? rank++, tier: 1, bye: null,
      baseValue: null, ...partial,
    } as PoolPlayer;
  }
  function steepPool(): DraftPoolFile {
    const players: PoolPlayer[] = [];
    const add = (pos: string, count: number, base: number, step: number) => {
      for (let i = 0; i < count; i++) {
        const pts = base - i * step;
        players.push(
          steepPlayer({ id: `${pos}${i + 1}`, pos, projPts: pts, projPtsPpr: pts, projPtsStd: pts }),
        );
      }
    };
    add('QB', 20, 380, 8);
    add('RB', 60, 300, 4);
    add('WR', 60, 280, 4);
    add('TE', 30, 220, 5);
    return { players } as DraftPoolFile;
  }
  function steepTeam(id: string, name: string, rosterIds: string[]): Team {
    return {
      id,
      name,
      roster: rosterIds.map(rid => ({
        id: rid,
        platformId: rid,
        name: rid,
        position: rid.replace(/[0-9]+$/, ''),
        team: 'FA',
      })),
    } as Team;
  }
  function steepLeague(): League {
    return {
      id: 'test', name: 'Test League', platform: 'sleeper', season: 2026,
      totalTeams: 4, rosterSlots: SLOTS, scoringType: 'ppr', currentWeek: 9,
      teams: [
        steepTeam('a', 'Team A', ['QB1', 'RB1', 'RB2', 'RB3', 'RB4', 'WR40', 'TE20']),
        steepTeam('b', 'Team B', ['QB2', 'RB40', 'WR1', 'WR2', 'WR3', 'WR4', 'TE25']),
        steepTeam('c', 'Team C', ['QB3', 'RB5', 'RB6', 'WR5', 'WR6', 'TE5']),
        steepTeam('d', 'Team D', ['QB4', 'RB7', 'RB8', 'WR7', 'WR8', 'TE6']),
      ],
    } as League;
  }

  it('names the best finder deal involving my team, oriented from my side', () => {
    const league = steepLeague();
    const mine = league.teams[0];
    const b = buildWeeklyBriefing(league, mine, null, steepPool());
    expect(b.topTrade?.otherTeamName).toBe('Team B');
    expect(b.topTrade?.headline).toMatch(/^Give .+ · Get .+/);
    expect(b.topTrade?.score).toBeGreaterThan(0);
    // The deal gives away an RB and brings back a WR.
    expect(b.topTrade?.headline).toMatch(/RB\d+/);
    expect(b.topTrade?.headline).toMatch(/WR\d+/);
  });

  it('reports no trade for a team with no possible partner', () => {
    const league = steepLeague();
    const solo = {
      ...steepLeague(),
      teams: [league.teams[0]],
      totalTeams: 1,
    } as League;
    const b = buildWeeklyBriefing(solo, league.teams[0], null, steepPool());
    expect(b.topTrade).toBeNull();
  });
});

describe('describeBriefingAlert', () => {
  it('names the cover on a bye-watch', () => {
    const line = describeBriefingAlert({
      week: 10,
      slots: ['WR'],
      eligible: ['WR'],
      severity: 'bye-watch',
      cause: 'bye',
      onBye: [poolPlayer({ id: 'wr1', name: 'My WR', pos: 'WR' })],
      outInjured: [],
      cover: poolPlayer({ id: 'wr2', name: 'Bench WR', pos: 'WR' }),
      fillers: [],
    });
    expect(line).toBe('Week 10 · WR bye-watch: My WR on bye, Bench WR covers.');
  });
});
