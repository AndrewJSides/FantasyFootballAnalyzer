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
  /**
   * 0..100, one decimal — share of the simulated seasons in which this team
   * won the fully simulated playoff bracket (see simulateBracketChampion).
   * This is the model's verdict, not league-official.
   */
  championProb: number;
  /**
   * Per playoff round, 0..100 one decimal — the share of the simulated
   * seasons in which this team won that round (a bye counts as a won
   * round). One entry per bracket round for this league's playoff size:
   * 6-team → [quarterfinal, semifinal, final], 4-team → [semifinal,
   * final], 2-team → [final]. The last entry equals championProb; teams
   * that never made a simulated bracket read all zeros. This is the
   * model's verdict, not league-official.
   */
  roundProbs: number[];
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

/**
 * Analytic win probability for one game (0..100, one decimal) on the same
 * shrunk-scoring-rating model the Playoff Race sims: team's per-game
 * average pulled toward the league mean so a two-week hot streak can't
 * over-swing the rating. No sims — cheap enough for per-team schedule
 * sections (backlog item 47).
 */
export function gameWinProb(
  league: Pick<League, 'teams'>,
  teamAId: string,
  teamBId: string,
): number {
  const teams = league.teams;
  const avgs = teams.map(t => (t.pointsFor || 0) / gamesPlayed(t));
  const leagueMean =
    avgs.reduce((sum, a) => sum + a, 0) / Math.max(1, avgs.length);
  const ratingOf = (id: string): number => {
    const i = teams.findIndex(t => t.id === id);
    if (i < 0) return leagueMean;
    const gp = gamesPlayed(teams[i]);
    return (
      (avgs[i] * gp + leagueMean * SHRINK_GAMES) / (gp + SHRINK_GAMES)
    );
  };
  return Math.round(winProb(ratingOf(teamAId), ratingOf(teamBId)) * 1000) / 10;
}

/** A playoff entrant: 1-based seed (1 = best) with its scoring rating. */
export interface BracketSeed {
  id: string;
  seed: number;
  rating: number;
}

/**
 * How many rounds a single-elimination bracket with n entrants plays.
 * Mirrors simulateBracketRounds' shape logic (6 → QF/SF/F, 4 → SF/F,
 * generic sizes halve each round with a top-seed bye on odd rounds).
 */
export function bracketRoundCount(n: number): number {
  if (n <= 1) return n;
  if (n === 6) return 3;
  if (n === 4) return 2;
  let rounds = 0;
  let m = n;
  while (m > 1) {
    rounds++;
    m = m % 2 === 1 ? Math.ceil(m / 2) : m / 2;
  }
  return rounds;
}

/**
 * Simulate one single-elimination playoff bracket and return the winners of
 * each round played, in order (round 0 = the first round). A bye counts as a
 * won round — the 6-team bracket's top two seeds appear in the quarterfinal
 * winners without playing. Seeds drive the pairing (6-team: top two seeds
 * get byes, 3v6 and 4v5 in the quarters; 4-team: 1v4 and 2v3 semifinals;
 * other sizes: generic top-vs-bottom pairing with a bye for the top seed on
 * odd rounds). Playoff games use the same rating-based win probability as
 * the regular season sims — a neutral-site game between the two seeds'
 * ratings.
 */
