// Add/Drop move suggestions: pair each team's most cuttable bench player
// with the best available waiver target. FAAB guidance prices the pickup
// and Trending Adds surfaces market momentum, but neither says "drop THIS
// bench player for THAT target" — that's this module.
//
// "Cuttable" means a player below projected starter demand at his position
// (the FLEX slot counts as one more slot split across RB/WR/TE — the same
// convention tradeFinder.ts uses), so cutting him doesn't touch the
// projected starting lineup. Value is VOR from the bundled full-PPR
// projections against this league's replacement levels (the same math the
// Trade Finder prices with). A move only fires when the add beats the drop
// by MIN_VOR_GAIN, so it suggests upgrades, not lateral churn.

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
import { type TeamProfile } from './tradeFinder';

// A move fires only when the add beats the drop by this much VOR.
export const MIN_VOR_GAIN = 2.0;

// Cap so the panel stays a short list of best moves.
export const MAX_SUGGESTIONS = 3;

const SKILL_POSITIONS: PositionKey[] = ['QB', 'RB', 'WR', 'TE'];

export interface AddDropMove {
  drop: PoolPlayer;
  dropVor: number;
  add: PoolPlayer;
  addVor: number;
  // addVor - dropVor, the upgrade in VOR on paper.
  gain: number;
  // Human-readable reasons, strongest first — the UI shows them under the move.
  reasons: string[];
}

function posKeyOf(p: PoolPlayer): PositionKey | null {
  const p_ = p.pos.toUpperCase();
  return SKILL_POSITIONS.includes(p_ as PositionKey) ? (p_ as PositionKey) : null;
}

// Starter demand per position, counting each FLEX slot as one more slot
// split across RB/WR/TE (same coarse convention as tradeFinder.ts).
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

// Bench players sorted least-valuable first, each beyond starter demand at
// his position — cutting any of them leaves the projected starters intact.
export function dropCandidates(
  league: League,
  team: Team,
  pool: DraftPoolFile = POOL,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
): { player: PoolPlayer; vor: number }[] {
  const index = indexPool(pool);
  const valueLeague = valueLeagueFor(league);
  const vor = vorPoints(pool.players, valueLeague, cfg);
  const slots = valueLeague.rosterSlots;

  const roster: PoolPlayer[] = [];
  for (const p of team.roster ?? []) {
    const resolved = resolvePoolPlayer(p, index);
    if (resolved && posKeyOf(resolved)) roster.push(resolved);
  }

  const cuttable: { player: PoolPlayer; vor: number }[] = [];
  for (const position of SKILL_POSITIONS) {
    const at = roster
      .filter(p => posKeyOf(p) === position)
      .sort((a, b) => (vor.get(b.id) ?? 0) - (vor.get(a.id) ?? 0));
    const demand = demandFor(position, slots);
    for (const p of at.slice(demand)) {
      cuttable.push({ player: p, vor: Math.round((vor.get(p.id) ?? 0) * 10) / 10 });
    }
  }
  return cuttable.sort((a, b) => a.vor - b.vor);
}

// Available waiver targets: skill-position pool players on no roster,
// sorted most valuable first.
export function addTargets(
  league: League,
  pool: DraftPoolFile = POOL,
  limit = 8,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
): { player: PoolPlayer; vor: number }[] {
  const index = indexPool(pool);
  const valueLeague = valueLeagueFor(league);
  const vor = vorPoints(pool.players, valueLeague, cfg);

  const rostered = new Set<string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      const resolved = resolvePoolPlayer(p, index);
      if (resolved) rostered.add(resolved.id);
    }
  }

  return pool.players
    .filter(p => posKeyOf(p) !== null && !rostered.has(p.id))
    .map(p => ({ player: p, vor: Math.round((vor.get(p.id) ?? 0) * 10) / 10 }))
    .filter(t => t.vor > 0)
    .sort((a, b) => b.vor - a.vor)
    .slice(0, Math.max(0, limit));
}

// Greedily pair the best available target with the least valuable cuttable
// bench player it beats by the margin, up to `limit` moves. Each drop
// candidate is used at most once, and the bench list re-sorts after each
// pair so the moves stay independent.
export function addDropSuggestions(
  league: League,
  team: Team,
  profile: TeamProfile | undefined,
  pool: DraftPoolFile = POOL,
  limit = MAX_SUGGESTIONS,
  cfg: VorConfig = DEFAULT_VOR_CONFIG,
): AddDropMove[] {
  const drops = dropCandidates(league, team, pool, cfg);
  if (drops.length === 0) return [];
  const targets = addTargets(league, pool, 8, cfg);
  if (targets.length === 0) return [];

  const moves: AddDropMove[] = [];
  const remaining = [...drops];
  for (const target of targets) {
    if (moves.length >= limit) break;
    const drop = remaining[0];
    if (!drop || target.vor - drop.vor < MIN_VOR_GAIN) break;
    remaining.shift();

    const pos = posKeyOf(target.player) ?? 'WR';
    const reasons = [
      `+${Math.round((target.vor - drop.vor) * 10) / 10} VOR on paper ` +
        `(${drop.vor} → ${target.vor}).`,
    ];
    if (profile?.positions[pos]?.need) {
      reasons.push(
        `Fills a need at ${pos}: your best is below the league median.`,
      );
    }
    reasons.push(
      `${drop.player.name} is your least valuable bench ${drop.player.pos.toUpperCase()} — ` +
        `below projected starter demand, so cutting him doesn't touch your starters.`,
    );

    moves.push({
      drop: drop.player,
      dropVor: drop.vor,
      add: target.player,
      addVor: target.vor,
      gain: Math.round((target.vor - drop.vor) * 10) / 10,
      reasons,
    });
  }
  return moves;
}
