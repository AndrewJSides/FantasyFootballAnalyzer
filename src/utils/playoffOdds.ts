// Playoff race: remaining-schedule difficulty + Monte Carlo playoff odds,
// both priced on the future regular-season schedule the Yahoo sync stores
// (League.futureSchedule, best-effort — callers hide when it is absent).

import type { League, Team } from '@/types';

export interface RemainingOpponent {
  week: number;
  opponentId: string;
  /** 0..100, one decimal — share of the Monte Carlo sims this team won the game. */
  winProb: number;
}

export interface PlayoffRaceEntry {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  /** Remaining opponents in week order. */
  remaining: RemainingOpponent[];
  /** Mean shrunk opponent rating; higher = tougher remaining schedule. */
  sos: number;
  /** 1 = toughest remaining schedule in the league. */
  sosRank: number;
  /** 0..100, one decimal. */
  playoffProb: number;
  /** Projected final wins: current wins + mean simulated wins, one decimal. */
  projectedWins: number;
  /** Projected final losses: current losses + mean simulated losses, one decimal. */
  projectedLosses: number;
  /** Mean playoff seed (1..N) across the simulated seasons, one decimal. */
  projectedSeed: number;
  /**
   * Model verdict from the simulated seasons: 'clinched' when the team made
   * the playoffs in every sim, 'eliminated' when it missed in every sim,
   * 'alive' otherwise. This is the model's verdict, not league-official.
   */
  playoffStatus: 'clinched' | 'eliminated' | 'alive';
}

export interface PlayoffRaceOptions {
  /** Default 10000. Fewer sims for tests. */
  simulations?: number;
  /** Seed for deterministic runs (tests). Default: random. */
  seed?: number;
}

/** A 30-pt scoring gap ≈ 91% win probability — calibrated to typical
 *  full-PPR weekly score spreads, not fitted to anything proprietary. */
const ELO_SCALE = 30;
/** Shrinkage games: how hard each team's per-game average pulls toward the
 *  league mean, so a two-week hot streak can't over-swing a rating. */
const SHRINK_GAMES = 2;

function gamesPlayed(t: Team): number {
  return Math.max(1, (t.wins || 0) + (t.losses || 0) + (t.ties || 0));
}

function winPct(t: Team, extraWins = 0): number {
  const gp = gamesPlayed(t);
  return ((t.wins || 0) + extraWins + 0.5 * (t.ties || 0)) / gp;
}

function winProb(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, -(ra - rb) / ELO_SCALE));
}

