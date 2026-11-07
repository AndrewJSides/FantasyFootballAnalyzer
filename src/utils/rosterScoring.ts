// Roster scoring core shared by the Start/Sit optimizer and the weekly
// matchup preview: prices each roster player on TraderApe's weekly projection
// model (recency-weighted last-4 form blended with the season baseline,
// nudged by this week's matchup difficulty), falling back to the season
// average (or zero with no data at all) so a roster still gets a lineup
// instead of an empty one. Moved here from StartSitPage.tsx (Oct 29, 2026)
// unchanged so both consumers score identically.

import type { Player } from '@/types';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import {
  DEFAULT_TD_REGRESSION,
  DEFAULT_USAGE_TREND,
  projectWeeklyPoints,
  type TdRegression,
  type UsageTrend,
  type WeeklyProjection,
} from '@/utils/weeklyProjection';
import {
  getMatchupRating,
  leagueAvgAllowed,
  type MatchupRating,
} from '@/utils/matchupRating';
import type { OptimalLineupPlayer } from '@/utils/optimalLineup';
import { injuryTier, injuryTierLabel, type InjurySeverityTier } from '@/utils/injuryReport';
import type { SoleBackInfo } from '@/utils/roleChange';
import {
  weatherAdjustmentFor,
  WEATHER_RISK_POSITIONS,
  type WeatherRisk,
} from '@/utils/weatherRisk';

export interface ScoredPlayer extends OptimalLineupPlayer {
  player: Player;
  nflTeam: string;
  ppg: number | null;
  last3: number | null;
  projection: WeeklyProjection | null;
  /** Population std dev of completed-week scores; null with fewer than 2 games. */
  stdDev: number | null;
  /**
   * Item-173 sole-back vacancy for this player (null when none): a ruled-out
   * same-team RB mate vacates real rotation usage this week. The upside is
   * FOLDED into `projection` and `score` (backtested Nov 6, 2026 on the
   * week-8 grade — the gated term cut the three affected RBs' MAE 14.95 ->
   * 7.05 without raising overall MAE) — the tag on the consuming page
   * names the priced-in amount.
   */
  soleBack: SoleBackInfo | null;
  /**
   * Item-138 weather downgrade for this player (null when none): the
   * points subtracted from this week's projection for a windy/wet
   * outdoor game. FOLDED into `projection` and `score` (backtested Nov
   * 6, 2026 on the week-8 grade — the -25% term cut the 26 flagged-game
   * players' MAE 5.57 -> 5.25 without raising overall MAE) — the tag on
   * the consuming page names the priced-in amount. RBs are never
   * downgraded: wet weather favors the run.
   */
  weatherAdjustment: number | null;
  bye: number | null;
  onBye: boolean;
  matchup: MatchupRating | null;
  /**
   * True when the player's bundled injury designation keeps him off the
   * field this week (Out, or a season-ending IR stint). Questionable /
   * Doubtful stay eligible as game-time decisions — Late-swap watch covers
   * those — so this is strictly the never-start set.
   */
  injuredOut: boolean;
  /** e.g. "Out (Knee)" for injuredOut players, null otherwise. */
  injuryLabel: string | null;
  /**
   * Raw injury tier from the bundled pool ('out', 'season-ending', 'other',
   * ...). Exposed so multi-week consumers can apply the current-week-only
   * rule for 'out' (an Out-today player may return) while season-ending
   * designations rule a player out for every remaining week.
   */
  injuryTier: InjurySeverityTier;
}

