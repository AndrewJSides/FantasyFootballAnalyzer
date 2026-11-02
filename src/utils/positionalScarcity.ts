// Positional Scarcity Meter (backlog item 91): per-position (QB/RB/WR/TE)
// scarcity on the Trade Value Chart's own 0-100 scale — the trade-deadline
// answer to "which positions are running dry in my league". FantasyPros'
// draft-strategy writing frames positional scarcity (especially RB) as the
// core roster-building concept (researched for feature shape only); this is
// priced entirely from TraderApe's own trade-value chart engine and league
// shape, no copied content. Guidance only.

import {
  DEFAULT_VOR_CONFIG,
  type ValueLeague,
  type VorConfig,
} from './projectionValues';
import type { TradeValuePosition, TradeValueRow } from './tradeValues';

/** Starter demand per position: teams × (base slots + FLEX/SUPERFLEX shares). */
export function starterDemand(
  league: ValueLeague,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
): Record<TradeValuePosition, number> {
  const teams = league.teams;
  const slots = league.rosterSlots;
  const f = cfg.flexShare;
  const s = cfg.superflexShare;
  const demand = {
    QB: teams * ((slots.QB ?? 0) + (slots.SUPERFLEX ?? 0) * s.QB),
    RB:
      teams *
      ((slots.RB ?? 0) + (slots.FLEX ?? 0) * f.RB + (slots.SUPERFLEX ?? 0) * s.RB),
    WR:
      teams *
      ((slots.WR ?? 0) + (slots.FLEX ?? 0) * f.WR + (slots.SUPERFLEX ?? 0) * s.WR),
    TE:
      teams *
      ((slots.TE ?? 0) + (slots.FLEX ?? 0) * f.TE + (slots.SUPERFLEX ?? 0) * s.TE),
  };
  return {
    QB: Math.round(demand.QB),
    RB: Math.round(demand.RB),
    WR: Math.round(demand.WR),
    TE: Math.round(demand.TE),
  };
}

export type ScarcityVerdict = 'deep' | 'balanced' | 'thin';

/** Verdict bands, anchored to the chart's own tier thresholds (Starter = 15+). */
export const SCARCITY_DEEP_AT = 15;
export const SCARCITY_BALANCED_AT = 5;

export function scarcityVerdict(bestWaiverValue: number | null): ScarcityVerdict {
  if (bestWaiverValue == null) return 'thin';
  if (bestWaiverValue >= SCARCITY_DEEP_AT) return 'deep';
  if (bestWaiverValue >= SCARCITY_BALANCED_AT) return 'balanced';
  return 'thin';
}

export interface PositionScarcity {
  position: TradeValuePosition;
  /** Rounded starter demand at the position (teams × slots + flex shares). */
  demandLine: number;
  /** Chart value of the demand-line-th player (the last "starter"), one decimal. */
  starterLineValue: number | null;
  /** Best unrostered chart value at the position, one decimal. */
  bestWaiverValue: number | null;
  /** Chart players rostered at the position (league mode: real; guest: assumed). */
  rosteredCount: number;
  verdict: ScarcityVerdict;
  verdictDetail: string;
}

const VERDICT_COPY: Record<ScarcityVerdict, string> = {
  deep: 'the wire holds a starter-quality option',
  balanced: 'serviceable depth on the wire, no starters',
  thin: 'the wire is bare at this position',
};

/**
 * Build the per-position scarcity table from trade-value chart rows.
 *
 * League mode passes the rostered pool ids (from the owner map) so the
 * best-waiver number prices the real wire. Guest mode passes nothing: the
 * typical-draft-order assumption prices the wire as starting right after
 * the demand line — labeled as such in the component footnote.
 */
export function buildPositionalScarcity(
  rows: TradeValueRow[],
  league: ValueLeague,
  rosteredIds?: Set<string>,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
): PositionScarcity[] {
  const demand = starterDemand(league, cfg);
  const positions: TradeValuePosition[] = ['QB', 'RB', 'WR', 'TE'];
  return positions.flatMap(position => {
    const posRows = rows
      .filter(r => r.player.pos === position)
      .sort((a, b) => b.value - a.value);
    if (posRows.length === 0) return [];
    const demandLine = demand[position];
    const starterLineValue = posRows[demandLine - 1]?.value ?? null;
    let bestWaiverValue: number | null = null;
    if (rosteredIds) {
      bestWaiverValue =
        posRows.find(r => !rosteredIds.has(r.player.id))?.value ?? null;
    } else {
      // Typical draft order: rosters take the top demandLine players.
      bestWaiverValue = posRows[demandLine]?.value ?? null;
    }
    const rosteredCount = rosteredIds
      ? posRows.filter(r => rosteredIds.has(r.player.id)).length
      : Math.min(demandLine, posRows.length);
    const verdict = scarcityVerdict(bestWaiverValue);
    const verdictDetail =
      `${position}: ${demandLine} starters needed; ` +
      (starterLineValue != null
        ? `the starter line is ${starterLineValue.toFixed(1)} and `
        : 'no starter line on the chart and ') +
      (bestWaiverValue != null
        ? `the best waiver option is ${bestWaiverValue.toFixed(1)} — ${VERDICT_COPY[verdict]}`
        : `nobody rosterable on the wire — ${VERDICT_COPY[verdict]}`);
    return [
      {
        position,
        demandLine,
        starterLineValue,
        bestWaiverValue,
        rosteredCount,
        verdict,
        verdictDetail,
      },
    ];
  });
}
