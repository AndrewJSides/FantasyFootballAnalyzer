// Backtests the weekly projection model against completed weeks, using
// free Sleeper weekly stats (no auth). For every player with 3+ scored
// weeks, the model is replayed week by week (projection from earlier weeks
// only) and scored on MAE, bias, and within-±5 rate, overall and by
// position. This is the measured baseline the "better than Yahoo" claim
// will be judged against once Yahoo weekly estimates are snapshotted.
//
// Usage: `npm run backtest:projections` — backtests weeks 1..(current-1)
// per Sleeper's state endpoint. `--season= --weeks=` override the range.
// Only completed weeks are used: the current week is excluded, so a
// mid-week run never scores partial actuals.
//
// Output: data/projection-backtests/<season>.json (overwritten each run)
// plus a printed summary. The file keeps `overall`/`byPosition` for the
// matchup-free model (backwards-compatible shape) and adds a `withMatchup`
// sibling scoring the default-priced matchup-aware model on the same weeks.
// `pricingVariants` re-scores the same weeks under each candidate
// MatchupPricing (smaller blends, tighter caps, sample-size gating) — the
// Nov 1, 2026 re-pricing experiment (backlog item 1 follow-up): the
// as-shipped half-deviation/±5 pricing measured worse than no term, so the
// variants decide what DEFAULT_MATCHUP_PRICING should be. The matchup
// context for each scored week is rebuilt from completed weeks ONLY (see
// src/utils/backtestMatchup.ts), so no lookahead leaks into the numbers.
// `tdVariants` does the same for the TD regression term (backlog pipeline
// follow-up, Nov 3, 2026): candidate strengths/caps plus a per-position
// variant, scored matchup-free against the same baseline, deciding
// DEFAULT_TD_REGRESSION. `usageVariants` does the same for the usage-trend
// term (the other half of the factors.json application rule, Nov 3, 2026):
// candidate strengths/caps plus a per-position variant priced at the
// graded usage-driven miss shares, deciding DEFAULT_USAGE_TREND.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aggregateBacktests,
  backtestPlayer,
  type BacktestSummary,
} from '../src/utils/projectionBacktest';
import {
  BACKTEST_POSITIONS,
  buildAllowedByWeek,
  buildOpponentMap,
  matchupContextForWeek,
} from '../src/utils/backtestMatchup';
import type {
  MatchupPricing,
  TdRegression,
  UsageTrend,
  WeekPoints,
} from '../src/utils/weeklyProjection';

const UA = 'TraderApe (github.com/AndrewJSides/FantasyFootballAnalyzer)';
const OUT_DIR = 'data/projection-backtests';
const POSITIONS = [...BACKTEST_POSITIONS] as const;

/**
 * Candidate pricings for the matchup term (backlog item 1 follow-up,
 * Nov 1, 2026). The as-shipped blend-0.5/cap-5 pricing measured worse than
 * no term on weeks 1–7 (MAE 7.03 vs 6.78), so the harness re-scores the
 * same predictions under smaller blends, tighter caps, and sample-size
 * gating; the winner becomes DEFAULT_MATCHUP_PRICING.
 */
const PRICING_VARIANTS: { name: string; pricing: MatchupPricing }[] = [
  { name: 'blend 0.5, cap 5 (shipped)', pricing: { blend: 0.5, cap: 5 } },
  { name: 'blend 0.25, cap 5', pricing: { blend: 0.25, cap: 5 } },
  { name: 'blend 0.5, cap 3', pricing: { blend: 0.5, cap: 3 } },
  { name: 'blend 0.25, cap 3', pricing: { blend: 0.25, cap: 3 } },
  { name: 'blend 0.125, cap 3', pricing: { blend: 0.125, cap: 3 } },
  {
    name: 'blend 0.25, cap 3, min 3 wks',
    pricing: { blend: 0.25, cap: 3, minSampleWeeks: 3 },
  },
  { name: 'no term (blend 0)', pricing: { blend: 0, cap: 5 } },
];

interface SleeperState {
  season: string;
  week: number;
}

interface SleeperStats {
  pts_ppr?: number;
  pass_td?: number;
  rush_td?: number;
  rec_td?: number;
  rec_tgt?: number;
  rush_att?: number;
  pass_att?: number;
}

/**
 * Candidate pricings for the TD regression term (backlog pipeline
 * follow-up, Nov 3, 2026 — the graded-weeks application rule is to regress
 * projected TDs toward the player's TD mean in proportion to the
 * TD-variance share of misses). Scored on the same weeks as the baseline,
 * TD-free, so the winner (or no term) becomes DEFAULT_TD_REGRESSION.
 * The per-position variant prices QB at the graded QB TD-variance share's
 * neighborhood (0.533 of QB misses) and the other skill positions lower,
 * matching factors.json's byPosition split.
 */
