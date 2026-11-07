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
import { boomChance } from '@/utils/boomProbability';
import { consistencySummary, type ConsistencySummary } from '@/utils/consistency';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import {
  getMatchupRating,
  leagueAvgAllowed,
  matchupShort,
  type MatchupRating,
} from '@/utils/matchupRating';
import { vorPoints, type ValueLeague, type VorConfig } from '@/utils/projectionValues';
import { injuryOf, seasonOutlooks } from '@/utils/seasonOutlook';
import { soleBackMap, type SoleBackInfo } from '@/utils/roleChange';
import { weatherAdjustmentFor, type WeatherRisk } from '@/utils/weatherRisk';
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
  /** Item-136 remainder: true when the bundled injury report rules this
   * player out this week (Out, IR, PUP, NFI, suspension, COVID, or a
   * season-ending IR description) — his week projection is then 0, not
   * the frozen full projection, because he will score 0. */
  ruledOut: boolean;
  /** Item-173 remainder: the sole-back vacancy for this player, if any —
   * the measured term (item 137) folded into the week projection below,
   * so Compare agrees with the Weekly Rankings board, Start/Sit, and
   * the Matchup game plan on the same player in the same week. */
  soleBack: SoleBackInfo | null;
  /** Item-138 remainder: the weather downgrade for this player, if any —
   * the points subtracted from the week projection for a windy/wet
   * outdoor game. The measured term (item 138, -25% on QB/WR/TE) is
   * folded into the week projection below, so Compare agrees with the
   * Weekly Rankings board, Start/Sit, and the Matchup game plan on the
   * same player in the same week. Null when not downgraded. */
  weatherAdjustment: number | null;
  matchup: MatchupRating | null;
  matchupText: string | null;
  /** Projected points for the remaining weeks (ROS outlook). */
  rosProjected: number | null;
  /** ROS outlook total: scored so far + missed-week replacement + projected. */
  rosTotal: number | null;
  vor: number;
  /** Item-20 consistency verdict from completed weeks (null under 3 games). */
  consistency: ConsistencySummary | null;
  /** Item-100 chance this week's score clears the position's boom bar, 0–100. */
  boomPct: number | null;
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

