// Grades one week's projection snapshot against actuals and writes the
// categorized results plus learned factors for future predictions.
//
// Usage: `npm run grade:predictions` — grades the latest snapshot in
// data/projection-snapshots/index.json. `--season= --week=` override;
// `--force` re-grades an already-graded week. Exits 0 without writing when
// the week's grade file already exists, so the hourly loop can run this as
// a duty after games finish.
//
// Inputs:  data/projection-snapshots/<season>-week<week>-sleeper.json
//          Sleeper weekly actuals (same stat schema as the projections)
// Outputs: data/projection-grades/<season>-week<week>-sleeper.json
//          data/projection-grades/factors.json (re-aggregated over all weeks)

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  GRADE_THRESHOLD,
  gradePlayer,
  summarize,
  aggregateFactors,
  type ComponentLine,
  type GradeSummary,
} from '../src/utils/predictionGrading';

const UA = 'TraderApe (github.com/AndrewJSides/FantasyFootballAnalyzer)';
const SNAP_DIR = 'data/projection-snapshots';
const GRADE_DIR = 'data/projection-grades';
// Only fantasy-relevant projections get graded; sub-5 projections that blow
// up are counted separately as breakouts, not mixed into the miss rates.
const MIN_GRADED_PROJECTION = 5;

interface SnapshotPlayer {
  player_id: string;
  stats: Record<string, number>;
}

interface Snapshot {
  source: string;
  season: number;
  week: number;
  players: SnapshotPlayer[];
}

function toComponentLine(stats: Record<string, number>): ComponentLine {
  return {
    targets: stats.rec_tgt ?? 0,
    carries: stats.rush_att ?? 0,
    passAttempts: stats.pass_att ?? 0,
    yards: (stats.rec_yd ?? 0) + (stats.rush_yd ?? 0) + (stats.pass_yd ?? 0),
    touchdowns: (stats.rec_td ?? 0) + (stats.rush_td ?? 0) + (stats.pass_td ?? 0),
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  const arg = (name: string): string | undefined => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit?.split('=')[1];
  };
  const force = process.argv.includes('--force');

  let season = Number(arg('season') ?? 0);
  let week = Number(arg('week') ?? 0);
  if (!season || !week) {
    const index = JSON.parse(
      readFileSync(join(SNAP_DIR, 'index.json'), 'utf8'),
    ) as Array<{ season: number; week: number }>;
    const latest = index[index.length - 1];
    if (!latest) throw new Error('No snapshots in index.json; run snapshot:projections first');
    season = latest.season;
    week = latest.week;
  }

  const gradeFile = `${season}-week${week}-sleeper.json`;
  const gradePath = join(GRADE_DIR, gradeFile);
  if (existsSync(gradePath) && !force) {
    console.log(`Grade file already exists: ${gradePath} (use --force to re-grade)`);
    return;
  }

  const snapshot = JSON.parse(
    readFileSync(join(SNAP_DIR, `${season}-week${week}-sleeper.json`), 'utf8'),
  ) as Snapshot;

  const rawActuals = await getJson<Record<string, Record<string, number>> | Array<{ player_id: string | number; stats?: Record<string, number> }>>(
    `https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`,
  );
  const actuals = new Map<string, Record<string, number>>();
  if (Array.isArray(rawActuals)) {
    for (const e of rawActuals) {
      if (e.stats) actuals.set(String(e.player_id), e.stats);
    }
  } else {
    for (const [id, stats] of Object.entries(rawActuals)) actuals.set(id, stats);
  }

  // Completeness gate: a week whose games haven't been played yet returns
  // an empty actuals map, and grading it would mislabel every player as
  // did-not-play (this happened on the first week-8 run, Oct 28, before the
  // Oct 29–Nov 2 games). Refuse unless most graded players have a stat line.
  const gradedSet = snapshot.players.filter((p) => (p.stats.pts_ppr ?? 0) >= MIN_GRADED_PROJECTION);
  const played = gradedSet.filter((p) => {
    const s = actuals.get(p.player_id);
    return s !== undefined && (s.gp ?? 0) > 0;
  }).length;
  if (gradedSet.length > 0 && played / gradedSet.length < 0.5) {
    throw new Error(
      `Week ${week} not complete yet: only ${played}/${gradedSet.length} graded players have a stat line; grade after the week's games finish`,
    );
  }

  const grades = [];
  const breakouts = [];
  for (const p of snapshot.players) {
    const predicted = p.stats.pts_ppr ?? 0;
    const actualStats = actuals.get(p.player_id);
    const actual = actualStats ? (actualStats.pts_ppr ?? 0) : null;
    if (predicted >= MIN_GRADED_PROJECTION) {
      grades.push(
        gradePlayer(
          p.player_id,
          predicted,
          actual,
          toComponentLine(p.stats),
          actualStats ? toComponentLine(actualStats) : {},
        ),
      );
    } else if (actual !== null && actual - predicted > GRADE_THRESHOLD) {
      breakouts.push({ player_id: p.player_id, predicted, actual });
    }
  }

  const summary = summarize(grades, breakouts.length);
  const gradeDoc = {
    source: 'sleeper',
    season,
    week,
    graded_at: new Date().toISOString(),
    threshold: GRADE_THRESHOLD,
    scoring: 'pts_ppr',
    summary,
    grades,
    breakouts,
  };

  mkdirSync(GRADE_DIR, { recursive: true });
  writeFileSync(gradePath, `${JSON.stringify(gradeDoc, null, 2)}\n`);

  // Re-aggregate learned factors over every graded week.
  const summaries: GradeSummary[] = [];
  for (const f of readdirSync(GRADE_DIR)) {
    if (f === 'factors.json' || !f.endsWith('-sleeper.json')) continue;
    const doc = JSON.parse(readFileSync(join(GRADE_DIR, f), 'utf8')) as {
      summary: GradeSummary;
    };
    summaries.push(doc.summary);
  }
  const factors = {
    generated_at: new Date().toISOString(),
    ...aggregateFactors(summaries),
  };
  writeFileSync(join(GRADE_DIR, 'factors.json'), `${JSON.stringify(factors, null, 2)}\n`);

  console.log(
    `Graded ${season} week ${week}: ${summary.graded} players, ` +
      `${summary.outperformed} outperformed / ${summary.underperformed} underperformed / ` +
      `${summary.inLine} in-line, mean abs diff ${summary.meanAbsDiff} pts, ` +
      `${breakouts.length} breakouts. Wrote ${gradePath}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
