// Drop-or-hold verdicts: FantasyPros runs a weekly "Drop or Hold" column, but
// it's written for the generic manager. This prices YOUR roster: every
// rostered QB/RB/WR/TE gets a droppability score from TraderApe's own data —
// VOR against this league's replacement levels, the team's positional depth
// chart, injury designations from Sleeper's player map, and whether the bye
// already passed — and lands in one of three tiers: safe to drop, droppable
// with regret, or hold. The Add/Drop Moves panel pairs a drop with a pickup;
// this answers the standalone "can I cut anyone" question before waivers run.

import type { League, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { indexPool, resolvePoolPlayer } from './consensusGrade';
import {
  DEFAULT_VOR_CONFIG,
  vorPoints,
  type VorConfig,
} from './projectionValues';
import { valueLeagueFor, type PositionKey } from './tradeAnalysis';
import { currentWeekEstimate } from './matchupRating';

export type DropVerdict = 'drop' | 'regret' | 'hold';

export interface DropOrHoldRow {
  player: PoolPlayer;
  vor: number;
  verdict: DropVerdict;
  score: number;
  reasons: string[];
}

// Shown, strongest-first. The table stays short: waivers run tonight and the
// manager wants the answer, not the whole roster.
export const MAX_DROP_ROWS = 6;

const SKILL_POSITIONS: PositionKey[] = ['QB', 'RB', 'WR', 'TE'];

function posKeyOf(p: PoolPlayer): PositionKey | null {
  const p_ = p.pos.toUpperCase();
  return SKILL_POSITIONS.includes(p_ as PositionKey) ? (p_ as PositionKey) : null;
}

// Starter demand per position — same convention as addDropSuggest.ts (each
// FLEX counts as one more slot for RB/WR/TE).
function demandFor(
  position: PositionKey,
  slots: NonNullable<League['rosterSlots']>,
): number {
  const flex = slots.FLEX ?? 0;
  const base =
    position === 'QB'
      ? (slots.QB ?? 0)
      : position === 'RB'
        ? (slots.RB ?? 0)
        : position === 'WR'
          ? (slots.WR ?? 0)
          : (slots.TE ?? 0);
  return base + (flex > 0 && position !== 'QB' ? 1 : 0);
}

const OUT_DESIGNATIONS = new Set(['O', 'OUT', 'IR', 'PUP', 'SUS', 'SUSP']);

function injuryLabel(status: string | undefined): string | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (OUT_DESIGNATIONS.has(s)) return 'out';
  if (s === 'D' || s === 'DOUBTFUL') return 'doubtful';
  if (s === 'Q' || s === 'QUESTIONABLE') return 'questionable';
  return null;
}

export function dropOrHoldVerdicts(
  league: League,
  team: Team,
  pool: DraftPoolFile = POOL,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
): DropOrHoldRow[] {
  const index = indexPool(pool);
  const valueLeague = valueLeagueFor(league);
  const vor = vorPoints(pool.players, valueLeague, cfg);
  const slots = valueLeague.rosterSlots;
  const week = currentWeekEstimate();

  const roster: PoolPlayer[] = [];
  for (const p of team.roster ?? []) {
    const resolved = resolvePoolPlayer(p, index);
    if (resolved && posKeyOf(resolved)) roster.push(resolved);
  }

  // Positional depth rank on this team, by VOR.
  const depthRank = new Map<string, number>();
  for (const position of SKILL_POSITIONS) {
    roster
      .filter(p => posKeyOf(p) === position)
      .sort((a, b) => (vor.get(b.id) ?? 0) - (vor.get(a.id) ?? 0))
      .forEach((p, i) => depthRank.set(p.id, i + 1));
  }

  const rows: DropOrHoldRow[] = [];
  for (const player of roster) {
    const v = Math.round((vor.get(player.id) ?? 0) * 10) / 10;
    const pos = posKeyOf(player)!;
    const rank = depthRank.get(player.id) ?? 1;
    const demand = demandFor(pos, slots);
    const reasons: string[] = [];
    let score = 0;

    const injury = injuryLabel(player.injuryStatus);
    const bodyPart = player.injuryBodyPart ? ` (${player.injuryBodyPart})` : '';
    if (injury === 'out') {
      score += 50;
      reasons.push(
        `Designated out${bodyPart} — not scoring any time soon.`,
      );
    } else if (injury === 'doubtful') {
      score += 20;
      reasons.push(`Doubtful${bodyPart} — likely inactive this week.`);
    } else if (injury === 'questionable') {
      score += 8;
      reasons.push(`Questionable${bodyPart} — a game-time risk.`);
    }

    if (v <= 0) {
      score += 25;
      reasons.push(`At or below replacement value at ${pos} (VOR ${v}).`);
    } else if (v < 3) {
      score += 12;
      reasons.push(`Barely above replacement at ${pos} (VOR ${v}).`);
    }

    if (rank > demand + 1) {
      score += 15;
      reasons.push(
        `Buried at ${pos} — ${ordinal(rank)} on your depth chart, behind ${rank - demand} more than you can start.`,
      );
    }

    if (player.bye != null && player.bye < week) {
      score += 5;
      reasons.push('Bye week already passed — no reason to hold through it.');
    }

    // Hold signals pull the score back down.
    if (player.depthChartOrder === 2) {
      score -= 20;
      reasons.push('Handcuff — one injury away from a real role.');
    }

    const verdict: DropVerdict =
      score >= 55 ? 'drop' : score >= 30 ? 'regret' : 'hold';

    rows.push({ player, vor: v, verdict, score, reasons });
  }

  return rows
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DROP_ROWS);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