/** Deterministic PRNG (mulberry32) so tests get stable probabilities. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function playoffRace(
  league: Pick<League, 'teams' | 'futureSchedule' | 'playoffTeams' | 'currentWeek'>,
  opts: PlayoffRaceOptions = {},
): PlayoffRaceEntry[] {
  const sched = league.futureSchedule ?? [];
  const playoffTeams = league.playoffTeams;
  if (sched.length === 0 || !playoffTeams || playoffTeams < 1) return [];
  const cur = league.currentWeek;
  const remaining = sched.filter(m => !cur || m.week >= cur);
  if (remaining.length === 0 || league.teams.length === 0) return [];

  const teams = league.teams;
  const avgs = teams.map(t => (t.pointsFor || 0) / gamesPlayed(t));
  const leagueMean =
    avgs.reduce((sum, a) => sum + a, 0) / Math.max(1, avgs.length);

  // Shrunk scoring rating per team — the same rating drives win probabilities,
  // schedule difficulty, and the points tiebreak, so the model is one story.
  const rating = new Map<string, number>();
  for (let i = 0; i < teams.length; i++) {
    const t = teams[i];
    const gp = gamesPlayed(t);
    rating.set(t.id, (avgs[i] * gp + leagueMean * SHRINK_GAMES) / (gp + SHRINK_GAMES));
  }
  const ratingOf = (id: string) => rating.get(id) ?? leagueMean;

  // Remaining opponents per team, week order.
  const remByTeam = new Map<string, RemainingOpponent[]>();
  const push = (id: string, opp: RemainingOpponent) => {
    const list = remByTeam.get(id) ?? [];
    list.push(opp);
    remByTeam.set(id, list);
  };
  const gameKey = (week: number, a: string, b: string) =>
    `${week}|${a}|${b}`;
  for (const m of remaining) {
    push(m.team1Id, { week: m.week, opponentId: m.team2Id, winProb: -1 });
    push(m.team2Id, { week: m.week, opponentId: m.team1Id, winProb: -1 });
  }
  for (const list of remByTeam.values()) {
    list.sort((a, b) => a.week - b.week || (a.opponentId < b.opponentId ? -1 : 1));
  }

  // Strength of schedule: mean opponent rating over the games still to play.
  const sos = new Map<string, number>();
  for (const t of teams) {
    const list = remByTeam.get(t.id) ?? [];
    sos.set(
      t.id,
      list.length === 0
        ? leagueMean
        : list.reduce((sum, o) => sum + ratingOf(o.opponentId), 0) / list.length,
    );
  }
  const sosRank = new Map<string, number>();
  [...teams]
    .sort((a, b) => (sos.get(b.id) ?? 0) - (sos.get(a.id) ?? 0))
    .forEach((t, i) => sosRank.set(t.id, i + 1));

  // Monte Carlo the rest of the regular season.
  const sims = opts.simulations ?? 10000;
  const rand =
    opts.seed === undefined ? Math.random : mulberry32(opts.seed);
  const made = new Map<string, number>();
  // Per-game wins for team1 of each remaining matchup, so each team sees
  // a game-by-game win probability priced on the same simulations.
  const team1Wins = new Map<string, number>();
  for (const m of remaining) team1Wins.set(gameKey(m.week, m.team1Id, m.team2Id), 0);
  // Per-team final win/loss totals, so each team gets a projected final
  // record from the same simulations (no extra sim cost).
  const totalWins = new Map<string, number>();
  const totalLosses = new Map<string, number>();
  // Per-team seed sums, so each team gets a projected playoff seed from the
  // same simulations (1..N in every sim, so the league mean is constant).
  const totalSeed = new Map<string, number>();
  const spots = Math.min(playoffTeams, teams.length);
  for (let s = 0; s < sims; s++) {
    const extra = new Map<string, number>();
    for (const t of teams) extra.set(t.id, 0);
    for (const m of remaining) {
      const key = gameKey(m.week, m.team1Id, m.team2Id);
      if (rand() < winProb(ratingOf(m.team1Id), ratingOf(m.team2Id))) {
        extra.set(m.team1Id, (extra.get(m.team1Id) ?? 0) + 1);
        team1Wins.set(key, (team1Wins.get(key) ?? 0) + 1);
      } else {
        extra.set(m.team2Id, (extra.get(m.team2Id) ?? 0) + 1);
      }
    }
    for (const t of teams) {
      const ew = extra.get(t.id) ?? 0;
      const gamesLeft = remByTeam.get(t.id)?.length ?? 0;
      totalWins.set(t.id, (totalWins.get(t.id) ?? 0) + (t.wins || 0) + ew);
      totalLosses.set(
        t.id,
        (totalLosses.get(t.id) ?? 0) + (t.losses || 0) + (gamesLeft - ew),
      );
    }
    const ranked = [...teams].sort((a, b) => {
      const pa = winPct(a, extra.get(a.id) ?? 0);
      const pb = winPct(b, extra.get(b.id) ?? 0);
      if (pa !== pb) return pb - pa;
      // Tiebreak: current points + expected points the rest of the way.
      const ea =
        (a.pointsFor || 0) +
        ratingOf(a.id) * (remByTeam.get(a.id)?.length ?? 0);
      const eb =
        (b.pointsFor || 0) +
        ratingOf(b.id) * (remByTeam.get(b.id)?.length ?? 0);
      return eb - ea;
    });
    for (let i = 0; i < spots; i++) {
      const id = ranked[i].id;
      made.set(id, (made.get(id) ?? 0) + 1);
    }
    ranked.forEach((t, i) => {
      totalSeed.set(t.id, (totalSeed.get(t.id) ?? 0) + (i + 1));
    });
  }

  // Game-by-game win probability per team, from the same simulations:
  // the owning team's share of wins in that specific matchup.
  for (const t of teams) {
    for (const o of remByTeam.get(t.id) ?? []) {
      const direct = team1Wins.get(gameKey(o.week, t.id, o.opponentId));
      const reversed = team1Wins.get(gameKey(o.week, o.opponentId, t.id));
      const share =
        direct !== undefined
          ? direct / sims
          : reversed !== undefined
            ? 1 - reversed / sims
            : 0.5;
      o.winProb = Math.round(share * 1000) / 10;
    }
  }

  return teams
    .map((t): PlayoffRaceEntry => ({
      teamId: t.id,
      teamName: t.name,
      wins: t.wins || 0,
      losses: t.losses || 0,
      ties: t.ties || 0,
      remaining: remByTeam.get(t.id) ?? [],
      sos: sos.get(t.id) ?? leagueMean,
      sosRank: sosRank.get(t.id) ?? teams.length,
      playoffProb:
        Math.round(((made.get(t.id) ?? 0) / sims) * 1000) / 10,
      projectedWins:
        Math.round(((totalWins.get(t.id) ?? 0) / sims) * 10) / 10,
      projectedLosses:
        Math.round(((totalLosses.get(t.id) ?? 0) / sims) * 10) / 10,
      projectedSeed:
        Math.round(((totalSeed.get(t.id) ?? 0) / sims) * 10) / 10,
      playoffStatus:
        (made.get(t.id) ?? 0) === sims
          ? 'clinched'
          : (made.get(t.id) ?? 0) === 0
            ? 'eliminated'
            : 'alive',
    }))
    .sort((a, b) => b.playoffProb - a.playoffProb || b.wins - a.wins);
}