interface TdVariant {
  name: string;
  forPosition: (position: string | undefined) => TdRegression | null;
}
const tdConfig = (strength: number, cap: number): TdRegression => ({ strength, cap });
const TD_VARIANTS: TdVariant[] = [
  { name: 'no term (strength 0)', forPosition: () => tdConfig(0, 5) },
  { name: 'strength 0.25, cap 3', forPosition: () => tdConfig(0.25, 3) },
  { name: 'strength 0.5, cap 3', forPosition: () => tdConfig(0.5, 3) },
  { name: 'strength 0.5, cap 5', forPosition: () => tdConfig(0.5, 5) },
  { name: 'strength 1.0, cap 5', forPosition: () => tdConfig(1.0, 5) },
  {
    name: 'per-position (QB 0.5, others 0.125), cap 3',
    forPosition: pos => tdConfig(pos === 'QB' ? 0.5 : 0.125, 3),
  },
];

interface SleeperPlayer {
  position?: string;
  team?: string;
}

interface ScheduleFile {
  weeks: Record<string, [string, string][]>;
}

async function getJson<T>(url: string): Promise<T> {
  // Sleeper drops an occasional request (seen on the 14 MB players map);
  // retry a few times before giving up rather than losing the whole run.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(`${url}: fetch failed (${lastErr instanceof Error ? lastErr.message : lastErr})`);
}

function printSummary(label: string, s: BacktestSummary): void {
  console.log(
    `${label}: ${s.predictions} predictions, MAE ${s.mae} (naive ${s.naiveMae}), ` +
      `bias ${s.bias}, within ±5: ${Math.round(s.within5Rate * 100)}%`,
  );
}

