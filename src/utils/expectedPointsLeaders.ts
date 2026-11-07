// Expected Fantasy Points (xFP) Leaders board (backlog item 195).
//
// Per-position (QB/RB/WR/TE) expected-points leaders over the last 3
// completed weeks — how many full-PPR points a perfectly average player
// would score on the same workload. That is PFF's xFP concept
// ("how many fantasy points we should expect a perfectly average
// player to score with an identical workload"), priced on TraderApe's
// own window rates instead of PFF's 10-season play-by-play sample:
// each opportunity type is priced at the same window's per-position
// league-average points per opportunity, computed from Sleeper's free
// weekly stats. The FPOE gap (actual − expected per game) is the
// efficiency half: a positive gap means the player outscored his role
// (regression candidate the other way), a negative gap means the role
// is worth more than the points so far (buy-low read). Distinct from
// Buy Low / Sell High (item 16), which grades against the forward
// projection rather than the usage-implied expectation, and from TD
// Regression Watch (item 179), which prices expected touchdowns only.
//
// Scoring is standard full-PPR — verified live Nov 7, 2026 against
// Sleeper's week-8 stats: 243 of 302 skill-player lines reproduce
// Sleeper's pts_ppr exactly on rec 1 / rec_yd /10 / rec_td 6 /
// rush_yd /10 / rush_td 6 / pass_yd /25 / pass_td 4 / pass_int −1 /
// fum_lost −2 / 2-pt conversions +2. The residuals are return and
// fumble-recovery touchdowns, which opportunity pricing correctly
// excludes — expected points price the workload, not the luck. Pure
// NFL data (Sleeper's free public weekly stats), no league needed, so
// guests get the full board like the /pts-per-snap and /ypt pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const EXPECTED_POINTS_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type ExpectedPointsPosition = (typeof EXPECTED_POINTS_POSITIONS)[number];

/** 2+ stat lines so a single spot start can't drive a board entry. */
export const EXPECTED_POINTS_MIN_GAMES = 2;
/** Leaders kept per position. */
export const MAX_EXPECTED_POINTS_LEADERS = 15;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Standard full-PPR receiving points on one weekly line. */
export function receivingPoints(line: WeeklyUsageLine): number {
  return line.receptions + line.recYards / 10 + line.recTd * 6;
}

/** Standard full-PPR rushing points on one weekly line. */
export function rushingPoints(line: WeeklyUsageLine): number {
  return line.rushYards / 10 + line.rushTd * 6;
}

/** Standard full-PPR passing points on one weekly line. */
export function passingPoints(line: WeeklyUsageLine): number {
  return line.passYards / 25 + line.passTd * 4 - (line.passInt ?? 0);
}

export interface ExpectedPointsRates {
  /** Full-PPR points per target, per position (pooled fallback when a position saw no targets). */
  recvPerTarget: Record<string, number>;
  /** Full-PPR points per carry, per position (pooled fallback when a position saw no carries). */
  rushPerCarry: Record<string, number>;
  /** Full-PPR points per pass attempt, pooled across positions. */
  passPerAttempt: number;
}

export interface ExpectedPointsLeader {
  player: PoolPlayer;
  /** Expected full-PPR points per game on the player's workload. */
  expectedPerGame: number;
  /** Actual full-PPR points per game (Sleeper's pts_ppr). */
  actualPerGame: number;
  /** Fantasy points over expected per game (actual − expected), signed. */
  fpoePerGame: number;
  /** Targets per game over the window. */
  targetsPerGame: number;
  /** Rush attempts per game over the window. */
  rushPerGame: number;
  /** Pass attempts per game over the window. */
  passPerGame: number;
  /** Weeks in the recent window with a stat line. */
  games: number;
}

export interface ExpectedPointsLeadersInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices the 3 completed weeks strictly before it. */
  currentWeek: number;
}

interface WindowEntries {
  player: PoolPlayer;
  entries: { week: number; line: WeeklyUsageLine }[];
}

function windowEntries(input: ExpectedPointsLeadersInput): WindowEntries[] {
  const out: WindowEntries[] = [];
  for (const p of input.poolPlayers) {
    const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
      .map(([w, line]) => ({ week: Number(w), line }))
      .filter(
        e =>
          Number.isFinite(e.week) &&
          e.week < input.currentWeek &&
          e.week >= input.currentWeek - 3,
      );
    if (entries.length > 0) out.push({ player: p, entries });
  }
  return out;
}

/**
 * Per-position league-average points per opportunity over the last 3
 * completed weeks, computed from the pool players' own lines in the
 * window. A position with no targets (or no carries) in the window
 * falls back to the all-position pooled rate, so a real opportunity
 * never prices at zero for lack of a same-position sample.
 */
