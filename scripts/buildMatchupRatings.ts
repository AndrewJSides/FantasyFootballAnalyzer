// Builds the NFL schedule + opponent points-allowed-vs-position data the
// Start/Sit matchup column and matchupRating.ts consume. The matchup term
// for the weekly projection model (backlog item 1, remainder (a)) had no
// schedule source until now; ESPN's free scoreboard API supplies the
// team-vs-team schedule, and Sleeper's free weekly stats supply per-player
// fantasy points, which are credited to the opposing defense by position.
//
// Data sources (all free, no auth):
//   ESPN scoreboard:  https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=<season>&seasontype=2&week=<1..18>
//   Sleeper state:     https://api.sleeper.app/v1/state/nfl
//   Sleeper players:   https://api.sleeper.app/v1/players/nfl   (team + position per player)
//   Sleeper weekly:    https://api.sleeper.app/v1/stats/nfl/regular/<season>/<week>  (pts_ppr)
//
// Usage: `npm run fetch:matchups`. Only completed weeks feed the allowed
// averages (current week excluded), so a mid-week run never mixes partial
// actuals. Rerun weekly as new weeks complete.
//
// Output:
//   src/data/nflSchedule.2026.json   — per-week [home, away] pairs (canonical abbrevs)
//   src/data/matchupAllowed.2026.json — per team / position: avg fantasy pts
//     allowed per game over completed weeks + rank (1 = allows the most)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UA = 'TraderApe (github.com/AndrewJSides/FantasyFootballAnalyzer)';
const OUT_DIR = 'src/data';
const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
type SkillPos = (typeof POSITIONS)[number];

// ESPN and Sleeper spell two teams differently than the app's FantasyPros-
// style canonical form (JAC, WAS) — normalize at the boundary.
const CANON: Record<string, string> = { JAX: 'JAC', WSH: 'WAS' };
function canon(abbr: string | null | undefined): string {
  const upper = (abbr ?? '').toUpperCase().trim();
  return CANON[upper] ?? upper;
}

interface SleeperState {
  season: string;
  week: number;
}

interface SleeperPlayer {
  team?: string | null;
  position?: string | null;
}

interface SleeperStats {
  pts_ppr?: number;
}

interface EspnEvent {
  competitions: Array<{
    competitors: Array<{
      homeAway: 'home' | 'away';
      team: { abbreviation: string };
    }>;
  }>;
}

async function getJson<T>(url: string): Promise<T> {
  // Same drop-retry pattern as backtestProjections.ts.
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

async function main(): Promise<void> {
  const state = await getJson<SleeperState>('https://api.sleeper.app/v1/state/nfl');
  const season = Number(state.season);
  const lastWeek = Number(state.week) - 1;
  if (!season || !lastWeek || lastWeek < 1) {
    throw new Error(`Bad season/week from state: ${JSON.stringify(state)}`);
  }

  // 1. Full regular-season schedule (weeks 1..18).
  const schedule: Record<string, Array<[string, string]>> = {};
  // opponent[week][team] = opposing team (canonical abbrevs).
  const opponent: Record<number, Record<string, string>> = {};
  for (let week = 1; week <= 18; week++) {
    const data = await getJson<{ events: EspnEvent[] }>(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`,
    );
    const games: Array<[string, string]> = [];
    opponent[week] = {};
    for (const event of data.events ?? []) {
      const comp = event.competitions?.[0];
      const home = comp?.competitors?.find(c => c.homeAway === 'home')?.team.abbreviation;
      const away = comp?.competitors?.find(c => c.homeAway === 'away')?.team.abbreviation;
      if (!home || !away) continue;
      const h = canon(home);
      const a = canon(away);
      games.push([h, a]);
      opponent[week][h] = a;
      opponent[week][a] = h;
    }
    schedule[String(week)] = games;
  }

  // 2. Player team/position map.
  const players = await getJson<Record<string, SleeperPlayer>>(
    'https://api.sleeper.app/v1/players/nfl',
  );

  // 3. Completed-week fantasy points, credited to the opposing defense by
  //    position. allowed[defense][pos] sums pts_ppr; games[defense] counts
  //    each defense's played weeks (bye weeks never appear in the schedule).
  const allowed: Record<string, Record<SkillPos, number>> = {};
  const games: Record<string, number> = {};
  const unknownTeams = new Set<string>();
  for (let week = 1; week <= lastWeek; week++) {
    const stats = await getJson<Record<string, SleeperStats>>(
      `https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`,
    );
    const seenDefense = new Set<string>();
    for (const [id, s] of Object.entries(stats)) {
      if (typeof s.pts_ppr !== 'number' || s.pts_ppr <= 0) continue;
      const p = players[id];
      const team = canon(p?.team);
      const pos = p?.position as SkillPos | undefined;
      if (!team || !POSITIONS.includes(pos as SkillPos)) continue;
      const defense = opponent[week]?.[team];
      if (!defense) {
        unknownTeams.add(team);
        continue;
      }
      allowed[defense] ??= { QB: 0, RB: 0, WR: 0, TE: 0 };
      allowed[defense][pos as SkillPos] += s.pts_ppr;
      seenDefense.add(defense);
    }
    for (const d of seenDefense) games[d] = (games[d] ?? 0) + 1;
  }

  if (unknownTeams.size > 0) {
    console.warn(`No schedule opponent for teams (skipped): ${[...unknownTeams].join(', ')}`);
  }

  // 4. Averages + ranks. Rank 1 = allows the most points (easiest matchup).
  const teams: Record<string, Record<SkillPos, { avg: number; rank: number }>> = {};
  for (const pos of POSITIONS) {
    const rows = Object.keys(allowed)
      .map(t => ({ team: t, avg: games[t] > 0 ? allowed[t][pos] / games[t] : 0 }))
      .sort((a, b) => b.avg - a.avg);
    rows.forEach((r, i) => {
      teams[r.team] ??= {} as Record<SkillPos, { avg: number; rank: number }>;
      teams[r.team][pos] = {
        avg: Math.round(r.avg * 10) / 10,
        rank: i + 1,
      };
    });
  }

  const generatedAt = new Date().toISOString();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, `nflSchedule.${season}.json`),
    JSON.stringify({ season, weeks: schedule, generatedAt }, null, 2) + '\n',
  );
  writeFileSync(
    join(OUT_DIR, `matchupAllowed.${season}.json`),
    JSON.stringify({ season, weeks: [1, lastWeek], teams, generatedAt }, null, 2) + '\n',
  );
  console.log(
    `Schedule: ${Object.values(schedule).reduce((s, g) => s + g.length, 0)} games across 18 weeks; ` +
      `allowed averages from weeks 1–${lastWeek} (${Object.keys(teams).length} defenses).`,
  );
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
