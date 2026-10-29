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
//   src/data/defenseGenerosity.2026.json — per team: avg fantasy pts opposing
//     defenses scored against that team's offense (generosity, rank 1 = most
//     generous) + the team's own defense's avg. Scored with standard D/ST
//     scoring: sack 1, INT 2, fumble recovery 2, defensive TD 6, safety 2,
//     blocked kick 2, points-allowed brackets 0→10 / 1–6→7 / 7–13→4 /
//     14–20→1 / 21–27→0 / 28–34→-1 / 35+→-4. Feeds the D/ST Streamers section
//     (backlog item 14).
//   src/data/kickerGenerosity.2026.json — per DEFENSE team: avg fantasy pts
//     opposing kickers scored against it (generosity, rank 1 = most generous)
//     + that team's own kicker's avg. Scored with standard kicker scoring
//     (FG made 3, PAT made 1, FG missed -1) from Sleeper's free weekly
//     kicker stat lines. Feeds the Kicker Streamers section (backlog item 15).

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

// Raw Sleeper team-defense stat keys used for standard D/ST scoring.
interface SleeperDefenseStats {
  sack?: number;
  int?: number;
  fum_rec?: number;
  td?: number;
  safe?: number;
  blk_kick?: number;
  pts_allow?: number;
}

// Standard kicker scoring (Yahoo-style), documented for the Streamers
// footnote: made field goals 3, made PATs 1, missed field goals -1.
function scoreKicker(s: SleeperKickerStats): number | null {
  if (typeof s.fgm !== 'number') return null;
  const fga = typeof s.fga === 'number' ? s.fga : s.fgm;
  return s.fgm * 3 + (s.xpm ?? 0) - (fga - s.fgm);
}

// Raw Sleeper kicker stat keys used for standard kicker scoring.
interface SleeperKickerStats {
  fgm?: number;
  fga?: number;
  xpm?: number;
  xpa?: number;
}

// Standard D/ST scoring (Yahoo-style), documented for the Streamers footnote.
function scoreDefense(s: SleeperDefenseStats): number | null {
  if (typeof s.pts_allow !== 'number') return null;
  const pa = s.pts_allow;
  const bracket =
    pa <= 0 ? 10 :
    pa <= 6 ? 7 :
    pa <= 13 ? 4 :
    pa <= 20 ? 1 :
    pa <= 27 ? 0 :
    pa <= 34 ? -1 : -4;
  return (
    (s.sack ?? 0) * 1 +
    (s.int ?? 0) * 2 +
    (s.fum_rec ?? 0) * 2 +
    (s.td ?? 0) * 6 +
    (s.safe ?? 0) * 2 +
    (s.blk_kick ?? 0) * 2 +
    bracket
  );
}