export function expectedPointsRates(input: ExpectedPointsLeadersInput): ExpectedPointsRates {
  const entries = windowEntries(input);
  const recvPerTarget: Record<string, number> = {};
  const rushPerCarry: Record<string, number> = {};
  let pooledRecvPts = 0;
  let pooledRecvTgt = 0;
  let pooledRushPts = 0;
  let pooledRushAtt = 0;
  let pooledPassPts = 0;
  let pooledPassAtt = 0;
  for (const pos of EXPECTED_POINTS_POSITIONS) {
    let recvPts = 0;
    let recvTgt = 0;
    let rushPts = 0;
    let rushAtt = 0;
    for (const { player, entries: lines } of entries) {
      if (player.pos.toUpperCase() !== pos) continue;
      for (const { line } of lines) {
        recvPts += receivingPoints(line);
        recvTgt += line.targets;
        rushPts += rushingPoints(line);
        rushAtt += line.rushAtt;
      }
    }
    pooledRecvPts += recvPts;
    pooledRecvTgt += recvTgt;
    pooledRushPts += rushPts;
    pooledRushAtt += rushAtt;
    recvPerTarget[pos] = recvTgt > 0 ? recvPts / recvTgt : 0;
    rushPerCarry[pos] = rushAtt > 0 ? rushPts / rushAtt : 0;
  }
  for (const { entries: lines } of entries) {
    for (const { line } of lines) {
      pooledPassPts += passingPoints(line);
      pooledPassAtt += line.passAtt;
    }
  }
  const pooledRecvRate = pooledRecvTgt > 0 ? pooledRecvPts / pooledRecvTgt : 0;
  const pooledRushRate = pooledRushAtt > 0 ? pooledRushPts / pooledRushAtt : 0;
  for (const pos of EXPECTED_POINTS_POSITIONS) {
    if (recvPerTarget[pos] === 0) recvPerTarget[pos] = pooledRecvRate;
    if (rushPerCarry[pos] === 0) rushPerCarry[pos] = pooledRushRate;
  }
  return {
    recvPerTarget,
    rushPerCarry,
    passPerAttempt: pooledPassAtt > 0 ? pooledPassPts / pooledPassAtt : 0,
  };
}

/**
 * Per-position expected-points leaders over the last 3 completed weeks
 * (week < currentWeek, week >= currentWeek - 3), min 2 games, ranked by
 * expected full-PPR points per game descending (ties broken by actual
 * points per game, then games), top 15 per position.
 * Players with no targets, carries, or pass attempts in the window
 * carry no workload and never lead a board. Returns a Map keyed by
 * position; positions with no leaders are absent.
 */
export function buildExpectedPointsLeaders(
  input: ExpectedPointsLeadersInput,
): Map<ExpectedPointsPosition, ExpectedPointsLeader[]> {
  const rates = expectedPointsRates(input);
  const entries = windowEntries(input);
  const out = new Map<ExpectedPointsPosition, ExpectedPointsLeader[]>();
  for (const pos of EXPECTED_POINTS_POSITIONS) {
    const rows: (ExpectedPointsLeader & { expectedTotal: number; actualTotal: number })[] = [];
    for (const { player, entries: lines } of entries) {
      if (player.pos.toUpperCase() !== pos) continue;
      if (lines.length < EXPECTED_POINTS_MIN_GAMES) continue;
      const targets = lines.reduce((s, e) => s + e.line.targets, 0);
      const rushAtt = lines.reduce((s, e) => s + e.line.rushAtt, 0);
      const passAtt = lines.reduce((s, e) => s + e.line.passAtt, 0);
      // A leaders board has no room for a player with no workload.
      if (targets + rushAtt + passAtt <= 0) continue;
      const expectedTotal =
        targets * rates.recvPerTarget[pos] +
        rushAtt * rates.rushPerCarry[pos] +
        passAtt * rates.passPerAttempt;
      const actualTotal = lines.reduce((s, e) => s + e.line.ptsPpr, 0);
      const games = lines.length;
      rows.push({
        player,
        expectedPerGame: round1(expectedTotal / games),
        actualPerGame: round1(actualTotal / games),
        fpoePerGame: round1((actualTotal - expectedTotal) / games),
        targetsPerGame: round1(targets / games),
        rushPerGame: round1(rushAtt / games),
        passPerGame: round1(passAtt / games),
        games,
        expectedTotal,
        actualTotal,
      });
    }
    rows.sort(
      (a, b) =>
        b.expectedTotal / b.games - a.expectedTotal / a.games ||
        b.actualTotal / b.games - a.actualTotal / a.games ||
        b.games - a.games,
    );
    if (rows.length > 0) {
      out.set(
        pos,
        rows.slice(0, MAX_EXPECTED_POINTS_LEADERS).map(
          ({ expectedTotal: _expectedTotal, actualTotal: _actualTotal, ...row }) => row,
        ),
      );
    }
  }
  return out;
}