async function main(): Promise<void> {
  const arg = (name: string): string | undefined => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit?.split('=')[1];
  };
  const state = await getJson<SleeperState>('https://api.sleeper.app/v1/state/nfl');
  const season = Number(arg('season') ?? state.season);
  const lastWeek = Number(arg('weeks') ?? state.week - 1);
  if (!season || !lastWeek || lastWeek < 2) {
    throw new Error(`Bad season/weeks from state: ${JSON.stringify(state)}`);
  }

  const players = await getJson<Record<string, SleeperPlayer>>(
    'https://api.sleeper.app/v1/players/nfl',
  );
  const statsByWeek: Record<number, Record<string, SleeperStats>> = {};
  const series = new Map<string, WeekPoints[]>();
  for (let week = 1; week <= lastWeek; week++) {
    const stats = await getJson<Record<string, SleeperStats>>(
      `https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`,
    );
    statsByWeek[week] = stats;
    for (const [id, s] of Object.entries(stats)) {
      if (typeof s.pts_ppr !== 'number') continue;
      const list = series.get(id) ?? [];
      // Standard Sleeper TD scoring: 4 per passing TD, 6 per rush/rec TD.
      const tdPts =
        Math.round(
          (4 * (s.pass_td ?? 0) + 6 * (s.rush_td ?? 0) + 6 * (s.rec_td ?? 0)) *
            10,
        ) / 10;
      // Usage = opportunities (targets + carries + pass attempts), the
      // grading attribution's definition in predictionGrading.ts.
      const usage = (s.rec_tgt ?? 0) + (s.rush_att ?? 0) + (s.pass_att ?? 0);
      list.push({ week, pts: Math.round(s.pts_ppr * 10) / 10, tdPts, usage });
      series.set(id, list);
    }
  }

  // What the matchup term would have seen for each scored week:
  // opponents from the bundled schedule, allowed-vs-position rebuilt
  // from completed weeks only (weeks < target). A player's team is the
  // current Sleeper roster team — a mid-season trade mislabels at most
  // a handful of early target weeks, acceptable for the comparison.
  const schedule = JSON.parse(
    readFileSync('src/data/nflSchedule.2026.json', 'utf8'),
  ) as ScheduleFile;
  const opponentByWeek = buildOpponentMap(schedule.weeks);
  const allowedByWeek = buildAllowedByWeek(players, statsByWeek, opponentByWeek);
  const matchupFor = (playerId: string) => {
    const meta = players[playerId];
    const team = meta?.team;
    const position = meta?.position;
    if (!team || !position) return undefined;
    return (week: number) =>
      matchupContextForWeek(week, team, position, opponentByWeek, allowedByWeek);
  };

  const ids = [...series.entries()].filter(([, weeks]) => weeks.length >= 3);
  const results = ids.map(([id, weeks]) => backtestPlayer(id, weeks));
  const resultsMatchup = ids.map(([id, weeks]) =>
    backtestPlayer(id, weeks, matchupFor(id)),
  );
  const overall = aggregateBacktests(results);
  const overallMatchup = aggregateBacktests(resultsMatchup);
  const byPosition: Record<string, BacktestSummary> = {};
  const byPositionMatchup: Record<string, BacktestSummary> = {};
  for (const pos of POSITIONS) {
    const slice = results.filter(
      r => players[r.playerId]?.position === pos,
    );
    const sliceMatchup = resultsMatchup.filter(
      r => players[r.playerId]?.position === pos,
    );
    byPosition[pos] = aggregateBacktests(slice);
    byPositionMatchup[pos] = aggregateBacktests(sliceMatchup);
  }

  // Re-price experiment: the same predictions under each candidate
  // pricing, scored on the same weeks. The variant resolver attaches the
  // candidate pricing to the context the model would have seen — no
  // lookahead, same completed-weeks-only inputs as the shipped run.
  const matchupForPriced = (playerId: string, pricing: MatchupPricing) => {
    const base = matchupFor(playerId);
    if (!base) return undefined;
    return (week: number) => {
      const ctx = base(week);
      return ctx ? { ...ctx, pricing } : null;
    };
  };
  const pricingVariants = PRICING_VARIANTS.map(v => {
    const vResults = ids.map(([id, weeks]) =>
      backtestPlayer(id, weeks, matchupForPriced(id, v.pricing)),
    );
    const vByPosition: Record<string, BacktestSummary> = {};
    for (const pos of POSITIONS) {
      vByPosition[pos] = aggregateBacktests(
        vResults.filter(r => players[r.playerId]?.position === pos),
      );
    }
    return {
      name: v.name,
      pricing: v.pricing,
      players: vResults.length,
      overall: aggregateBacktests(vResults),
      byPosition: vByPosition,
    };
  });

  // TD-term experiment: same weeks, matchup-free, one config per player
  // (the per-position variant reads the player's Sleeper position).
  const tdVariants = TD_VARIANTS.map(v => {
    const vResults = ids.map(([id, weeks]) =>
      backtestPlayer(id, weeks, undefined, v.forPosition(players[id]?.position)),
    );
    const vByPosition: Record<string, BacktestSummary> = {};
    for (const pos of POSITIONS) {
      vByPosition[pos] = aggregateBacktests(
        vResults.filter(r => players[r.playerId]?.position === pos),
      );
    }
    return {
      name: v.name,
      players: vResults.length,
      overall: aggregateBacktests(vResults),
      byPosition: vByPosition,
    };
  });

  // Usage-term experiment: same weeks, matchup-free, one config per
  // player (the per-position variant reads the graded usage-driven miss
  // shares from factors.json: QB 0.333, RB 0.233, WR 0.281, TE 0.067).
  interface UsageVariant {
    name: string;
    forPosition: (position: string | undefined) => UsageTrend | null;
  }
  const usageConfig = (strength: number, cap: number): UsageTrend => ({ strength, cap });
  const USAGE_VARIANTS: UsageVariant[] = [
    { name: 'no term (strength 0)', forPosition: () => usageConfig(0, 5) },
    { name: 'strength 0.25, cap 3', forPosition: () => usageConfig(0.25, 3) },
    { name: 'strength 0.5, cap 3', forPosition: () => usageConfig(0.5, 3) },
    { name: 'strength 0.5, cap 5', forPosition: () => usageConfig(0.5, 5) },
    { name: 'strength 1.0, cap 5', forPosition: () => usageConfig(1.0, 5) },
    {
      name: 'per-position (graded usage shares), cap 3',
      forPosition: pos =>
        usageConfig(
          pos === 'QB' ? 0.33 : pos === 'RB' ? 0.23 : pos === 'WR' ? 0.28 : pos === 'TE' ? 0.07 : 0.2,
          3,
        ),
    },
  ];
  const usageVariants = USAGE_VARIANTS.map(v => {
    const vResults = ids.map(([id, weeks]) =>
      backtestPlayer(id, weeks, undefined, null, v.forPosition(players[id]?.position)),
    );
    const vByPosition: Record<string, BacktestSummary> = {};
    for (const pos of POSITIONS) {
      vByPosition[pos] = aggregateBacktests(
        vResults.filter(r => players[r.playerId]?.position === pos),
      );
    }
    return {
      name: v.name,
      players: vResults.length,
      overall: aggregateBacktests(vResults),
      byPosition: vByPosition,
    };
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const out = {
    season,
    weeks: [1, lastWeek],
    players: results.length,
    overall,
    byPosition,
    withMatchup: {
      players: resultsMatchup.length,
      overall: overallMatchup,
      byPosition: byPositionMatchup,
    },
    pricingVariants,
    tdVariants,
    usageVariants,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(OUT_DIR, `${season}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(`Backtested ${season} weeks 1–${lastWeek}: ${results.length} players`);
  printSummary('Overall (no matchup)', overall);
  printSummary('Overall (with matchup, default pricing)', overallMatchup);
  for (const pos of POSITIONS) {
    printSummary(`${pos} (no matchup)`, byPosition[pos]);
    printSummary(`${pos} (with matchup)`, byPositionMatchup[pos]);
  }
  console.log('Matchup-term pricing variants:');
  for (const v of pricingVariants) {
    printSummary(`  ${v.name}`, v.overall);
  }
  console.log('TD-term variants (matchup-free):');
  for (const v of tdVariants) {
    printSummary(`  ${v.name}`, v.overall);
  }
  console.log('Usage-term variants (matchup-free):');
  for (const v of usageVariants) {
    printSummary(`  ${v.name}`, v.overall);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
