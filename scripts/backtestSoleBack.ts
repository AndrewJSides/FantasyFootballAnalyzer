// Backtests the sole-back term (backlog item 137, remainder) against the
// latest graded week, using the detector itself — not a reimplementation.
//
// The question: had the ranked projection folded in the "Sole back" upside
// (the ruled-out mate's recent usage at the lead back's own points per
// opportunity, capped at +10), would the week-8 grade have been better?
// Two passes, both scored by src/utils/soleBackBacktest:
//   gated      — only vacancies the detector would actually have fired on
//                in week 8: mates ruled out per the injury feed, where the
//                week-8 evidence is the Nov 4 review (Spears, Monangai)
//                plus a still-current Out status corroborated by a
//                multi-week absence (Hall — zero stats weeks 4–8, Out now).
//   sensitivity — every DNP vacancy treated as ruled out, including the
//                three with no injury evidence (Henderson, Harvey, Wilson),
//                whose week-8 zeros were most likely healthy scratches.
// The fold stands on the gated pass; the sensitivity pass shows how much
// the verdict depends on the injury gate doing its job.
//
// The week-8 pool is reconstructed, not read live: the bundled pool's
// injury statuses are cleared first (they reflect the latest refresh, not
// week 8 — a current-week injury must not leak into the reconstruction),
// then Out is set only on the gated/sensitivity mates. Weekly usage and
// points come from Sleeper's free weekly stats (weeks 1..N-1, gp > 0 only
// — the same rule the app's loader uses, so a DNP week leaves no entry
// and a mate's "recent 3" is his last three played weeks).
//
// Usage: `npm run backtest:sole-back` [--week=N] — grades the latest grade
// file by default. Writes data/projection-backtests/sole-back-weekN.json
// and prints the verdict. Network: Sleeper stats (free, no auth).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { soleBackMap } from '../src/utils/roleChange';
import {
  scoreSoleBackTerm,
  type SoleBackBacktestResult,
  type SoleBackGradeEntry,
} from '../src/utils/soleBackBacktest';
import type { WeeklyPprPoints } from '../src/api/sleeperWeeklyPoints';
import type { DraftPoolFile, PoolPlayer } from '../src/types/draft';

const UA = 'TraderApe (github.com/AndrewJSides/FantasyFootballAnalyzer)';
const GRADE_DIR = 'data/projection-grades';
const OUT_DIR = 'data/projection-backtests';
const OUT_STATUSES = new Set(['IR', 'Out', 'PUP', 'NFI', 'Sus', 'COV']);

/** Week-8 ruled-out mates the Nov 4, 2026 prediction review names explicitly. */
const REVIEW_EVIDENCE_OUT: Record<string, string> = {
  // Tyjae Spears (TEN): projected 7.49, scored 0 — DNP'd through week 8 on
  // a knee flare-up during high-ankle-sprain recovery.
  '9508': 'Tyjae Spears',
  // Kyle Monangai (CHI): projected 6.08, scored 0 — ruled out Oct 31 for a
  // 3rd straight game.
  '12534': 'Kyle Monangai',
};

interface GradeDoc {
  season: number;
  week: number;
  grades: (SoleBackGradeEntry & { primaryReason?: string | null })[];
}

async function getJson<T>(url: string): Promise<T> {
  // The proxy intermittently drops large Sleeper responses mid-body
  // (UND_ERR_SOCKET after ~85KB); a fresh request succeeds, so retry.
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastError = e;
      if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError;
}

interface SleeperWeekStats {
  pts_ppr?: number;
  gp?: number;
  rec_tgt?: number;
  rush_att?: number;
  pass_att?: number;
}

/** Weeks 1..throughWeek as the app's loader builds them: gp > 0 only. */
async function fetchWeeklySeries(
  season: number,
  throughWeek: number,
): Promise<WeeklyPprPoints> {
  const pointsBySleeperId: Record<string, Record<number, number>> = {};
  const gamesBySleeperId: Record<string, number[]> = {};
  const tdPtsBySleeperId: Record<string, Record<number, number>> = {};
  const usageBySleeperId: Record<string, Record<number, number>> = {};
  const loaded: number[] = [];
  for (let week = 1; week <= throughWeek; week++) {
    const stats = await getJson<Record<string, SleeperWeekStats>>(
      `https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`,
    );
    loaded.push(week);
    for (const [id, s] of Object.entries(stats)) {
      if ((s?.gp ?? 0) <= 0) continue;
      (gamesBySleeperId[id] ??= []).push(week);
      const pts = s?.pts_ppr;
      if (typeof pts === 'number' && Number.isFinite(pts)) {
        (pointsBySleeperId[id] ??= {})[week] = pts;
        (tdPtsBySleeperId[id] ??= {})[week] = 0;
        (usageBySleeperId[id] ??= {})[week] =
          (s?.rec_tgt ?? 0) + (s?.rush_att ?? 0) + (s?.pass_att ?? 0);
      }
    }
  }
  return {
    season,
    weeks: loaded,
    pointsBySleeperId,
    gamesBySleeperId,
    tdPtsBySleeperId,
    usageBySleeperId,
  };
}

function latestGradeFile(weekArg: string | undefined): string {
  if (weekArg) {
    const f = readdirSync(GRADE_DIR).find(
      f => f.endsWith('-sleeper.json') && f.includes(`-week${weekArg}-`),
    );
    if (!f) throw new Error(`No grade file for week ${weekArg} in ${GRADE_DIR}`);
    return f;
  }
  const files = readdirSync(GRADE_DIR)
    .filter(f => f.endsWith('-sleeper.json'))
    .sort();
  if (files.length === 0) throw new Error(`No grade files in ${GRADE_DIR}`);
  return files[files.length - 1];
}