function metricsFor(
  p: PoolPlayer,
  weekly: WeeklyPprPoints | undefined,
  ctx: CompareContext,
  sole: SoleBackInfo | null = null,
  weatherRisk?: Map<string, WeatherRisk>,
): CompareMetrics {
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
  // Item-136 remainder: same predicate as the Weekly Rankings exclusion,
  // so a ruled-out player can never also show a full week projection here
  // (the A.J. Brown week-8 miss class). Questionable/Doubtful players are
  // deliberately NOT discounted — no practice-participation feed exists
  // to price them, and an invented discount would be a guess.
  const info = injuryOf(p);
  const ruledOut = Boolean(info?.outNow || info?.seasonEnding);
  const rawProjection = ruledOut
    ? 0
    : (projectWeeklyPoints(entries, gpCompleted.length > 0 ? gpCompleted.length : null, matchupContext)
        ?.projection ?? null);
  // Item-173 remainder: fold the measured sole-back term into the week
  // projection — the same priced term the Weekly Rankings board, Start/Sit,
  // and the Matchup game plan already fold in. A ruled-out lead back never
  // wears the tag: his week score is 0, vacancy or not.
  let projection =
    rawProjection !== null && !ruledOut && sole !== null
      ? round1(rawProjection + sole.upside)
      : rawProjection;
  // Item-138 remainder: fold the measured weather term in on top of the
  // sole-back fold — the same order as the Weekly Rankings board — so a
  // passing-game player in a flagged outdoor game loses 25% of his
  // (possibly vacancy-lifted) projection here too. RBs are never
  // downgraded; a ruled-out player carries no weather tag: his week
  // score is 0, weather or not.
  let weatherAdjustment: number | null = null;
  if (projection !== null && !ruledOut) {
    const risk = weatherRisk?.get(p.team ?? '') ?? null;
    weatherAdjustment = weatherAdjustmentFor(projection, risk, p.pos);
    if (weatherAdjustment !== null) {
      projection = round1(projection + weatherAdjustment);
    }
  }

  // Consistency + boom chance price on the same completed-week series the
  // projection uses. Volatility is the population std dev of completed
  // weeks, null before 2 games (the rosterScoring convention); below 2
  // games the lineup-mode 45%-of-mean fallback stands in, the same
  // convention Start/Sit's Boom % column uses.
  const weeklyRecord: Record<number, number> = {};
  for (const e of entries) weeklyRecord[e.week] = e.pts;
  const consistency = consistencySummary(weeklyRecord, p.pos);
  const pts = entries.map(e => e.pts);
  let stdDev: number | null = null;
  if (pts.length >= 2) {
    const mean = pts.reduce((s, v) => s + v, 0) / pts.length;
    stdDev = Math.sqrt(pts.reduce((s, v) => s + (v - mean) ** 2, 0) / pts.length);
  }
  const pricedStd = stdDev ?? (projection !== null ? 0.45 * projection : null);
  const boomProb = boomChance(projection, pricedStd, p.pos).probability;

  return {
    player: p,
    total,
    games,
    ppg,
    last3,
    projection: projection === null ? null : round1(projection),
    ruledOut,
    soleBack: sole,
    weatherAdjustment,
    // A ruled-out player cannot boom: his week score is 0, whatever the
    // volatility of his completed weeks says.
    boomPct: ruledOut ? 0 : boomProb === null ? null : round1(boomProb * 100),
    consistency,
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

/** Compare two pool players across the comparison rows.
 * `soleBack` is an optional precomputed vacancy map (pool-id keyed, as
 * soleBackMap returns it); when omitted it is computed from the bundled
 * pool and the same weekly series, so the page never has to pass it.
 * `weatherRisk` is an optional precomputed kickoff weather map
 * (NFL-team keyed, as weatherRiskByTeam returns it); when omitted there
 * is no weather term — the engine cannot fetch a forecast, so the page
 * passes the map it already fetched. */
export function comparePlayers(
  playerA: PoolPlayer,
  playerB: PoolPlayer,
  weekly: WeeklyPprPoints | undefined,
  ctx: CompareContext,
  soleBack?: Map<string, SoleBackInfo>,
  weatherRisk?: Map<string, WeatherRisk>,
): CompareResult {
  const vacancies = soleBack ?? soleBackMap(POOL, weekly, ctx.currentWeek);
  const metricsA = metricsFor(playerA, weekly, ctx, vacancies.get(playerA.id) ?? null, weatherRisk);
  const metricsB = metricsFor(playerB, weekly, ctx, vacancies.get(playerB.id) ?? null, weatherRisk);

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

const consistencyScore = (c: ConsistencySummary | null): number | null =>
  c === null ? null : c.verdict === 'Steady' ? 2 : c.verdict === 'Mixed' ? 1 : 0;

const consistencyText = (m: CompareMetrics): string | null =>
  m.consistency === null
    ? null
    : `${m.consistency.verdict} (${round1(m.consistency.floor)}–${round1(m.consistency.ceiling)})`;

const pctText = (pct: number | null): string | null => (pct === null ? null : `${round1(pct)}%`);

function buildRows(a: CompareMetrics, b: CompareMetrics, currentWeek: number): CompareRow[] {
  const projText = (m: CompareMetrics): string | null => {
    if (m.ruledOut) return '0.0 pts (ruled out)';
    const base = fmtPts(m.projection);
    if (base === null) return base;
    const tags: string[] = [];
    if (m.soleBack) tags.push(`Sole back +${m.soleBack.upside.toFixed(1)}`);
    if (m.weatherAdjustment !== null) tags.push(`Weather ${m.weatherAdjustment.toFixed(1)}`);
    return tags.length > 0 ? `${base} · ${tags.join(' · ')}` : base;
  };
  return [
    row('projection', `Week ${currentWeek} projection`, a.projection, b.projection,
      projText(a), projText(b), ' pts'),
    row('matchup', `Week ${currentWeek} matchup`, a.matchup ? matchupScore(a.matchup) : null,
      b.matchup ? matchupScore(b.matchup) : null, a.matchupText, b.matchupText, ''),
    row('ppg', 'Points per game', a.ppg, b.ppg, fmtPts(a.ppg), fmtPts(b.ppg), ' pts'),
    row('last3', 'Last 3 games avg', a.last3, b.last3, fmtPts(a.last3), fmtPts(b.last3), ' pts'),
    row('total', 'Season points', a.total, b.total, fmtPts(a.total), fmtPts(b.total), ' pts'),
    row('ros', 'Rest-of-season projection', a.rosProjected, b.rosProjected,
      fmtPts(a.rosProjected), fmtPts(b.rosProjected), ' pts'),
    row('vor', 'Value over replacement', a.vor, b.vor,
      `${round1(a.vor)} VOR`, `${round1(b.vor)} VOR`, ' VOR'),
    row('consistency', 'Consistency (floor–ceiling)',
      consistencyScore(a.consistency), consistencyScore(b.consistency),
      consistencyText(a), consistencyText(b), ''),
    row('boom', 'Boom % (chance of a boom week)', a.boomPct, b.boomPct,
      pctText(a.boomPct), pctText(b.boomPct), '%'),
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
  // Item-136 remainder: name the zeroing so a lopsided verdict against a
  // ruled-out player reads as an injury call, not a talent call.
  const ruledOutNote =
    a.ruledOut && !b.ruledOut
      ? ` ${nameA} is ruled out this week, so the week projection is 0.`
      : !a.ruledOut && b.ruledOut
        ? ` ${nameB} is ruled out this week, so the week projection is 0.`
        : '';
  // Item-173 remainder: name the priced vacancy so a sole-back win reads
  // as a role call, not a talent call — the same discipline as the
  // ruled-out note above.
  const soleBackNote =
    a.soleBack && !b.soleBack
      ? ` ${nameA} is the sole back in his backfield this week — the vacated usage is priced into his projection.`
      : !a.soleBack && b.soleBack
        ? ` ${nameB} is the sole back in his backfield this week — the vacated usage is priced into his projection.`
        : '';
  // Item-138 remainder: name the priced weather downgrade so a weather
  // loss reads as a forecast call, not a talent call — same discipline.
  const weatherNote =
    a.weatherAdjustment !== null && b.weatherAdjustment === null
      ? ` ${nameA} plays in a windy or wet outdoor game — the passing-game downgrade is priced into his projection.`
      : a.weatherAdjustment === null && b.weatherAdjustment !== null
        ? ` ${nameB} plays in a windy or wet outdoor game — the passing-game downgrade is priced into his projection.`
        : '';
  if (winsA === 0 && winsB === 0) {
    return `No usable data to separate ${nameA} and ${nameB} — pick players with weekly stats.${ruledOutNote}${soleBackNote}${weatherNote}`;
  }
  if (winsA === winsB) {
    return `${nameA} and ${nameB} split the comparison ${winsA}–${winsB}; pick on roster need, not a clear edge.${ruledOutNote}${soleBackNote}${weatherNote}`;
  }
  const [leader, laggard] = winsA > winsB ? [nameA, nameB] : [nameB, nameA];
  // Name the biggest numeric edge for the leading side.
  let biggest: CompareRow | null = null;
  for (const r of rows) {
    if (r.winner !== (winsA > winsB ? 'A' : 'B') || !r.margin) continue;
    if (!biggest || marginOf(r) > marginOf(biggest)) biggest = r;
  }
  const edge = biggest ? `, biggest edge ${biggest.label.toLowerCase()} (${biggest.margin})` : '';
  return `${leader} takes the comparison ${winsA}–${winsB} over ${laggard}${edge}.${ruledOutNote}${soleBackNote}${weatherNote}`;
}

function marginOf(r: CompareRow): number {
  const m = r.margin?.match(/leads by ([\d.]+)/);
  return m ? Number(m[1]) : 0;
}
