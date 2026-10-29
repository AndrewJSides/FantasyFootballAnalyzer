// Weekly recap story: an auto-generated narrative for one finished week.
// Biggest over/underperformers are graded against TraderApe's own weekly
// projection model (projectWeeklyPoints, recency-weighted form + season
// baseline, no matchup blend - the same model the backtest harness scores),
// so "beat projection" means beat TraderApe's number, not Yahoo's or
// ESPN's. Luck reuses the existing Luck engine (calculateLuckMetrics), and
// the draft pick calls reuse grading's gradeAllPicks in results mode.

import type { League, Player, WeeklyMatchup } from '@/types';
import { completedMatchups } from './completedMatchups';
import { calculateLuckMetrics, type LuckMetrics, type MatchupData } from './luck';
import { projectWeeklyPoints, type WeekPoints } from './weeklyProjection';
import { gradeAllPicks } from './grading';
import { isPlaceholderPlayer } from './placeholders';

export interface RecapGame {
  team1Name: string;
  team2Name: string;
  team1Pts: number;
  team2Pts: number;
  tie: boolean;
}

export interface RecapOverUnder {
  name: string;
  position: string;
  teamName: string;
  actual: number;
  projected: number;
  diff: number; // actual - projected
  weeksUsed: number;
}

export interface RecapDraftPick {
  name: string;
  position: string;
  teamName: string;
  pickNumber: number;
  round: number;
  positionRank: number;
  expectedRank: number;
  valueOverExpected: number;
}

export interface WeeklyLuckSpot {
  teamName: string;
  weekPoints: number;
  opponentName: string;
  opponentPoints: number;
  margin: number;
}

export interface WeeklyRecap {
  week: number;
  availableWeeks: number[];
  games: RecapGame[];
  headline: string;
  headlineDetail?: string;
  overperformers: RecapOverUnder[];
  underperformers: RecapOverUnder[];
  hasWeeklyPoints: boolean;
  // Weekly luck flavor: the team that won with the lowest score ("lucky
  // escape") and the team that lost with the highest score ("cruel beat").
  luckyEscape?: WeeklyLuckSpot;
  cruelBeat?: WeeklyLuckSpot;
  // Season luck extremes from the existing Luck engine.
  luckiestSeason?: LuckMetrics;
  unluckiestSeason?: LuckMetrics;
  bestPick?: RecapDraftPick;
  worstPick?: RecapDraftPick;
  hasDraftData: boolean;
}

// K/DST weekly scores are streamable noise - the recap's over/under calls are
// for the skill positions only (same line as draftRecap's isSkillPos).
function isSkillPos(pos: string): boolean {
  return pos !== 'K' && pos !== 'DEF' && pos !== 'DST';
}

// TraderApe projection for week `week` using only weeks BEFORE it. Needs at
// least two prior weeks of data; one week is the whole season baseline and
// tells nothing about "beating projection".
function projectionForWeek(weekly: Record<number, number>, week: number) {
  const prior: WeekPoints[] = Object.entries(weekly)
    .filter(([w, pts]) => Number(w) < week && Number.isFinite(pts) && pts > 0)
    .map(([w, pts]) => ({ week: Number(w), pts }));
  if (prior.length < 2) return null;
  return projectWeeklyPoints(prior);
}

function buildLuck(league: League): LuckMetrics[] {
  const done = completedMatchups(league);
  if (done.length === 0) return [];
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
  return calculateLuckMetrics(matchupData, teams, 10, {
    medianMatchup: league.hasMedianMatchup,
  });
}

function playerLookup(league: League): Map<string, { name: string; position: string }> {
  const map = new Map<string, { name: string; position: string }>();
  const add = (p: Player | undefined | null) => {
    if (p && !map.has(p.id)) map.set(p.id, { name: p.name, position: p.position });
  };
  for (const team of league.teams) {
    for (const p of team.roster ?? []) add(p);
    for (const pick of team.draftPicks ?? []) add(pick.player);
    for (const tx of team.transactions ?? []) for (const p of tx.adds ?? []) add(p);
    for (const trade of team.trades ?? [])
      for (const side of trade.teams) {
        for (const p of side.playersReceived ?? []) add(p as Player);
        for (const p of side.playersSent ?? []) add(p as Player);
      }
  }
  return map;
}

