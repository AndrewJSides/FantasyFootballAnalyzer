// Head-to-head player comparison engine (backlog item 6).
//
// Compares two players side by side on the dimensions a manager actually
// weighs: season points, recent trend, this week's TraderApe projection,
// matchup difficulty, rest-of-season outlook, and VOR value. All computation
// lives here so it stays unit-testable; the /compare page is a thin shell.
import type { WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { POOL } from '@/data/draftPool';
import { WEEKLY_SHAPE } from '@/data/weeklyShape';
import type { DraftPick, GamesPlayed, RosterSlots, ScoringType } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import {
  getMatchupRating,
  leagueAvgAllowed,
  matchupShort,
  type MatchupRating,
} from '@/utils/matchupRating';
import { vorPoints, type ValueLeague, type VorConfig } from '@/utils/projectionValues';
import { seasonOutlooks } from '@/utils/seasonOutlook';
import { projectWeeklyPoints, type WeekPoints } from '@/utils/weeklyProjection';

export type CompareWinner = 'A' | 'B' | 'tie';

export interface CompareContext {
  currentWeek: number;
  scoring: ScoringType;
  slots: RosterSlots;
  teamCount: number;
  /** The season the context applies to (league.season, or the pool season for guests). */
  season: number;
  valueLeague: ValueLeague;
  vorCfg: VorConfig;
}

export interface CompareMetrics {
  player: PoolPlayer;
  total: number | null;
  games: number | null;
  ppg: number | null;
  last3: number | null;
  projection: number | null;
  matchup: MatchupRating | null;
  matchupText: string | null;
  /** Projected points for the remaining weeks (ROS outlook). */
  rosProjected: number | null;
  /** ROS outlook total: scored so far + missed-week replacement + projected. */
  rosTotal: number | null;
  vor: number;
}

export interface CompareRow {
  key: string;
  label: string;
  a: string | null;
  b: string | null;
  winner: CompareWinner | null;
  /** Plain-language margin, e.g. "A leads by 3.1". Null when tied or unknown. */
  margin: string | null;
}

export interface CompareResult {
  metricsA: CompareMetrics;
  metricsB: CompareMetrics;
  rows: CompareRow[];
  verdict: string;
  /** Number of rows won by each side, for the verdict. */
  winsA: number;
  winsB: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

const matchupScore = (m: MatchupRating): number =>
  m.label === 'favorable' ? 2 : m.label === 'neutral' ? 1 : 0;

const fmtPts = (n: number | null): string | null =>
  n === null ? null : `${round1(n)} pts`;

function completedWeeks(p: PoolPlayer, weekly: WeeklyPprPoints | undefined, currentWeek: number) {
  const sid = p.sleeperId;
  const byWeek = (sid && weekly?.pointsBySleeperId[sid]) ?? {};
  const entries: WeekPoints[] = Object.entries(byWeek)
    .map(([w, pts]) => ({ week: Number(w), pts }))
    .filter(e => Number.isFinite(e.week) && e.week < currentWeek)
    .sort((a, b) => a.week - b.week);
  const gpWeeks = sid ? weekly?.gamesBySleeperId[sid] ?? [] : [];
  const gpCompleted = gpWeeks.filter(w => w < currentWeek);
  return { entries, gpCompleted };
}

function metricsFor(p: PoolPlayer, weekly: WeeklyPprPoints | undefined, ctx: CompareContext): CompareMetrics {
  const { entries, gpCompleted } = completedWeeks(p, weekly, ctx.currentWeek);
  const total = entries.length > 0 ? round1(entries.reduce((s, e) => s + e.pts, 0)) : null;
  const games = gpCompleted.length > 0 ? gpCompleted.length : entries.length > 0 ? entries.length : null;
  const ppg = total !== null && games !== null && games > 0 ? round1(total / games) : null;
  const last3Entries = entries.slice(-3);
  const last3 =
    last3Entries.length > 0
      ? round1(last3Entries.reduce((s, e) => s + e.pts, 0) / last3Entries.length)
      : null;

  const matchup = getMatchupRating(p.team, p.pos, ctx.currentWeek);
  const leagueAvg = leagueAvgAllowed(p.pos);
  const matchupContext =
    matchup !== null && leagueAvg !== null
      ? { avgAllowed: matchup.avgAllowed, leagueAverage: leagueAvg }
      : null;
  const projection =
    projectWeeklyPoints(entries, gpCompleted.length > 0 ? gpCompleted.length : null, matchupContext)
      ?.projection ?? null;

  return {
    player: p,
    total,
    games,
    ppg,
    last3,
    projection: projection === null ? null : round1(projection),
    matchup,
    matchupText: matchup ? matchupShort(matchup) : null,
    // ROS + VOR are filled in by comparePlayers (they need shared maps).
    rosProjected: null,
    rosTotal: null,
    vor: 0,
  };
}

function asPick(p: PoolPlayer, total: number | null, games: number | null): DraftPick {
  return {
    pickNumber: 0,
    round: 0,
    teamId: '',
    teamName: '',
    player: {
      id: p.id,
      platformId: p.sleeperId ?? p.id,
      name: p.name,
      position: p.pos,
      team: p.team ?? 'FA',
    },
    seasonPoints: total ?? 0,
    seasonGames: games ?? undefined,
  };
}

/** Compare two pool players across the comparison rows. */
export function comparePlayers(
  playerA: PoolPlayer,
  playerB: PoolPlayer,
  weekly: WeeklyPprPoints | undefined,
  ctx: CompareContext,
): CompareResult {
  const metricsA = metricsFor(playerA, weekly, ctx);
  const metricsB = metricsFor(playerB, weekly, ctx);

  // Shared context maps: one ROS pass and one VOR pass for both players.
  const poolIndex = indexPool(POOL);
  const picks = [metricsA, metricsB].map(m => {
    const pick = asPick(m.player, m.total, m.games);
    const pooled = resolvePoolPlayer(pick.player, poolIndex);
    if (pooled) {
      pick.player.id = pooled.id;
      pick.player.platformId = pooled.sleeperId ?? pooled.id;
    }
    return pick;
  });
  const gamesPlayed: GamesPlayed | undefined = weekly
    ? { season: weekly.season, weeks: weekly.weeks, bySleeperId: weekly.gamesBySleeperId }
    : undefined;
  const outlooks = seasonOutlooks(picks, POOL, POOL.season === ctx.season ? WEEKLY_SHAPE : undefined, {
    scoring: ctx.scoring,
    slots: ctx.slots,
    teamCount: ctx.teamCount,
    currentWeek: ctx.currentWeek,
    season: ctx.season,
    gamesPlayed,
  });
  for (const [m, pick] of [[metricsA, picks[0]] as const, [metricsB, picks[1]] as const]) {
    const outlook = outlooks.get(`${pick.player.position}-${pick.player.id}`);
    m.rosProjected = outlook ? round1(outlook.projectedPoints) : null;
    m.rosTotal = outlook ? round1(outlook.total) : null;
  }

  const vors = vorPoints(POOL.players, ctx.valueLeague, ctx.vorCfg);
  metricsA.vor = round1(vors.get(playerA.id) ?? 0);
  metricsB.vor = round1(vors.get(playerB.id) ?? 0);

  const rows = buildRows(metricsA, metricsB, ctx.currentWeek);
  let winsA = 0;
  let winsB = 0;
  for (const r of rows) {
    if (r.winner === 'A') winsA++;
    else if (r.winner === 'B') winsB++;
  }
  const verdict = buildVerdict(metricsA, metricsB, rows, winsA, winsB);
  return { metricsA, metricsB, rows, verdict, winsA, winsB };
}

type Num = number | null;

function row(
  key: string,
  label: string,
  aVal: Num,
  bVal: Num,
  aText: string | null,
  bText: string | null,
  unit: string,
  higherWins: boolean = true,
): CompareRow {
  let winner: CompareWinner | null = null;
  let margin: string | null = null;
  if (aVal !== null && bVal !== null) {
    if (aVal === bVal) winner = 'tie';
    else {
      const aBetter = higherWins ? aVal > bVal : aVal < bVal;
      winner = aBetter ? 'A' : 'B';
      margin = `${winner === 'A' ? 'A' : 'B'} leads by ${round1(Math.abs(aVal - bVal))}${unit}`;
    }
  } else if (aVal !== null || bVal !== null) {
    winner = aVal !== null ? 'A' : 'B';
  }
  return { key, label, a: aText, b: bText, winner, margin };
}

function buildRows(a: CompareMetrics, b: CompareMetrics, currentWeek: number): CompareRow[] {
  return [
    row('projection', `Week ${currentWeek} projection`, a.projection, b.projection,
      fmtPts(a.projection), fmtPts(b.projection), ' pts'),
    row('matchup', `Week ${currentWeek} matchup`, a.matchup ? matchupScore(a.matchup) : null,
      b.matchup ? matchupScore(b.matchup) : null, a.matchupText, b.matchupText, ''),
    row('ppg', 'Points per game', a.ppg, b.ppg, fmtPts(a.ppg), fmtPts(b.ppg), ' pts'),
    row('last3', 'Last 3 games avg', a.last3, b.last3, fmtPts(a.last3), fmtPts(b.last3), ' pts'),
    row('total', 'Season points', a.total, b.total, fmtPts(a.total), fmtPts(b.total), ' pts'),
    row('ros', 'Rest-of-season projection', a.rosProjected, b.rosProjected,
      fmtPts(a.rosProjected), fmtPts(b.rosProjected), ' pts'),
    row('vor', 'Value over replacement', a.vor, b.vor,
      `${round1(a.vor)} VOR`, `${round1(b.vor)} VOR`, ' VOR'),
  ];
}

function buildVerdict(
  a: CompareMetrics,
  b: CompareMetrics,
  rows: CompareRow[],
  winsA: number,
  winsB: number,
): string {
  const nameA = a.player.name;
  const nameB = b.player.name;
  if (winsA === 0 && winsB === 0) {
    return `No usable data to separate ${nameA} and ${nameB} — pick players with weekly stats.`;
  }
  if (winsA === winsB) {
    return `${nameA} and ${nameB} split the comparison ${winsA}–${winsB}; pick on roster need, not a clear edge.`;
  }
  const [leader, laggard] = winsA > winsB ? [nameA, nameB] : [nameB, nameA];
  // Name the biggest numeric edge for the leading side.
  let biggest: CompareRow | null = null;
  for (const r of rows) {
    if (r.winner !== (winsA > winsB ? 'A' : 'B') || !r.margin) continue;
    if (!biggest || marginOf(r) > marginOf(biggest)) biggest = r;
  }
  const edge = biggest ? `, biggest edge ${biggest.label.toLowerCase()} (${biggest.margin})` : '';
  return `${leader} takes the comparison ${winsA}–${winsB} over ${laggard}${edge}.`;
}

function marginOf(r: CompareRow): number {
  const m = r.margin?.match(/leads by ([\d.]+)/);
  return m ? Number(m[1]) : 0;
}
