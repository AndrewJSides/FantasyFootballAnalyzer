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
// sibling scoring the shipped matchup-aware model on the same weeks — the
// comparison answers whether the matchup term helps. The matchup context
// for each scored week is rebuilt from completed weeks ONLY (see
// src/utils/backtestMatchup.ts), so no lookahead leaks into the numbers.

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
import type { WeekPoints } from '../src/utils/weeklyProjection';

const UA = 'TraderApe (github.com/AndrewJSides/FantasyFootballAnalyzer)';
const OUT_DIR = 'data/projection-backtests';
const POSITIONS = [...BACKTEST_POSITIONS] as const;

interface SleeperState {
  season: string;
  week: number;
}

interface SleeperStats {
  pts_ppr?: number;
}

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
      list.push({ week, pts: Math.round(s.pts_ppr * 10) / 10 });
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
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(OUT_DIR, `${season}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(`Backtested ${season} weeks 1–${lastWeek}: ${results.length} players`);
  printSummary('Overall (no matchup)', overall);
  printSummary('Overall (with matchup)', overallMatchup);
  for (const pos of POSITIONS) {
    printSummary(`${pos} (no matchup)`, byPosition[pos]);
    printSummary(`${pos} (with matchup)`, byPositionMatchup[pos]);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
