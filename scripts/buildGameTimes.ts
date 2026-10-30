// Builds the per-team kickoff times for every NFL regular-season week from
// ESPN's free scoreboard API — the "when does everyone play" data behind the
// Start/Sit page's kickoff chips and late-swap watch (backlog item 35).
//
// Data source (free, no auth):
//   ESPN scoreboard: https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=<season>&seasontype=2&week=<1..18>
//   Each event carries an ISO-8601 UTC `date`; competitors carry `homeAway`
//   + team abbreviation. Team abbreviations are normalized to the app's
//   canonical form (JAC, WAS) the same way buildMatchupRatings.ts does.
//
// Usage: `npm run fetch:gametimes`. A fresh snapshot of the whole season —
// kickoff times for future weeks can move (flex scheduling), so re-run
// mid-season to keep them current.
//
// Output:
//   src/data/nflGameTimes.2026.json — { season, weeks: { "<week>": { "<TEAM>": "<ISO UTC>" } } }

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UA = 'TraderApe (github.com/AndrewJSides/FantasyFootballAnalyzer)';
const OUT_DIR = 'src/data';

// ESPN and Sleeper spell two teams differently than the app's FantasyPros-
// style canonical form (JAC, WAS) — normalize at the boundary.
const CANON: Record<string, string> = { JAX: 'JAC', WSH: 'WAS' };
function canon(abbr: string | null | undefined): string {
  const upper = (abbr ?? '').toUpperCase().trim();
  return CANON[upper] ?? upper;
}

interface EspnCompetitor {
  homeAway: 'home' | 'away';
  team: { abbreviation: string };
}
interface EspnEvent {
  date: string;
  competitions?: Array<{ competitors?: EspnCompetitor[] }>;
}

async function getJson<T>(url: string): Promise<T> {
  // Same drop-retry pattern as buildMatchupRatings.ts.
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

async function main() {
  const season = 2026;
  const weeks: Record<string, Record<string, string>> = {};
  let gameCount = 0;
  for (let week = 1; week <= 18; week++) {
    const data = await getJson<{ events: EspnEvent[] }>(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`,
    );
    const teams: Record<string, string> = {};
    for (const event of data.events ?? []) {
      const comps = event.competitions?.[0]?.competitors ?? [];
      if (!event.date || comps.length === 0) continue;
      for (const c of comps) teams[canon(c.team.abbreviation)] = event.date;
      gameCount++;
    }
    weeks[String(week)] = teams;
    // Be gentle with the free API.
    await new Promise(r => setTimeout(r, 200));
  }
  const out = { season, generatedAt: new Date().toISOString(), weeks };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `nflGameTimes.${season}.json`), JSON.stringify(out, null, 1) + '\n');
  console.log(`Wrote ${OUT_DIR}/nflGameTimes.${season}.json (${gameCount} games across 18 weeks).`);
}

main().catch(err => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