export function weeklyRecap(league: League, week?: number): WeeklyRecap | null {
  const done = completedMatchups(league);
  if (done.length === 0) return null;
  const nameOf = (id: string) => league.teams.find(t => t.id === id)?.name ?? `Team ${id}`;
  const availableWeeks = [...new Set(done.map(m => m.week))].sort((a, b) => a - b);
  const wk = week ?? availableWeeks[availableWeeks.length - 1];
  if (!availableWeeks.includes(wk)) return null;

  const weekGames: WeeklyMatchup[] = done.filter(m => m.week === wk);
  const games: RecapGame[] = weekGames.map(m => ({
    team1Name: nameOf(m.team1Id),
    team2Name: nameOf(m.team2Id),
    team1Pts: m.team1Points,
    team2Pts: m.team2Points,
    tie: m.team1Points === m.team2Points,
  }));

  // Week headline: blowout > squeaker > tie > high scorer (same pecking order
  // as the season timeline so the two reads never contradict).
  let headline = '';
  let headlineDetail: string | undefined;
  const decided = weekGames.filter(m => m.team1Points !== m.team2Points);
  const blowout =
    decided.length > 0
      ? decided.reduce((a, b) =>
          Math.abs(a.team1Points - a.team2Points) >= Math.abs(b.team1Points - b.team2Points) ? a : b,
        )
      : null;
  const squeaker =
    decided.length > 0
      ? decided.reduce((a, b) =>
          Math.abs(a.team1Points - a.team2Points) <= Math.abs(b.team1Points - b.team2Points) ? a : b,
        )
      : null;
  const high =
    weekGames.length > 0
      ? weekGames.reduce((a, b) =>
          Math.max(a.team1Points, a.team2Points) >= Math.max(b.team1Points, b.team2Points) ? a : b,
        )
      : null;
  const blowoutMargin = blowout ? Math.abs(blowout.team1Points - blowout.team2Points) : 0;
  const squeakerMargin = squeaker ? Math.abs(squeaker.team1Points - squeaker.team2Points) : 0;
  if (blowout && blowoutMargin >= 50) {
    const w = blowout.team1Points > blowout.team2Points ? 1 : 2;
    headline = `${nameOf(w === 1 ? blowout.team1Id : blowout.team2Id)} massacres ${nameOf(w === 1 ? blowout.team2Id : blowout.team1Id)}`;
    headlineDetail = `${Math.max(blowout.team1Points, blowout.team2Points).toFixed(1)}-${Math.min(blowout.team1Points, blowout.team2Points).toFixed(1)}`;
  } else if (squeaker && squeakerMargin <= 2) {
    const w = squeaker.team1Points > squeaker.team2Points ? 1 : 2;
    headline = `${nameOf(w === 1 ? squeaker.team1Id : squeaker.team2Id)} survives ${nameOf(w === 1 ? squeaker.team2Id : squeaker.team1Id)} by ${squeakerMargin.toFixed(1)}`;
  } else if (high) {
    if (high.team1Points === high.team2Points) {
      headline = `${nameOf(high.team1Id)} and ${nameOf(high.team2Id)} tie ${high.team1Points.toFixed(1)}-${high.team2Points.toFixed(1)}`;
    } else {
      const w = high.team1Points > high.team2Points ? 1 : 2;
      headline = `${nameOf(w === 1 ? high.team1Id : high.team2Id)} hangs ${Math.max(high.team1Points, high.team2Points).toFixed(1)}`;
      headlineDetail = `beats ${nameOf(w === 1 ? high.team2Id : high.team1Id)} ${Math.max(high.team1Points, high.team2Points).toFixed(1)}-${Math.min(high.team1Points, high.team2Points).toFixed(1)}`;
    }
  }

  // Over/underperformers vs the TraderApe projection.
  const weekly = league.playerWeeklyPoints ?? {};
  const players = playerLookup(league);
  const teamOf = (playerId: string): string => {
    const team = league.teams.find(t => (t.roster ?? []).some(p => p.id === playerId));
    return team?.name ?? '';
  };
  const calls: RecapOverUnder[] = [];
  for (const [playerId, byWeek] of Object.entries(weekly)) {
    const info = players.get(playerId);
    if (!info || !isSkillPos(info.position) || isPlaceholderPlayer(info.name)) continue;
    const actual = byWeek[wk];
    if (!Number.isFinite(actual)) continue;
    const proj = projectionForWeek(byWeek, wk);
    if (!proj) continue;
    const diff = Math.round((actual - proj.projection) * 10) / 10;
    if (Math.abs(diff) < 5) continue;
    calls.push({
      name: info.name,
      position: info.position,
      teamName: teamOf(playerId),
      actual: Math.round(actual * 10) / 10,
      projected: proj.projection,
      diff,
      weeksUsed: proj.weeksUsed,
    });
  }
  const overperformers = calls
    .filter(c => c.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 3);
  const underperformers = calls
    .filter(c => c.diff < 0)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 3);
  const hasWeeklyPoints = Object.values(weekly).some(byWeek => Number.isFinite(byWeek[wk]));

  // Weekly luck flavor from the decided games.
  let luckyEscape: WeeklyLuckSpot | undefined;
  let cruelBeat: WeeklyLuckSpot | undefined;
  if (decided.length > 0) {
    const winners = decided.map(m => {
      const winnerFirst = m.team1Points > m.team2Points;
      return {
        id: winnerFirst ? m.team1Id : m.team2Id,
        oppId: winnerFirst ? m.team2Id : m.team1Id,
        pts: Math.max(m.team1Points, m.team2Points),
        oppPts: Math.min(m.team1Points, m.team2Points),
        margin: Math.abs(m.team1Points - m.team2Points),
      };
    });
    const escape = winners.reduce((a, b) => (a.pts <= b.pts ? a : b));
    luckyEscape = {
      teamName: nameOf(escape.id),
      weekPoints: escape.pts,
      opponentName: nameOf(escape.oppId),
      opponentPoints: escape.oppPts,
      margin: escape.margin,
    };
    const losers = decided.map(m => {
      const loserFirst = m.team1Points < m.team2Points;
      return {
        id: loserFirst ? m.team1Id : m.team2Id,
        oppId: loserFirst ? m.team2Id : m.team1Id,
        pts: Math.min(m.team1Points, m.team2Points),
        oppPts: Math.max(m.team1Points, m.team2Points),
        margin: Math.abs(m.team1Points - m.team2Points),
      };
    });
    const beat = losers.reduce((a, b) => (a.pts >= b.pts ? a : b));
    cruelBeat = {
      teamName: nameOf(beat.id),
      weekPoints: beat.pts,
      opponentName: nameOf(beat.oppId),
      opponentPoints: beat.oppPts,
      margin: beat.margin,
    };
  }

  // Season luck extremes from the existing engine.
  const luck = buildLuck(league);
  const luckiestSeason = luck.length > 0 ? luck.reduce((a, b) => (a.luckScore >= b.luckScore ? a : b)) : undefined;
  const unluckiestSeason = luck.length > 0 ? luck.reduce((a, b) => (a.luckScore <= b.luckScore ? a : b)) : undefined;

  // Draft picks to date: gradeAllPicks in results mode prices every pick on
  // points scored so far; valueOverExpected = expectedRank - positionRank.
  let bestPick: RecapDraftPick | undefined;
  let worstPick: RecapDraftPick | undefined;
  let hasDraftData = false;
  const allPicks = league.teams.flatMap(t => t.draftPicks ?? []);
  if (allPicks.length > 0) {
    hasDraftData = true;
    const graded = gradeAllPicks(league)
      .filter(p => !p.isKeeper && Number.isFinite(p.seasonPoints) && !isPlaceholderPlayer(p.player.name));
    if (graded.length > 0) {
      const best = graded.reduce((a, b) => (a.valueOverExpected >= b.valueOverExpected ? a : b));
      const worst = graded.reduce((a, b) => (a.valueOverExpected <= b.valueOverExpected ? a : b));
      const shape = (p: typeof best): RecapDraftPick => ({
        name: p.player.name,
        position: p.player.position,
        teamName: p.teamName,
        pickNumber: p.pickNumber,
        round: p.round,
        positionRank: p.positionRank,
        expectedRank: p.expectedRank,
        valueOverExpected: p.valueOverExpected,
      });
      bestPick = shape(best);
      worstPick = shape(worst);
    }
  }

  return {
    week: wk,
    availableWeeks,
    games,
    headline,
    headlineDetail,
    overperformers,
    underperformers,
    hasWeeklyPoints,
    luckyEscape,
    cruelBeat,
    luckiestSeason,
    unluckiestSeason,
    bestPick,
    worstPick,
    hasDraftData,
  };
}