export function simulateBracketRounds(
  seeds: BracketSeed[],
  winProbFn: (ra: number, rb: number) => number,
  rand: () => number,
): BracketSeed[][] {
  if (seeds.length === 0) return [];
  const sorted = [...seeds].sort((x, y) => x.seed - y.seed);
  if (sorted.length === 1) return [[sorted[0]]];
  const play = (a: BracketSeed, b: BracketSeed): BracketSeed =>
    rand() < winProbFn(a.rating, b.rating) ? a : b;
  const bySeed = (x: BracketSeed, y: BracketSeed) => x.seed - y.seed;
  const rounds: BracketSeed[][] = [];
  const n = sorted.length;
  if (n === 6) {
    const quarters = [play(sorted[2], sorted[5]), play(sorted[3], sorted[4])];
    rounds.push([sorted[0], sorted[1], ...quarters].sort(bySeed));
    const low = quarters[0].seed > quarters[1].seed ? quarters[0] : quarters[1];
    const high = quarters[0].seed > quarters[1].seed ? quarters[1] : quarters[0];
    const semis = [play(sorted[0], low), play(sorted[1], high)];
    rounds.push([...semis].sort(bySeed));
    // Final plays the semifinal winners in bracket order, not seed order —
    // the win probability is directional, so argument order matters.
    rounds.push([play(semis[0], semis[1])]);
    return rounds;
  }
  if (n === 4) {
    const semis = [play(sorted[0], sorted[3]), play(sorted[1], sorted[2])];
    rounds.push([...semis].sort(bySeed));
    rounds.push([play(semis[0], semis[1])]);
    return rounds;
  }
  let round = sorted;
  while (round.length > 1) {
    const next: BracketSeed[] = [];
    let start = 0;
    if (round.length % 2 === 1) {
      next.push(round[0]); // top seed byes an odd-sized round
      start = 1;
    }
    const m = round.length;
    for (let i = start; i < (start + m) / 2; i++) {
      next.push(play(round[i], round[m - 1 - (i - start)]));
    }
    const ordered = [...next].sort(bySeed);
    rounds.push(ordered);
    round = ordered;
  }
  return rounds;
}

/**
 * Simulate one single-elimination playoff bracket and return the champion's
 * id. Same bracket as simulateBracketRounds — the champion is the last
 * round's only winner.
 */
export function simulateBracketChampion(
  seeds: BracketSeed[],
  winProbFn: (ra: number, rb: number) => number,
  rand: () => number,
): string {
  const rounds = simulateBracketRounds(seeds, winProbFn, rand);
  if (rounds.length === 0) return '';
  return rounds[rounds.length - 1][0].id;
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
  // Per-team simulated championships: each sim's bracket is played out with
  // the same rating-based win probabilities, and the champion counted.
  const champion = new Map<string, number>();
  for (const t of teams) champion.set(t.id, 0);
  // Per-team per-round bracket wins: the same sim records every round's
  // winners, so each team gets a modeled chance to win each playoff round
  // at no extra sim cost. Index 0 is the first round played. Arrays are
  // pre-sized to the bracket's round count so non-qualifiers read zeros.
  const spots = Math.min(playoffTeams, teams.length);
  const roundsPerBracket = bracketRoundCount(spots);
  const roundWins = new Map<string, number[]>();
  for (const t of teams) roundWins.set(t.id, new Array(roundsPerBracket).fill(0));
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
    // Play the bracket out: the seeded entrants (ranked 1..spots in this
    // sim) face off on the same ratings; every round's winners are counted
    // for the advancement odds, and the champion is counted.
    if (spots >= 1) {
      const entrants = ranked
        .slice(0, spots)
        .map((t, i) => ({ id: t.id, seed: i + 1, rating: ratingOf(t.id) }));
      const rounds = simulateBracketRounds(entrants, winProb, rand);
      rounds.forEach((winners, ri) => {
        for (const w of winners) {
          const arr = roundWins.get(w.id);
          if (arr && ri < arr.length) arr[ri] += 1;
        }
      });
      const champ =
        rounds.length > 0 ? rounds[rounds.length - 1][0].id : '';
      if (champ !== '') champion.set(champ, (champion.get(champ) ?? 0) + 1);
    }
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
      championProb:
        Math.round(((champion.get(t.id) ?? 0) / sims) * 1000) / 10,
      roundProbs: (roundWins.get(t.id) ?? []).map(c =>
        Math.round((c / sims) * 1000) / 10,
      ),
    }))
    .sort((a, b) => b.playoffProb - a.playoffProb || b.wins - a.wins);
}
