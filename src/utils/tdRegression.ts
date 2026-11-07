// TD Regression Watch board (backlog item 179).
//
// Per-position (RB/WR/TE) expected-touchdown (xTD) regression candidates
// over the completed weeks this season — the buy-low / sell-high half of
// the Red Zone Leaders board (item 145). A player's expected TDs are his
// own red-zone opps priced at his position's league-wide TD-per-RZ-opp
// rate, so the gap between actual rush+rec TDs and expected TDs is the
// "scored more (or less) than his opportunity implies" read: a big
// positive gap is a cooling candidate (TDs drying up), a big negative gap
// a due candidate (TDs coming). QBs are out of scope — passing TDs follow
// a different opportunity distribution (pass attempts, not RZ opps) and
// the Sleeper lines don't break out red-zone pass attempts. Pure NFL data
// (Sleeper's free public weekly stats), no league needed, so guests get
// the full board like the /red-zone and /targets pages.

import type { PoolPlayer } from '@/types/draft';
import type { WeeklyUsageLine } from '@/api/sleeperUsage';

export const TD_REGRESSION_POSITIONS = ['RB', 'WR', 'TE'] as const;
export type TdRegressionPosition = (typeof TD_REGRESSION_POSITIONS)[number];

/** 3+ stat lines so a TD sample too small to read can't drive a board entry. */
export const TD_REGRESSION_MIN_GAMES = 3;
/** A gap this big (in TDs) is signal, not noise. */
export const TD_REGRESSION_MIN_GAP = 1.5;
/** Candidates kept per direction per position. */
export const MAX_TD_REGRESSION_ROWS = 10;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface TdRegressionRow {
  player: PoolPlayer;
  /** Actual rush + receiving TDs in the window. */
  tds: number;
  /** Expected TDs: own RZ opps × the position's league TD-per-RZ-opp rate. */
  xTd: number;
  /** Actual minus expected (positive = scored more than opportunity implies). */
  gap: number;
  /** Red-zone opps (rush attempts + targets inside the 20) in the window. */
  rzOpps: number;
  /** Weeks in the window with a stat line. */
  games: number;
}

export interface TdRegressionLists {
  /** Scored ≥1.5 TDs below expected — TDs coming. Most negative gap first. */
  due: TdRegressionRow[];
  /** Scored ≥1.5 TDs above expected — TDs drying up. Most positive gap first. */
  cooling: TdRegressionRow[];
}

export interface TdRegressionInput {
  poolPlayers: PoolPlayer[];
  /** Weekly usage keyed by Sleeper id (Sleeper's free public stats). */
  usageBySleeperId: Record<string, Record<number, WeeklyUsageLine>>;
  /** The in-progress week — prices every completed week strictly before it. */
  currentWeek: number;
}

/**
 * Per-position league-wide rush+rec TDs per red-zone opp over the
 * completed weeks, across every pool player at the position with a usage
 * line — the rate that turns a player's own RZ opps into expected TDs.
 * 0 when the position recorded no red-zone opp (guards the division,
 * never happens in practice).
 */
export function leagueTdPerRzOppByPosition(
  input: TdRegressionInput,
): Map<TdRegressionPosition, number> {
  const totals = new Map<TdRegressionPosition, { tds: number; rzOpps: number }>();
  const posOf = new Map<string, TdRegressionPosition>();
  for (const p of input.poolPlayers) {
    const pos = p.pos.toUpperCase();
    if (pos !== 'RB' && pos !== 'WR' && pos !== 'TE') continue;
    if (p.sleeperId) posOf.set(p.sleeperId, pos);
  }
  for (const [id, byWeek] of Object.entries(input.usageBySleeperId)) {
    const pos = posOf.get(id);
    if (!pos) continue;
    for (const [w, line] of Object.entries(byWeek)) {
      const week = Number(w);
      if (!Number.isFinite(week) || week >= input.currentWeek) continue;
      const t = totals.get(pos) ?? { tds: 0, rzOpps: 0 };
      t.tds += line.rushTd + line.recTd;
      t.rzOpps += line.rzOpps;
      totals.set(pos, t);
    }
  }
  const out = new Map<TdRegressionPosition, number>();
  for (const [pos, t] of totals) {
    out.set(pos, t.rzOpps > 0 ? t.tds / t.rzOpps : 0);
  }
  return out;
}

/**
 * Per-position TD regression candidates over every completed week this
 * season (week < currentWeek), min 3 games, rush+rec TDs only, QBs
 * excluded. A row lands on a list only when |actual − expected| ≥ 1.5
 * TDs. Returns a Map keyed by position; positions with no candidates on
 * either side are absent.
 */
export function buildTdRegression(
  input: TdRegressionInput,
): Map<TdRegressionPosition, TdRegressionLists> {
  const rates = leagueTdPerRzOppByPosition(input);

  const out = new Map<TdRegressionPosition, TdRegressionLists>();
  for (const pos of TD_REGRESSION_POSITIONS) {
    const rate = rates.get(pos) ?? 0;
    const due: TdRegressionRow[] = [];
    const cooling: TdRegressionRow[] = [];
    for (const p of input.poolPlayers) {
      if (p.pos.toUpperCase() !== pos) continue;
      const entries = Object.entries(input.usageBySleeperId[p.sleeperId ?? ''] ?? {})
        .map(([w, line]) => ({ week: Number(w), line }))
        .filter(e => Number.isFinite(e.week) && e.week < input.currentWeek);
      if (entries.length < TD_REGRESSION_MIN_GAMES) continue;

      const tds = entries.reduce((s, e) => s + e.line.rushTd + e.line.recTd, 0);
      const rzOpps = entries.reduce((s, e) => s + e.line.rzOpps, 0);
      // A player with no red-zone work and no TDs has nothing to regress;
      // a player with TDs on zero RZ opps (long scores) still reads — his
      // xTD is 0 and the gap is the whole TD total.
      if (tds <= 0 && rzOpps <= 0) continue;
      const xTd = round1(rzOpps * rate);
      const gap = round1(tds - xTd);
      const row: TdRegressionRow = {
        player: p,
        tds,
        xTd,
        gap,
        rzOpps,
        games: entries.length,
      };
      if (gap <= -TD_REGRESSION_MIN_GAP) due.push(row);
      else if (gap >= TD_REGRESSION_MIN_GAP) cooling.push(row);
    }
    due.sort((a, b) => a.gap - b.gap);
    cooling.sort((a, b) => b.gap - a.gap);
    if (due.length > 0 || cooling.length > 0) {
      out.set(pos, {
        due: due.slice(0, MAX_TD_REGRESSION_ROWS),
        cooling: cooling.slice(0, MAX_TD_REGRESSION_ROWS),
      });
    }
  }
  return out;
}
