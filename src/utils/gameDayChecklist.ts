// Game-day checklist for the Start/Sit page (backlog item 70).
//
// A manager on Sunday morning has to cross-check the Late-swap watch, the
// kickoff chips, the benched Out starters, and the roster-alert holes to
// answer "what do I actually need to do before kickoff". This consolidates
// the actionable pieces into one check-off-able list: game-time decisions
// (with their rescue/insurance status from the late-swap engine), the
// kickoff lock order, the Out starters the optimizer already benched, and
// no-cover holes with the top waiver fillers from the roster-alert scan.
//
// Guidance only — nothing moves lineups. All inputs are already-computed
// page data, so the util stays pure and synchronous: TraderApe's own
// engines (items 35, 48, 67), no new data source.

import { gameKickoff } from '@/utils/gameTimes';
import type { SwapAlert } from '@/utils/lateSwap';

export type ChecklistKind = 'action' | 'info' | 'done';

export interface ChecklistItem {
  kind: ChecklistKind;
  headline: string;
  detail: string;
}

export interface ChecklistStarter {
  name: string;
  slot: string;
  position: string;
  nflTeam: string;
}

export interface ChecklistInjuredOut {
  name: string;
  /** e.g. "Out (Knee)" or "IR". */
  label: string;
}

export interface ChecklistHole {
  /** Slot types affected, e.g. ['RB'] or ['RB', 'RB']. */
  slots: string[];
  cause: 'bye' | 'injury';
  /** Top available waiver fillers, names only. */
  fillers: string[];
}

export interface GameDayChecklistInput {
  week: number | undefined;
  starters: ChecklistStarter[];
  /** Injured-out players the optimizer benched (item 67). */
  injuredOutBenched: ChecklistInjuredOut[];
  /** Late-swap alerts already computed by the page (item 35). */
  swapAlerts: SwapAlert[];
  /** Current-week no-cover holes from the roster-alert scan (item 48). */
  holes: ChecklistHole[];
}

export function buildGameDayChecklist({
  week,
  starters,
  injuredOutBenched,
  swapAlerts,
  holes,
}: GameDayChecklistInput): ChecklistItem[] {
  if (week === undefined || starters.length === 0) return [];
  const items: ChecklistItem[] = [];

  // 1. Game-time decisions and swap insurance, straight from the late-swap
  //    engine — these are the only "decide before kickoff" items.
  for (const alert of swapAlerts) {
    items.push({
      kind: alert.kind === 'risk' ? 'action' : 'info',
      headline: alert.headline,
      detail: alert.detail,
    });
  }

  // 2. Ruled-out starters the optimizer already benched — the done line
  //    confirms there's nothing left to fix, rather than leaving the
  //    manager wondering why his RB1 isn't in the starters table.
  for (const p of injuredOutBenched) {
    items.push({
      kind: 'done',
      headline: `${p.name} (${p.label}) is benched automatically`,
      detail: 'The optimizer never starts a player ruled out — he sits regardless of projection. No action needed.',
    });
  }

  // 3. Kickoff lock order: starters lock at their own kickoff, so the
  //    manager sees at a glance which decisions come first and which
  //    players stay swappable longest.
  const groups = new Map<string, { slot: string; rank: number; names: string[] }>();
  for (const s of starters) {
    const k = gameKickoff(s.nflTeam, week);
    if (!k) continue;
    const g = groups.get(k.slot);
    if (g) g.names.push(s.name);
    else groups.set(k.slot, { slot: k.slot, rank: k.rank, names: [s.name] });
  }
  const ordered = [...groups.values()].sort((a, b) => a.rank - b.rank);
  if (ordered.length >= 2) {
    items.push({
      kind: 'info',
      headline: `Kickoff order: ${ordered.map(g => `${g.slot} (${g.names.join(', ')})`).join(' → ')}`,
      detail:
        'Starters lock at their own kickoff, not at the first game — players in the later windows stay swappable longest.',
    });
  }

  // 4. No-cover holes: a slot whose starter is out with no bench cover.
  //    The roster-alert scan already named the top waiver fillers.
  for (const hole of holes) {
    const slotLabel = hole.slots.length > 1 ? `${hole.slots[0]} ×${hole.slots.length}` : hole.slots[0];
    const cause = hole.cause === 'injury' ? 'injury' : 'bye';
    items.push({
      kind: 'action',
      headline: `${slotLabel} has no cover in week ${week} (${cause})`,
      detail:
        hole.fillers.length > 0
          ? `No bench player covers the slot — top waiver fillers: ${hole.fillers.join(', ')}.`
          : 'No bench player covers the slot and no waiver filler ranks — stream the position or trade for cover.',
    });
  }

  // 5. The all-clear: when nothing needs doing, say so explicitly rather
  //    than rendering an empty section.
  if (items.length === 0) {
    items.push({
      kind: 'done',
      headline: 'Nothing needs doing before kickoff',
      detail: 'No game-time decisions, no ruled-out starters, no unfilled holes — the lineup is set.',
    });
  }

  return items;
}
