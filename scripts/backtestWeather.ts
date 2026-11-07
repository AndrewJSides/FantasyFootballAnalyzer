// Backtests the weather term (backlog item 138, remainder) against the
// latest graded week, using the tag's own flag rule — not a
// reimplementation of the forecast.
//
// The question: had the ranked projection folded in a passing-game
// downgrade for QB/WR/TE in outdoor games flagged windy or wet, would the
// week-8 grade have been better? The live tag fires on the Open-Meteo
// forecast (wind 15+ mph sustained or 25+ mph gusts, 40%+ precipitation
// probability); a forecast is gone a week later, so the reconstruction
// uses the Open-Meteo archive API (free, no key) at the same kickoff
// hour — wind/gusts under the same thresholds, and observed precipitation
// > 0 mm in the kickoff hour as the wet proxy, since the archive carries
// no precipitation-probability field. That proxy is stricter than the
// live rule (real rain, not a 40% chance of it), so the backtest measures
// "would a term on games that actually turned wet/windy have helped" —
// the forecast is the best pre-kickoff proxy for those conditions, and
// the difference is recorded in the output file.
//
// Three candidate downgrades (15% / 25% / 35% of the projection) are
// scored on the same week, plus wet-only and windy-only sensitivity
// passes at 25% — the same variant machinery as the Nov 1 matchup
// re-pricing. The fold stands on the best variant that passes the
// scorer's fold rule (affected MAE down, overall MAE not up). One graded
// week is thin evidence, so the verdict is re-measured when week 9
// grades; the fold only ever applies to the current-week board, never
// the next-week view (whose forecast is 7–10 days out — item 180).
//
// Did-not-play graded entries never receive a term: their miss is the
// injury class item 136 already prices at 0. RBs never receive a term
// either — wet weather favors the run — same as the tag.
//
// Usage: `npm run backtest:weather` [--week=N] — grades the latest grade
// file by default. Writes data/projection-backtests/weather-weekN.json
// and prints the verdict. Network: Open-Meteo archive (free, no auth).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGameVenues, type GameVenue } from '../src/utils/weatherWatch';
import {
  scoreWeatherTerm,
  type WeatherBacktestResult,
  type WeatherGradeEntry,
} from '../src/utils/weatherBacktest';
import type { PoolPlayer } from '../src/types/draft';

const UA = 'TraderApe (github.com/AndrewJSides/FantasyFootballAnalyzer)';
const GRADE_DIR = 'data/projection-grades';
const OUT_DIR = 'data/projection-backtests';
const WEATHER_POSITIONS = new Set(['QB', 'WR', 'TE']);
const PCTS = [0.15, 0.25, 0.35];

interface GradeDoc {
  season: number;
  week: number;
  grades: (WeatherGradeEntry & { primaryReason?: string | null })[];
}

interface ArchiveHourly {
  time: string[];
  temperature_2m?: number[];
  precipitation?: number[];
  wind_speed_10m?: number[];
  wind_gusts_10m?: number[];
}

interface ArchiveLocation {
  hourly: ArchiveHourly;
}

interface FlaggedGame {
  home: string;
  away: string;
  kickoffIso: string;
  venue: string;
  windy: boolean;
  wet: boolean;
  windMph: number;
  gustsMph: number;
  precipMm: number;
}