// Team-defense rows in Sleeper's weekly stats are keyed by the team
// abbreviation (e.g. "HOU") and carry a pts_allow line; player rows are
// keyed by numeric ids.
function isDefenseRow(id: string, s: SleeperStats): boolean {
  return (
    /^[A-Z]{2,3}$/.test(id) &&
    typeof (s as SleeperDefenseStats).pts_allow === 'number'
  );
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
  // 3b. D/ST generosity: each team defense's standard-scoring fantasy points
  //    are credited to the OFFENSE they faced (generosity[offense]) and to
  //    the defense itself (ownScore[defense]).
  const generosity: Record<string, number> = {};
  const generosityGames: Record<string, number> = {};
  const ownScore: Record<string, number> = {};
  const ownGames: Record<string, number> = {};
  // 3c. Kicker generosity: each kicker's standard-scoring fantasy points are
  //    credited to the DEFENSE he faced (kickerGenerosity[defense]) and to
  //    his own team's kicking unit (ownKickerScore[team]).
  const kickerGenerosity: Record<string, number> = {};
  const kickerGenerosityGames: Record<string, number> = {};
  const ownKickerScore: Record<string, number> = {};
  const ownKickerGames: Record<string, number> = {};
  const unknownTeams = new Set<string>();
  for (let week = 1; week <= lastWeek; week++) {
    const stats = await getJson<Record<string, SleeperStats>>(
      `https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`,
    );
    const seenDefense = new Set<string>();
    for (const [id, s] of Object.entries(stats)) {
      if (isDefenseRow(id, s)) {
        const defense = canon(id);
        const score = scoreDefense(s as SleeperDefenseStats);
        const offense = opponent[week]?.[defense];
        if (score === null || !offense) continue;
        generosity[offense] = (generosity[offense] ?? 0) + score;
        generosityGames[offense] = (generosityGames[offense] ?? 0) + 1;
        ownScore[defense] = (ownScore[defense] ?? 0) + score;
        ownGames[defense] = (ownGames[defense] ?? 0) + 1;
        continue;
      }
      const kPos = players[id]?.position;
      if (kPos === 'K') {
        // Kicker generosity: credit the kicker's standard-scoring fantasy
        // points to the defense he faced.
        const kScore = scoreKicker(s as SleeperKickerStats);
        const kTeam = canon(players[id]?.team);
        const kDefense = kTeam ? opponent[week]?.[kTeam] : undefined;
        if (kScore !== null && kTeam && kDefense) {
          kickerGenerosity[kDefense] = (kickerGenerosity[kDefense] ?? 0) + kScore;
          kickerGenerosityGames[kDefense] = (kickerGenerosityGames[kDefense] ?? 0) + 1;
          ownKickerScore[kTeam] = (ownKickerScore[kTeam] ?? 0) + kScore;
          ownKickerGames[kTeam] = (ownKickerGames[kTeam] ?? 0) + 1;
        }
        continue;
      }
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

  // 5. D/ST generosity averages + ranks. Rank 1 = the offense gives up the
  //    most fantasy points to opposing defenses (best streaming target).
  const defenseTeams: Record<
    string,
    { generosityAvg: number; generosityRank: number; ownAvg: number }
  > = {};
  const genRows = Object.keys(generosity)
    .map(t => ({
      team: t,
      avg:
        generosityGames[t] > 0 ? generosity[t] / generosityGames[t] : 0,
    }))
    .sort((a, b) => b.avg - a.avg);
  genRows.forEach((r, i) => {
    defenseTeams[r.team] = {
      generosityAvg: Math.round(r.avg * 10) / 10,
      generosityRank: i + 1,
      ownAvg:
        Math.round(
          ((ownScore[r.team] ?? 0) / Math.max(1, ownGames[r.team] ?? 0)) * 10,
        ) / 10,
    };
  });

  // 6. Kicker generosity averages + ranks. Rank 1 = the defense gives up the
  //    most fantasy points to opposing kickers (best streaming target).
  const kickerTeams: Record<
    string,
    { generosityAvg: number; generosityRank: number; ownAvg: number }
  > = {};
  const kickerRows = Object.keys(kickerGenerosity)
    .map(t => ({
      team: t,
      avg:
        kickerGenerosityGames[t] > 0
          ? kickerGenerosity[t] / kickerGenerosityGames[t]
          : 0,
    }))
    .sort((a, b) => b.avg - a.avg);
  kickerRows.forEach((r, i) => {
    kickerTeams[r.team] = {
      generosityAvg: Math.round(r.avg * 10) / 10,
      generosityRank: i + 1,
      ownAvg:
        Math.round(
          ((ownKickerScore[r.team] ?? 0) /
            Math.max(1, ownKickerGames[r.team] ?? 0)) *
            10,
        ) / 10,
    };
  });

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
  writeFileSync(
    join(OUT_DIR, `defenseGenerosity.${season}.json`),
    JSON.stringify(
      {
        season,
        weeks: [1, lastWeek],
        scoring:
          'standard D/ST: sack 1, INT 2, fumble recovery 2, defensive TD 6, ' +
          'safety 2, blocked kick 2; points allowed 0→10, 1–6→7, 7–13→4, ' +
          '14–20→1, 21–27→0, 28–34→-1, 35+→-4',
        teams: defenseTeams,
        generatedAt,
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    join(OUT_DIR, `kickerGenerosity.${season}.json`),
    JSON.stringify(
      {
        season,
        weeks: [1, lastWeek],
        scoring:
          'standard kicker: FG made 3, PAT made 1, FG missed -1',
        teams: kickerTeams,
        generatedAt,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Schedule: ${Object.values(schedule).reduce((s, g) => s + g.length, 0)} games across 18 weeks; ` +
      `allowed averages from weeks 1–${lastWeek} (${Object.keys(teams).length} defenses); ` +
      `D/ST generosity for ${Object.keys(defenseTeams).length} offenses; ` +
      `kicker generosity for ${Object.keys(kickerTeams).length} defenses.`,
  );
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