async function main(): Promise<void> {
  const arg = (name: string): string | undefined => {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit?.slice(name.length + 3);
  };
  const gradeFile = latestGradeFile(arg('week'));
  const grade = JSON.parse(
    readFileSync(join(GRADE_DIR, gradeFile), 'utf8'),
  ) as GradeDoc;
  const { season, week } = grade;

  const schedule = JSON.parse(
    readFileSync('src/data/nflSchedule.2026.json', 'utf8'),
  ) as { weeks: Record<string, [string, string][]> };
  const playing = new Set<string>();
  for (const [away, home] of schedule.weeks[String(week)] ?? []) {
    playing.add(away);
    playing.add(home);
  }

  const poolJson = JSON.parse(
    readFileSync('src/data/draftPool.2026.json', 'utf8'),
  ) as { players: PoolPlayer[] };
  const bySleeperId = new Map<string, PoolPlayer>();
  for (const p of poolJson.players) {
    if (p.sleeperId) bySleeperId.set(String(p.sleeperId), p);
  }

  // DNP vacancies: graded RBs the grader marked did-not-play while their
  // team played — the rotation usage that went unfilled that week. A goose
  // egg (played, scored 0) is not a vacancy, and bye-week teams never
  // reach this list (their players score 0 with no game, not a vacancy).
  const dnpMates = grade.grades.filter(g => {
    const p = bySleeperId.get(g.player_id);
    return (
      g.primaryReason === 'did-not-play' &&
      p?.pos === 'RB' &&
      p.team !== 'FA' &&
      playing.has(p.team)
    );
  });
  const dnpNames = dnpMates.map(g => {
    const p = bySleeperId.get(g.player_id)!;
    return `${p.name} (${p.team}, projected ${g.predicted})`;
  });

  // The bundled pool's statuses are the latest refresh, not week N: clear
  // them all, then set Out only on the mates this pass treats as ruled out.
  const cleanPool = (): DraftPoolFile => ({
    players: poolJson.players.map(p => ({
      ...p,
      injuryStatus: undefined,
      injuryBodyPart: undefined,
      injuryNotes: undefined,
    })),
    season,
  }) as DraftPoolFile;

  const weekly = await fetchWeeklySeries(season, week - 1);
  const poolIdToSleeper = new Map<string, string>();
  for (const p of poolJson.players) {
    if (p.sleeperId) poolIdToSleeper.set(p.id, String(p.sleeperId));
  }
  const termsFrom = (pool: DraftPoolFile): Map<string, number> => {
    const terms = new Map<string, number>();
    for (const [poolId, info] of soleBackMap(pool, weekly, week)) {
      const sid = poolIdToSleeper.get(poolId);
      if (sid) terms.set(sid, info.upside);
    }
    return terms;
  };

  // Gated pass: review evidence + mates still Out in the bundled pool
  // (a current Out status on a player with a multi-week absence is the
  // corroboration available; the sensitivity pass covers it being new).
  const gatedPool = cleanPool();
  const gatedIds = new Set<string>();
  for (const g of dnpMates) {
    const bundled = bySleeperId.get(g.player_id);
    if (
      REVIEW_EVIDENCE_OUT[g.player_id] !== undefined ||
      (bundled?.injuryStatus !== undefined &&
        OUT_STATUSES.has(bundled.injuryStatus))
    ) {
      gatedIds.add(g.player_id);
      const p = gatedPool.players.find(
        x => String(x.sleeperId) === g.player_id,
      );
      if (p) p.injuryStatus = 'Out';
    }
  }
  const gated = scoreSoleBackTerm(grade.grades, termsFrom(gatedPool));

  // Sensitivity pass: every DNP vacancy treated as ruled out.
  const allPool = cleanPool();
  for (const g of dnpMates) {
    const p = allPool.players.find(x => String(x.sleeperId) === g.player_id);
    if (p) p.injuryStatus = 'Out';
  }
  const sensitivity = scoreSoleBackTerm(grade.grades, termsFrom(allPool));

  const out = {
    season,
    week,
    graded: grade.grades.length,
    dnpVacancies: dnpNames,
    gated: {
      mates: [...gatedIds].map(id => bySleeperId.get(id)?.name ?? id),
      ...gated,
    },
    sensitivity: {
      mates: dnpNames,
      ...sensitivity,
    },
    verdict: gated.fold
      ? 'FOLD — the gated term cuts affected MAE without raising overall MAE.'
      : 'HOLD — the gated term does not earn its place in the ranked projection yet.',
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `sole-back-week${week}.json`);
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);

  const print = (label: string, r: SoleBackBacktestResult): void => {
    console.log(`\n${label} (${r.cases.length} cases, ${r.gradedCount} graded):`);
    for (const c of r.cases) {
      const name = bySleeperId.get(c.playerId)?.name ?? c.playerId;
      console.log(
        `  ${name}: +${c.term.toFixed(1)} — error ${c.errorBefore.toFixed(2)} -> ${c.errorAfter.toFixed(2)}`,
      );
    }
    console.log(
      `  affected MAE ${r.affectedMaeBefore.toFixed(2)} -> ${r.affectedMaeAfter.toFixed(2)}; overall MAE ${r.overallMaeBefore.toFixed(2)} -> ${r.overallMaeAfter.toFixed(2)}; fold=${r.fold}`,
    );
  };
  console.log(`Sole-back backtest — ${season} week ${week} (${grade.grades.length} graded)`);
  console.log(`DNP vacancies: ${dnpNames.join('; ') || 'none'}`);
  print('Gated (injury-ruled-out only)', gated);
  print('Sensitivity (every DNP vacancy)', sensitivity);
  console.log(`\nVerdict: ${out.verdict}`);
  console.log(`Wrote ${outPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
