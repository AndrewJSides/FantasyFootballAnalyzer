// Week-N Projections board engine (backlog item 30).
//
// Ranks every startable QB/RB/WR/TE by THIS week's TraderApe projection
// (recency-weighted form + season baseline; the numeric matchup blend was
// turned off Nov 1, 2026 after the backtest measured it worse than no
// term) — the browsable board version of the same model the Start/Sit
// Compare page, and Matchup view price one player at a time. Players on
// bye in the current week are excluded (there is nothing to project).
// Item-136: players the bundled injury report rules out this week (Out, IR,
// PUP, NFI, suspension, COVID, or a season-ending IR description) are
// excluded on the same discipline — a frozen full projection for a player
// who will score 0 is worse than no line. The pool refreshes twice daily,
// so a Saturday downgrade reaches the board on the next deploy. Questionable
// and Doubtful players are NOT discounted: no practice-participation feed
// exists to price them, and an invented discount would be a guess.
// Players with no completed-week data land behind every projected player,
// ordered by season points per game and then pool rank, so deep
// projections never outrank a real one.
import type { WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { injuryOf } from '@/utils/seasonOutlook';
import {
  getMatchupRating,
  leagueAvgAllowed,
  type MatchupRating,
} from '@/utils/matchupRating';
import { consistencySummary, type ConsistencySummary } from '@/utils/consistency';
import { projectWeeklyPoints, type WeekPoints } from '@/utils/weeklyProjection';
import { soleBackMap, type SoleBackInfo } from '@/utils/roleChange';
import { WEATHER_RISK_POSITIONS, type WeatherRisk } from '@/utils/weatherRisk';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

export const WEEKLY_RANKS_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

/** Item-138 weather term, priced into the ranked projection: a passing-
 * game player in an outdoor game flagged windy or wet loses 25% of his
 * projection. Measured Nov 6, 2026 on the week-8 grade
 * (scripts/backtestWeather.ts): the -25% variant cut the 26 affected
 * players' MAE 5.57 -> 5.25 without raising overall MAE (5.64 -> 5.60);
 * the -15% and -35% variants also folded, -25% had the lowest affected
 * MAE. One graded week is thin evidence — re-measure when week 9 grades.
 * The wet-only sensitivity pass did NOT fold, so the term stays on the
 * both-flags rule, never wet alone. RBs are never downgraded: wet weather
 * favors the run. */
export const WEATHER_DOWNGRADE_PCT = 0.25;

export interface WeeklyRankRow {
  player: PoolPlayer;
  total: number | null;
  games: number | null;
  ppg: number | null;
  last3: number | null;
  /** This week's TraderApe projection; null when no completed-week data. */
  projection: number | null;
  matchup: MatchupRating | null;
  /** Item-20 consistency verdict from this player's completed weeks; null under 3 games. */
  consistency: ConsistencySummary | null;
  /** League mode: owning fantasy team name; null when on waivers. Absent in guest mode. */
  owner: string | null;
  /** Item-137 sole-back vacancy: null unless a ruled-out same-team RB mate
   * vacates real rotation usage this week. The upside is FOLDED into the
   * ranked projection (backtested Nov 6, 2026 on the week-8 grade: the
   * gated term cut the three affected RBs' MAE 14.95 -> 7.05 without
   * raising overall MAE) — the tag names the priced-in amount. */
  soleBack: SoleBackInfo | null;
  /** Item-138 weather downgrade: the points subtracted from this row's
   * projection for a windy/wet outdoor game, or null when the row is not
   * downgraded. The downgrade is FOLDED into the ranked projection
   * (backtested Nov 6, 2026 on the week-8 grade) — the tag names the
   * priced-in amount. */
  weatherAdjustment: number | null;
  /** 1-based rank within his position, priced on the same context. */
  posRank: number;
}

export interface BuildWeeklyRankingsInput {
  pool: DraftPoolFile;
  weekly: WeeklyPprPoints | undefined;
  currentWeek: number;
  ownerByPoolId?: Map<string, string>;
  /** Players kept per position after ranking; default 40. */
  perPosition?: number;
  /** Item-138: per-NFL-team kickoff weather risk (the same map the board's
   * tags render from). Absent/empty means no weather term — the
   * rank-movement re-price of last week and the Next Week view never
   * pass it, so neither inherits this week's weather. */
  weatherRisk?: Map<string, WeatherRisk>;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

interface Ranked extends WeeklyRankRow {
  sortScore: number;
  sortGroup: 0 | 1;
}

function rowFor(p: PoolPlayer, weekly: WeeklyPprPoints | undefined, currentWeek: number): Omit<Ranked, 'posRank'> {
  const sid = p.sleeperId;
  const byWeek = (sid && weekly?.pointsBySleeperId[sid]) ?? {};
  const entries: WeekPoints[] = Object.entries(byWeek)
    .map(([w, pts]) => ({ week: Number(w), pts }))
    .filter(e => Number.isFinite(e.week) && e.week < currentWeek)
    .sort((a, b) => a.week - b.week);
  const gpWeeks = sid ? weekly?.gamesBySleeperId[sid] ?? [] : [];
  const gpCompleted = gpWeeks.filter(w => w < currentWeek);

  const total = entries.length > 0 ? round1(entries.reduce((s, e) => s + e.pts, 0)) : null;
  const games =
    gpCompleted.length > 0 ? gpCompleted.length : entries.length > 0 ? entries.length : null;
  const ppg = total !== null && games !== null && games > 0 ? round1(total / games) : null;
  const last3Entries = entries.slice(-3);
  const last3 =
    last3Entries.length > 0
      ? round1(last3Entries.reduce((s, e) => s + e.pts, 0) / last3Entries.length)
      : null;

  const matchup = getMatchupRating(p.team, p.pos, currentWeek);
  const leagueAvg = leagueAvgAllowed(p.pos);
  const matchupContext =
    matchup !== null && leagueAvg !== null
      ? { avgAllowed: matchup.avgAllowed, leagueAverage: leagueAvg }
      : null;
  const projection =
    projectWeeklyPoints(entries, gpCompleted.length > 0 ? gpCompleted.length : null, matchupContext)
      ?.projection ?? null;

  // Consistency prices only completed weeks — the in-progress week never
  // counts, same as the projection entries above.
  const completedWeeks: Record<number, number> = {};
  for (const e of entries) completedWeeks[e.week] = e.pts;

  return {
    player: p,
    total,
    games,
    ppg,
    last3,
    projection: projection === null ? null : round1(projection),
    matchup,
    consistency: consistencySummary(
      Object.keys(completedWeeks).length > 0 ? completedWeeks : undefined,
      p.pos,
    ),
    owner: null,
    // The vacancy map attaches the real value at push time (rowFor has
    // no view of the pool's other players).
    soleBack: null,
    // The weather map attaches the real value at push time (rowFor has
    // no view of the kickoff forecast).
    weatherAdjustment: null,
    sortScore: projection ?? ppg ?? -1,
    sortGroup: projection === null ? 1 : 0,
  };
}

/**
 * Rank every startable skill-position player by this week's TraderApe
 * projection, top `perPosition` per position (default 40).
 */
export function buildWeeklyRankings({
  pool,
  weekly,
  currentWeek,
  ownerByPoolId,
  perPosition = 40,
  weatherRisk,
}: BuildWeeklyRankingsInput): WeeklyRankRow[] {
  const rows: WeeklyRankRow[] = [];
  const soleBack = soleBackMap(pool, weekly, currentWeek);
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    const ranked = pool.players
      .filter(p => {
        if (p.pos !== pos || p.bye === currentWeek) return false;
        // Item-136: ruled out this week — same predicate the board's
        // injury tag uses, so a tagged player can never also rank.
        const info = injuryOf(p);
        return !(info?.outNow || info?.seasonEnding);
      })
      .map(p => {
        const row = rowFor(p, weekly, currentWeek);
        const sole = soleBack.get(p.id) ?? null;
        // Item-137: the measured sole-back term is priced into the ranked
        // projection — the vacancy is a floor lift the frozen projection
        // misses, and the week-8 backtest (scripts/backtestSoleBack.ts)
        // says folding it wins. The sort uses the folded number so the
        // ranking reflects the same projection the board shows.
        let projection = row.projection;
        if (projection !== null && sole !== null) {
          projection = round1(projection + sole.upside);
        }
        // Item-138: the measured weather term is priced into the ranked
        // projection for passing-game positions in a flagged outdoor
        // game — the week-8 backtest (scripts/backtestWeather.ts) says
        // folding -25% wins. RBs are never downgraded (wet weather
        // favors the run), and the term only fires when the caller passes
        // the kickoff risk map — a failed forecast fetch leaves the
        // board on the unfolded projection, same as the tags.
        const risk = WEATHER_RISK_POSITIONS.has(p.pos)
          ? weatherRisk?.get(p.team) ?? null
          : null;
        let weatherAdjustment: number | null = null;
        if (projection !== null && risk !== null) {
          weatherAdjustment = -round1(projection * WEATHER_DOWNGRADE_PCT);
          projection = round1(projection + weatherAdjustment);
        }
        return {
          ...row,
          projection,
          soleBack: sole,
          weatherAdjustment,
          sortScore: projection ?? row.sortScore,
        };
      })
      .sort(
        (a, b) =>
          a.sortGroup - b.sortGroup ||
          b.sortScore - a.sortScore ||
          (a.player.overallRank ?? 9999) - (b.player.overallRank ?? 9999),
      )
      .slice(0, perPosition);
    ranked.forEach((r, i) => {
      rows.push({
        player: r.player,
        total: r.total,
        games: r.games,
        ppg: r.ppg,
        last3: r.last3,
        projection: r.projection,
        matchup: r.matchup,
        consistency: r.consistency,
        owner: ownerByPoolId?.get(r.player.id) ?? null,
        soleBack: r.soleBack,
        weatherAdjustment: r.weatherAdjustment,
        posRank: i + 1,
      });
    });
  }
  return rows;
}
