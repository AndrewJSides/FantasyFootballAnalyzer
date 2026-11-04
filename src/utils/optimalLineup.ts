// Optimal starting lineup from a roster, scored by a caller-supplied number
// (the Start/Sit page passes points per game from actual season scoring).
//
// This is the forward-looking sibling of lineups.ts's bestLineupPoints, which
// scores a week that already happened. The assignment rule is the same greedy
// most-restrictive-slot-first pass, which is optimal here because the slot
// eligibility sets are nested (QB inside SUPERFLEX, RB/WR/TE inside FLEX):
// filling the narrowest slots first never blocks a later slot that a
// wide-slot player could also fill.
//
// Positions are normalized the same way as the rest of the app: DEF/D/ST all
// mean DST, and a player whose position matches no slot is bench-only, never
// forced into a slot it can't play.
//
// Backlog item 120 adds manager overrides (locked / excluded player ids):
// locks claim slots before the greedy pass, exclusions never enter it.
// Bye/injury benching stays the caller's job — the Start/Sit page filters
// those players out before calling, so a lock can never resurrect them.

import type { RosterSlots } from '@/types';

export interface OptimalLineupPlayer {
  id: string;
  name: string;
  position: string;
  /** Caller-supplied score the lineup is optimized on (ppg on the page). */
  score: number;
}

/** Backlog item 120 — manager overrides on the Start/Sit page. */
export interface LineupOverrides {
  /** Players forced into the lineup when an eligible slot is open. */
  lockedIds?: ReadonlySet<string>;
  /** Players kept out of the lineup entirely (wins over a lock). */
  excludedIds?: ReadonlySet<string>;
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

export interface AssignedSlot {
  slot: string;
  player: OptimalLineupPlayer | null;
}

export interface OptimalLineup {
  starters: AssignedSlot[];
  bench: OptimalLineupPlayer[];
  /** Sum of starter scores, rounded to 2dp like the rest of the app. */
  totalScore: number;
}

export function normalizeLineupPos(pos: string): string {
  return pos === 'DEF' || pos === 'D/ST' ? 'DST' : pos;
}

// Which player positions each starting slot accepts. Slot names follow the
// RosterSlots keys; FLEX/SUPERFLEX mirror lineups.ts's eligibility sets.
const SLOT_ELIGIBLE: Record<string, readonly string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DST: ['DST'],
  FLEX: ['RB', 'WR', 'TE'],
  SUPERFLEX: ['QB', 'RB', 'WR', 'TE'],
};

export function slotEligiblePositions(slot: string): readonly string[] {
  return SLOT_ELIGIBLE[slot] ?? [];
}

// Expand roster-slot counts into an ordered slot list, in the order the page
// displays them. BENCH and IR are not starting slots.
export function expandSlots(slots: RosterSlots): string[] {
  const out: string[] = [];
  for (const slot of ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPERFLEX', 'K', 'DST'] as const) {
    for (let i = 0; i < (slots[slot] ?? 0); i++) out.push(slot);
  }
  return out;
}

export function optimalLineup(
  players: OptimalLineupPlayer[],
  slots: RosterSlots,
  overrides: LineupOverrides = {},
): OptimalLineup {
  const { lockedIds = EMPTY_SET, excludedIds = EMPTY_SET } = overrides;
  const slotList = expandSlots(slots);
  // Highest score first; ties break by name so the result is deterministic.
  const pool = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const used = new Set<number>();
  const assigned = new Map<string, OptimalLineupPlayer | null>();
  // Narrowest slots first: a QB-only slot must claim its QB before the
  // SUPERFLEX slot can take it, and FLEX must claim before... (FLEX and
  // SUPERFLEX are both wide, so order between them follows slot list order
  // after the eligibility-size sort, which is stable.)
  const order = slotList
    .map((slot, i) => ({ slot, i }))
    .sort(
      (a, b) =>
        slotEligiblePositions(a.slot).length - slotEligiblePositions(b.slot).length ||
        a.i - b.i,
    );
  // Backlog item 120 — manager overrides. Exclusion wins over a lock on
  // the same player (a veto beats a force). Locked players claim slots
  // first, narrowest eligible open slot first, in score order, so a locked
  // QB takes the QB slot rather than squatting in SUPERFLEX; a locked
  // player with no open eligible slot stays on the bench (the page names
  // him as unhonored). Excluded players never enter the greedy pass.
  const open = new Set(order.map(o => o.i));
  const locked = pool
    .map((p, pi) => ({ p, pi }))
    .filter(({ p }) => lockedIds.has(p.id) && !excludedIds.has(p.id))
    .sort((a, b) => b.p.score - a.p.score || a.p.name.localeCompare(b.p.name));
  for (const { p, pi } of locked) {
    const pos = normalizeLineupPos(p.position);
    const target = order
      .filter(o => open.has(o.i) && slotEligiblePositions(o.slot).includes(pos))
      .sort(
        (a, b) =>
          slotEligiblePositions(a.slot).length - slotEligiblePositions(b.slot).length ||
          a.i - b.i,
      )[0];
    if (!target) continue;
    open.delete(target.i);
    used.add(pi);
    assigned.set(String(target.i), p);
  }
  for (const { slot, i } of order) {
    if (!open.has(i)) continue;
    const eligible = slotEligiblePositions(slot);
    const idx = pool.findIndex(
      (p, pi) =>
        !used.has(pi) &&
        !excludedIds.has(p.id) &&
        eligible.includes(normalizeLineupPos(p.position)),
    );
    if (idx === -1) {
      assigned.set(String(i), null);
      continue;
    }
    used.add(idx);
    assigned.set(String(i), pool[idx]);
  }
  // Any slot the lock pass filled already has its assignment; every open
  // slot got an assignment (or an explicit null) from the greedy pass.
  const starters: AssignedSlot[] = slotList.map((slot, i) => ({
    slot,
    player: assigned.get(String(i)) ?? null,
  }));
  const bench = pool.filter((_, pi) => !used.has(pi));
  const totalScore = Math.round(starters.reduce((s, a) => s + (a.player?.score ?? 0), 0) * 100) / 100;
  return { starters, bench, totalScore };
}
