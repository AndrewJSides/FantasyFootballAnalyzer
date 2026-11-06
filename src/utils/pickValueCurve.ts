// What a draft pick slot is worth, as a curve.
//
// The instrument this exists for: comparing two assets acquired at different
// costs. "Positions gained on the board" and "points over the next man at that
// slot" are both linear readings, and draft value is emphatically not linear —
// the first round sheds value far faster than the tenth. Converting a 6th-round
// pick into a 2nd-round asset is worth more than converting a 13th into a 5th,
// even though the second jumps twice as many rounds, because the rounds it
// jumps are cheap ones.
//
// The currency is the app's own VOR-derived auction dollars, so a pick slot and
// a player are quoted the same way and can be subtracted.
//
// Two smoothing steps matter. A single player at slot N jitters with positional
// scarcity (the 51st-ranked back can outprice the 36th-ranked receiver), so a
// point sample is not a curve: it reads pick 12 as dearer than pick 6 and
// scores a keeper on whichever side of a spike he happens to land. So average
// over a window, then force the result non-increasing — a later pick is never
// worth more than an earlier one, whatever the sample says.

import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import {
  DEFAULT_VOR_CONFIG,
  draftValues,
  vorPoints,
  type ValueLeague,
  type VorConfig,
} from './projectionValues';

// Half-width of the averaging window, in board slots.
const SMOOTHING_WINDOW = 7;

// A future draft pick offered in a trade: the season it belongs to and the
// round. A traded pick's exact slot is unknown until the season ends, so it
// prices at the mid-round slot for the league size (backlog item 175).
export interface TradePick {
  season: number;
  round: number;
}

// The smoothing half of a pick curve, shared by the dollar curve (keepers)
// and the VOR-points curve (trade pricing): a centred window that shrinks
// symmetrically at the edges, then a non-increasing pass so a later pick is
// never worth more than an earlier one. See the comment inside
// buildPickValueCurve for why the window shrinks instead of truncating.
function smoothValueCurve(raw: number[]): number[] {
  const last = raw.length - 1;
  const smoothed = raw.map((_, i) => {
    const w = Math.min(SMOOTHING_WINDOW, i, last - i);
    let sum = 0;
    for (let j = i - w; j <= i + w; j++) sum += raw[j];
    return sum / (w * 2 + 1);
  });
  for (let i = 1; i < smoothed.length; i++) {
    smoothed[i] = Math.min(smoothed[i], smoothed[i - 1]);
  }
  return smoothed;
}

// The curve's reader, shared by both currencies: clamped at both ends, and
// a non-finite slot reads the top of the curve rather than `undefined`
// through a NaN index.
function curveReader(smoothed: number[]): PickValueCurve {
  return {
    size: smoothed.length,
    at(n: number) {
      if (smoothed.length === 0) return 0;
      if (!Number.isFinite(n)) return smoothed[0];
      const idx = Math.min(Math.max(Math.round(n), 1), smoothed.length) - 1;
      return smoothed[idx];
    },
  };
}

export interface PickValueCurve {
  /** Value of the pick at 1-based slot `n`, clamped at both ends — auction
      dollars from buildPickValueCurve, VOR points from buildPickVorCurve. */
  at(n: number): number;
  /** How many slots the curve covers (the ranked pool's size). */
  size: number;
}

export function buildPickValueCurve(
  pool: DraftPoolFile,
  league: ValueLeague,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
): PickValueCurve {
  const values = draftValues(pool.players, pool.baseline, league, cfg);
  const board: PoolPlayer[] = pool.players
    .filter(p => p.overallRank != null)
    .sort((a, b) => a.overallRank! - b.overallRank!);

  const raw = board.map(p => values.get(p.id) ?? 0);
  // Shrink the window symmetrically at the edges rather than truncating it.
  // Clipping to [0, n-1] leaves slot 1 as the one-sided mean of slots 1..8,
  // which prices the board's most expensive asset BELOW the slots beneath it
  // and re-creates at the top of the curve exactly the flattening the smoothing
  // exists to remove. Measured on the 2026 pool, truncation reads slot 1 at $54
  // against a $73 raw value; shrinking reads $73, $64, $56 for slots 1-3, and
  // all variants agree from slot 8 down, so this only touches the head.
  //
  // Reflecting the window instead (mirroring slots 2..8 back over the edge) is
  // worse than the bug: it double-counts the cheaper neighbours and reads slot
  // 1 at $52. The head samples are few, but they are not noise — there is no
  // uncertainty about which player the 1.01 buys, which is precisely where the
  // averaging rationale stops applying.
  return curveReader(smoothValueCurve(raw));
}

// The same curve in the Trade Analyzer's own currency — expected VOR points
// for the player taken at each draft slot — so a future pick can join a
// player-for-player verdict without converting currencies (backlog item
// 175). Same smoothing, same non-increasing pass, same board order; only
// the per-slot value changes from auction dollars to VOR points.
export function buildPickVorCurve(
  pool: DraftPoolFile,
  league: ValueLeague,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
): PickValueCurve {
  const vor = vorPoints(pool.players, league, cfg);
  const board: PoolPlayer[] = pool.players
    .filter(p => p.overallRank != null)
    .sort((a, b) => a.overallRank! - b.overallRank!);

  const raw = board.map(p => vor.get(p.id) ?? 0);
  return curveReader(smoothValueCurve(raw));
}

// What a future draft pick is worth in a trade, in expected VOR points.
// A traded pick's exact slot is unknown until the season ends, so it prices
// at the mid-round slot for the league size — the honest expected value,
// the same basis FantasyPros' trade-value chart uses for picks (top-3 /
// top-6 / top-12 / early / late ranges). Picks beyond the next draft lose
// one round of value per year out (a 2028 1st prices like a 2027 2nd), the
// standard future-pick discount: a pick a year away is worth less than the
// same pick this year. Rounds past the end of the board price 0, as do
// invalid picks — never a guess.
export function pickTradeValue(
  pick: TradePick,
  league: ValueLeague,
  pool: DraftPoolFile,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
): number {
  if (!Number.isInteger(pick.round) || pick.round < 1) return 0;
  if (!Number.isInteger(pick.season)) return 0;
  const nextDraftSeason = pool.season + 1;
  const yearsOut = Math.max(0, pick.season - nextDraftSeason);
  const effectiveRound = pick.round + yearsOut;
  const teams = Math.max(1, league.teams || 1);
  // Mid-round slot: round R in a T-team league covers slots
  // (R-1)*T+1 .. R*T; the midpoint is the expected slot.
  const slot = (effectiveRound - 1) * teams + Math.ceil(teams / 2);
  const curve = buildPickVorCurve(pool, league, cfg);
  if (slot > curve.size) return 0;
  return Math.round(curve.at(slot) * 10) / 10;
}

// Human-readable label for a traded pick, e.g. "2027 Round 1 pick".
export function pickLabel(pick: TradePick): string {
  return `${pick.season} Round ${pick.round} pick`;
}
