// Playoff race: remaining-schedule difficulty + Monte Carlo playoff odds,
// both priced on the future regular-season schedule the Yahoo sync stores
// (League.futureSchedule, best-effort — callers hide when it is absent).

import type { League, Team } from '@/types';

export interface RemainingOpponent {
  week: number;
  opponentId: string;
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
  for (const m of remaining) {
    push(m.team1Id, { week: m.week, opponentId: m.team2Id });
    push(m.team2Id, { week: m.week, opponentId: m.team1Id });
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
  const spots = Math.min(playoffTeams, teams.length);
  for (let s = 0; s < sims; s++) {
    const extra = new Map<string, number>();
    for (const t of teams) extra.set(t.id, 0);
    for (const m of remaining) {
      if (rand() < winProb(ratingOf(m.team1Id), ratingOf(m.team2Id))) {
        extra.set(m.team1Id, (extra.get(m.team1Id) ?? 0) + 1);
      } else {
        extra.set(m.team2Id, (extra.get(m.team2Id) ?? 0) + 1);
      }
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
  }

  return teams
    .map(t => ({
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
    }))
    .sort((a, b) => b.playoffProb - a.playoffProb || b.wins - a.wins);
}