export interface RosterScoreInputs {
  roster: Player[];
  weeklyPoints?: Record<string, Record<string, number>>;
  /**
   * Per-week TD fantasy points keyed like weeklyPoints (guest mode: from
   * the Sleeper fetch's component lines; league mode: from the runtime
   * Sleeper join in leagueComponents.ts, since the sync stores no
   * component lines). When a player's series carries a TD line for every
   * week, the projection model's TD regression term prices it; a partial
   * series is skipped by the model, never guessed.
   */
  weeklyTdPoints?: Record<string, Record<string, number>>;
  /**
   * Per-week opportunities (targets + carries + pass attempts) keyed like
   * weeklyPoints, feeding the projection model's usage-trend term under
   * the same full-series rule as weeklyTdPoints. Guest mode from the
   * Sleeper fetch, league mode from the runtime join.
   */
  weeklyUsage?: Record<string, Record<string, number>>;
  /**
   * Pricing overrides for the TD regression and usage-trend terms.
   * Omitted = the production defaults (both strength 0 today, measured
   * OFF on weeks 1–8) — so wiring the data through changes no production
   * number until a future re-measurement turns a term on, at which point
   * every scoreRosterPlayers consumer moves together.
   */
  tdRegression?: TdRegression | null;
  usageTrend?: UsageTrend | null;
  /**
   * Item-173 sole-back map (pool-id keyed, as soleBackMap returns it):
   * each entry's upside is folded into that player's weekly projection
   * and score. A player with no entry prices as before; a missing map
   * means the term stays off entirely. The map is a this-week signal —
   * callers planning future weeks (lineupPlanner) gate it to the
   * current week.
   */
  soleBack?: Map<string, SoleBackInfo>;
  /**
   * Item-138 kickoff weather risk map (NFL-team keyed, as
   * weatherRiskByTeam returns it): each passing-game player's weekly
   * projection is cut 25% in a flagged outdoor game. A missing map
   * means the term stays off entirely — a failed forecast fetch leaves
   * every surface on the unfolded projection. The map is a this-week
   * signal — callers planning future weeks (lineupPlanner) gate it to
   * the current week, like the sole-back map.
   */
  weatherRisk?: Map<string, WeatherRisk>;
  gamesBySleeperId?: Record<string, number[]>;
  gamesSeason?: number;
  season?: number;
  currentWeek?: number;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Shared scoring core: league mode feeds league-loaded weekly points, guest
// mode feeds Sleeper weekly PPR fetched at runtime. Rank on the projection
// where one exists; fall back to the season average (or zero with no data at
// all) so a roster still gets a lineup instead of an empty one.
export function scoreRosterPlayers(inputs: RosterScoreInputs): ScoredPlayer[] {
  const poolIndex = indexPool(POOL);
  const {
    roster,
    weeklyPoints,
    weeklyTdPoints,
    weeklyUsage,
    tdRegression,
    usageTrend,
    soleBack,
    weatherRisk,
    gamesBySleeperId,
    gamesSeason,
    season,
    currentWeek,
  } = inputs;
  return roster.map(rosterPlayer => {
    // Weekly points are keyed by platform player id; try both id spaces
    // (Sleeper ids live in one, ESPN/Yahoo in the other). TD and usage
    // lines use the same keying and are attached per week only when the
    // week carries a finite value, so a partial component series reaches
    // the model as-is and its term is skipped rather than guessed.
    const weekly =
      weeklyPoints?.[rosterPlayer.platformId] ?? weeklyPoints?.[rosterPlayer.id];
    const weeklyTd =
      weeklyTdPoints?.[rosterPlayer.platformId] ?? weeklyTdPoints?.[rosterPlayer.id];
    const weeklyUse =
      weeklyUsage?.[rosterPlayer.platformId] ?? weeklyUsage?.[rosterPlayer.id];
    const weeks = weekly
      ? Object.entries(weekly)
          .map(([w, pts]) => {
            const td = weeklyTd?.[w];
            const usage = weeklyUse?.[w];
            return {
              week: Number(w),
              pts,
              ...(typeof td === 'number' && Number.isFinite(td) ? { tdPts: td } : {}),
              ...(typeof usage === 'number' && Number.isFinite(usage)
                ? { usage }
                : {}),
            };
          })
          .filter(e => Number.isFinite(e.week))
          .sort((a, b) => a.week - b.week)
      : [];
    const completed =
      currentWeek !== undefined ? weeks.filter(e => e.week < currentWeek) : weeks;
    const usable = completed.length > 0 ? completed : weeks;
    // Games played, where the loader supplies it (Sleeper ids): the count
    // of completed weeks the player actually played. Otherwise the weekly
    // entry count stands in — a 0-point week still counts as played when
    // the platform reports it, and the weekly fallback only undercounts
    // players whose platform omits scoreless weeks.
    const gpWeeks =
      gamesSeason === season && gamesBySleeperId
        ? (gamesBySleeperId[rosterPlayer.platformId] ??
          gamesBySleeperId[rosterPlayer.id])
        : undefined;
    const gpCompleted = gpWeeks
      ? currentWeek !== undefined
        ? gpWeeks.filter(w => w < currentWeek).length
        : gpWeeks.length
      : null;
    const games = gpCompleted ?? (usable.length > 0 ? usable.length : null);
    const total =
      rosterPlayer.seasonPoints ?? (usable.length > 0 ? usable.reduce((s, e) => s + e.pts, 0) : null);
    const ppg = games !== null && games > 0 && total !== null ? round1(total / games) : null;
    const last3Entries = usable.slice(-3);
    const last3 =
      last3Entries.length > 0
        ? round1(last3Entries.reduce((s, e) => s + e.pts, 0) / last3Entries.length)
        : null;
    // Matchup context for the numeric projection blend: the opponent's
    // allowed-vs-position and the league-wide average, so the model nudges
    // the projection up for soft matchups and down for tough ones. Same
    // rating object also feeds the Matchup column, so the number and the
    // display never disagree.
    const matchup = getMatchupRating(rosterPlayer.team, rosterPlayer.position, currentWeek);
    const leagueAvg = leagueAvgAllowed(rosterPlayer.position);
    const matchupContext =
      matchup !== null && leagueAvg !== null
        ? { avgAllowed: matchup.avgAllowed, leagueAverage: leagueAvg }
        : null;
    const projection = projectWeeklyPoints(
      completed,
      gpCompleted,
      matchupContext,
      tdRegression ?? DEFAULT_TD_REGRESSION,
      usageTrend ?? DEFAULT_USAGE_TREND,
    );
    const poolPlayer = resolvePoolPlayer(rosterPlayer, poolIndex);
    const bye = poolPlayer?.bye ?? null;
    // Item-173: the measured sole-back term folds into this week's
    // projection (and therefore `score`, which the optimizer ranks on),
    // so Start/Sit, the matchup preview, the game plan, and the position
    // battles all price the same number the Weekly Rankings board shows.
    // A ruled-out or bye-week lead back never starts, so the fold is
    // inert for him — the term only moves an eligible starter's call.
    const sole = poolPlayer ? (soleBack?.get(poolPlayer.id) ?? null) : null;
    let foldedProjection =
      projection !== null && sole !== null
        ? { ...projection, projection: round1(projection.projection + sole.upside) }
        : projection;
    // Item-138: the measured weather term folds in on top of the
    // sole-back fold — the same order as the Weekly Rankings board —
    // so a passing-game player in a flagged outdoor game loses 25% of
    // his (possibly vacancy-lifted) projection here too. RBs are never
    // downgraded. A ruled-out or bye-week player never starts, so the
    // fold is inert for him — the term only moves an eligible
    // starter's call.
    const risk = WEATHER_RISK_POSITIONS.has(rosterPlayer.position)
      ? weatherRisk?.get(rosterPlayer.team) ?? null
      : null;
    const weatherAdjustment =
      foldedProjection !== null
        ? weatherAdjustmentFor(foldedProjection.projection, risk, rosterPlayer.position)
        : null;
    if (foldedProjection !== null && weatherAdjustment !== null) {
      foldedProjection = {
        ...foldedProjection,
        projection: round1(foldedProjection.projection + weatherAdjustment),
      };
    }
    // Injury designations from the bundled pool (refreshed twice daily):
    // Out and season-ending IR never start, same discipline as bye weeks.
    const tier = poolPlayer ? injuryTier(poolPlayer) : 'other';
    const injuredOut = tier === 'season-ending' || tier === 'out';
    const injuryLabel =
      injuredOut && poolPlayer
        ? poolPlayer.injuryBodyPart
          ? `${injuryTierLabel(poolPlayer, tier)} (${poolPlayer.injuryBodyPart})`
          : injuryTierLabel(poolPlayer, tier)
        : null;
    // Week-to-week volatility for the Monte Carlo win-probability model:
    // population std dev of the player's own completed weeks, same series
    // the consistency ratings summarize. Null before 2 games — the caller
    // substitutes a position-scaled estimate.
    const scoredWeeks = completed.map(e => e.pts);
    let stdDev: number | null = null;
    if (scoredWeeks.length >= 2) {
      const mean = scoredWeeks.reduce((a, b) => a + b, 0) / scoredWeeks.length;
      stdDev = Math.sqrt(
        scoredWeeks.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scoredWeeks.length,
      );
    }
    return {
      id: rosterPlayer.id,
      name: rosterPlayer.name,
      position: rosterPlayer.position,
      score: foldedProjection?.projection ?? ppg ?? 0,
      player: rosterPlayer,
      nflTeam: rosterPlayer.team,
      ppg,
      last3,
      projection: foldedProjection,
      stdDev,
      soleBack: sole,
      weatherAdjustment,
      bye,
      onBye: bye !== null && currentWeek !== undefined && bye === currentWeek,
      matchup,
      injuredOut,
      injuryLabel,
      injuryTier: tier,
    };
  });
}