async function getJson<T>(url: string): Promise<T> {
  // Same proxy flakiness as the Sleeper fetches: retry dropped responses.
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

/** Nearest archive hour to kickoff, within 90 minutes — same window as
 *  weatherWatch.nearestHourAt. */
function nearestArchiveHour(hourly: ArchiveHourly, kickoffIso: string): number {
  const kickoff = new Date(kickoffIso).getTime();
  let best = -1;
  let bestDelta = Infinity;
  for (let i = 0; i < hourly.time.length; i++) {
    const t = new Date(`${hourly.time[i]}Z`).getTime();
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - kickoff);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  if (best < 0 || bestDelta > 90 * 60 * 1000) return -1;
  return best;
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

const round2 = (n: number): number => Math.round(n * 100) / 100;

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

  const poolJson = JSON.parse(
    readFileSync('src/data/draftPool.2026.json', 'utf8'),
  ) as { players: PoolPlayer[] };
  const bySleeperId = new Map<string, PoolPlayer>();
  for (const p of poolJson.players) {
    if (p.sleeperId) bySleeperId.set(String(p.sleeperId), p);
  }

  // Outdoor venues only — domes / retractable roofs are weather-neutral
  // and never flag, same as the live tag.
  const venues = buildGameVenues(week).filter(v => v.venue.roof === 'open');
  const kickoffs = venues.map(v => v.kickoffIso.slice(0, 10)).sort();
  const params = new URLSearchParams({
    latitude: venues.map(v => String(v.venue.lat)).join(','),
    longitude: venues.map(v => String(v.venue.lon)).join(','),
    hourly: 'temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'UTC',
    start_date: kickoffs[0],
    end_date: kickoffs[kickoffs.length - 1],
  });
  const body = await getJson<ArchiveLocation[] | ArchiveLocation>(
    `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`,
  );
  const list = Array.isArray(body) ? body : [body];

  const flagged: FlaggedGame[] = [];
  venues.forEach((v: GameVenue, i: number) => {
    const hourly = list[i]?.hourly;
    if (!hourly) return;
    const h = nearestArchiveHour(hourly, v.kickoffIso);
    if (h < 0) return;
    const wind = hourly.wind_speed_10m?.[h];
    const gusts = hourly.wind_gusts_10m?.[h];
    const precip = hourly.precipitation?.[h];
    if (wind === undefined || gusts === undefined || precip === undefined) return;
    const windy = wind >= 15 || gusts >= 25;
    const wet = precip > 0;
    if (!windy && !wet) return;
    flagged.push({
      home: v.home,
      away: v.away,
      kickoffIso: v.kickoffIso,
      venue: v.venue.name,
      windy,
      wet,
      windMph: round2(wind),
      gustsMph: round2(gusts),
      precipMm: round2(precip),
    });
  });
  const flaggedTeams = new Set<string>();
  const wetTeams = new Set<string>();
  const windyTeams = new Set<string>();
  for (const f of flagged) {
    flaggedTeams.add(f.home);
    flaggedTeams.add(f.away);
    if (f.wet) {
      wetTeams.add(f.home);
      wetTeams.add(f.away);
    }
    if (f.windy) {
      windyTeams.add(f.home);
      windyTeams.add(f.away);
    }
  }

  // Terms: graded QB/WR/TE who played, on a flagged team. Did-not-play
  // entries are excluded (the injury class, not weather).
  const termsFor = (pct: number, teams: Set<string>): Map<string, number> => {
    const terms = new Map<string, number>();
    for (const g of grade.grades) {
      const p = bySleeperId.get(g.player_id);
      if (!p || !WEATHER_POSITIONS.has(p.pos)) continue;
      if (p.team === 'FA' || !teams.has(p.team)) continue;
      if (g.primaryReason === 'did-not-play') continue;
      if (!Number.isFinite(g.predicted)) continue;
      terms.set(g.player_id, -round2(pct * g.predicted));
    }
    return terms;
  };

  interface VariantResult {
    label: string;
    pct: number;
    scope: 'both' | 'wet-only' | 'windy-only';
    result: WeatherBacktestResult;
  }
  const variants: VariantResult[] = [];
  for (const pct of PCTS) {
    variants.push({
      label: `-${Math.round(pct * 100)}% both`,
      pct,
      scope: 'both',
      result: scoreWeatherTerm(grade.grades, termsFor(pct, flaggedTeams)),
    });
  }
  variants.push({
    label: '-25% wet-only',
    pct: 0.25,
    scope: 'wet-only',
    result: scoreWeatherTerm(grade.grades, termsFor(0.25, wetTeams)),
  });
  variants.push({
    label: '-25% windy-only',
    pct: 0.25,
    scope: 'windy-only',
    result: scoreWeatherTerm(grade.grades, termsFor(0.25, windyTeams)),
  });

  const folding = variants.filter(v => v.result.fold);
  const best =
    folding.length > 0
      ? folding.reduce((a, b) =>
          a.result.affectedMaeAfter < b.result.affectedMaeAfter ? a : b,
        )
      : null;

  const out = {
    season,
    week,
    graded: grade.grades.length,
    method:
      'Open-Meteo archive at kickoff hour; windy = wind >= 15 mph or gusts >= 25 mph; wet = observed precipitation > 0 mm in the kickoff hour (archive has no precipitation probability — stricter proxy for the live 40%+ forecast rule). Terms apply to graded QB/WR/TE who played, on flagged teams; did-not-play entries excluded.',
    flaggedGames: flagged,
    variants: variants.map(v => ({
      label: v.label,
      cases: v.result.cases,
      affectedMaeBefore: v.result.affectedMaeBefore,
      affectedMaeAfter: v.result.affectedMaeAfter,
      overallMaeBefore: v.result.overallMaeBefore,
      overallMaeAfter: v.result.overallMaeAfter,
      gradedCount: v.result.gradedCount,
      fold: v.result.fold,
    })),
    verdict: best
      ? `FOLD ${best.label} — it cuts affected MAE without raising overall MAE.`
      : 'HOLD — no variant earns its place in the ranked projection yet.',
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `weather-week${week}.json`);
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);

  console.log(`Weather backtest — ${season} week ${week} (${grade.grades.length} graded)`);
  console.log(
    `Flagged games (${flagged.length} of ${venues.length} outdoor): ` +
      (flagged
        .map(f => `${f.away}@${f.home} (${f.windy ? `wind ${f.windMph}/g${f.gustsMph}` : ''}${f.windy && f.wet ? ', ' : ''}${f.wet ? `rain ${f.precipMm}mm` : ''})`)
        .join('; ') || 'none'),
  );
  for (const v of variants) {
    const r = v.result;
    console.log(
      `\n${v.label} (${r.cases.length} cases): affected MAE ${r.affectedMaeBefore.toFixed(2)} -> ${r.affectedMaeAfter.toFixed(2)}; overall MAE ${r.overallMaeBefore.toFixed(2)} -> ${r.overallMaeAfter.toFixed(2)}; fold=${r.fold}`,
    );
    if (v === best) {
      for (const c of r.cases) {
        const name = bySleeperId.get(c.playerId)?.name ?? c.playerId;
        console.log(
          `  ${name}: ${c.term.toFixed(1)} — error ${c.errorBefore.toFixed(2)} -> ${c.errorAfter.toFixed(2)}`,
        );
      }
    }
  }
  console.log(`\nVerdict: ${out.verdict}`);
  console.log(`Wrote ${outPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
