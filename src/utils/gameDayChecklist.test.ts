// Tests for the game-day checklist (backlog item 70). Week 8 2026
// kickoff data is real bundled data: BUF plays Sun 1pm, KC plays
// Sun 4pm, PHI plays SNF — so the kickoff-order logic runs on the same
// shape the page feeds it.

import { describe, expect, it } from 'vitest';
import {
  buildGameDayChecklist,
  type GameDayChecklistInput,
} from '@/utils/gameDayChecklist';

function base(over: Partial<GameDayChecklistInput> = {}): GameDayChecklistInput {
  return {
    week: 8,
    starters: [
      { name: 'Early QB', slot: 'QB', position: 'QB', nflTeam: 'BUF' },
      { name: 'Late WR', slot: 'WR', position: 'WR', nflTeam: 'KC' },
      { name: 'Prime RB', slot: 'RB', position: 'RB', nflTeam: 'PHI' },
    ],
    injuredOutBenched: [],
    swapAlerts: [],
    holes: [],
    ...over,
  };
}

describe('buildGameDayChecklist', () => {
  it('returns no items without a week', () => {
    expect(buildGameDayChecklist(base({ week: undefined }))).toEqual([]);
  });

  it('returns no items without starters', () => {
    expect(buildGameDayChecklist(base({ starters: [] }))).toEqual([]);
  });

  it('renders the all-clear line when nothing needs doing', () => {
    const items = buildGameDayChecklist(base());
    // Kickoff order still fires (>= 2 windows), so the all-clear only
    // appears when even the kickoff order is trivial.
    const itemsOneWindow = buildGameDayChecklist(
      base({
        starters: [
          { name: 'Early QB', slot: 'QB', position: 'QB', nflTeam: 'BUF' },
          { name: 'Early RB', slot: 'RB', position: 'RB', nflTeam: 'BAL' },
        ],
      }),
    );
    expect(itemsOneWindow).toHaveLength(1);
    expect(itemsOneWindow[0].kind).toBe('done');
    expect(itemsOneWindow[0].headline).toMatch(/nothing needs doing/i);
    // With three windows the info item still precedes any all-clear need.
    expect(items.some(i => i.kind === 'info')).toBe(true);
  });

  it('turns swap alerts into action/info items', () => {
    const items = buildGameDayChecklist(
      base({
        swapAlerts: [
          { kind: 'risk', headline: 'Q WR is Questionable and kicks off Sun 1:05pm ET', detail: 'No same-slot bench player kicks off later.' },
          { kind: 'insurance', headline: 'Late-swap insurance: Late WR (Sun 4pm)', detail: 'Stays swappable until Sun 4:05pm ET.' },
        ],
      }),
    );
    expect(items[0]).toMatchObject({ kind: 'action', headline: 'Q WR is Questionable and kicks off Sun 1:05pm ET' });
    expect(items[1]).toMatchObject({ kind: 'info', headline: 'Late-swap insurance: Late WR (Sun 4pm)' });
  });

  it('confirms benched Out starters as done items', () => {
    const items = buildGameDayChecklist(
      base({ injuredOutBenched: [{ name: 'Hurt RB', label: 'Out (Knee)' }] }),
    );
    const done = items.find(i => i.headline.includes('Hurt RB'));
    expect(done?.kind).toBe('done');
    expect(done?.headline).toMatch(/benched automatically/);
  });

  it('lists kickoff windows in chronological order', () => {
    const items = buildGameDayChecklist(base());
    const order = items.find(i => i.headline.startsWith('Kickoff order'));
    expect(order).toBeDefined();
    const h = order!.headline;
    expect(h.indexOf('Sun 1pm')).toBeLessThan(h.indexOf('Sun 4pm'));
    expect(h.indexOf('Sun 4pm')).toBeLessThan(h.indexOf('SNF'));
    expect(h).toContain('Early QB');
    expect(h).toContain('Prime RB');
  });

  it('skips the kickoff order line with a single window', () => {
    const items = buildGameDayChecklist(
      base({
        starters: [
          { name: 'A', slot: 'QB', position: 'QB', nflTeam: 'BUF' },
          { name: 'B', slot: 'RB', position: 'RB', nflTeam: 'BAL' },
        ],
      }),
    );
    expect(items.some(i => i.headline.startsWith('Kickoff order'))).toBe(false);
  });

  it('names no-cover holes as action items with fillers', () => {
    const items = buildGameDayChecklist(
      base({
        starters: [
          { name: 'A', slot: 'QB', position: 'QB', nflTeam: 'BUF' },
          { name: 'B', slot: 'RB', position: 'RB', nflTeam: 'BAL' },
        ],
        holes: [{ slots: ['RB', 'RB'], cause: 'bye', fillers: ['Fill RB', 'Other RB'] }],
      }),
    );
    const hole = items.find(i => i.kind === 'action' && i.headline.includes('no cover'));
    expect(hole?.headline).toMatch(/RB ×2 has no cover in week 8 \(bye\)/);
    expect(hole?.detail).toContain('Fill RB');
  });

  it('handles a hole with no fillers gracefully', () => {
    const items = buildGameDayChecklist(
      base({
        starters: [{ name: 'A', slot: 'QB', position: 'QB', nflTeam: 'BUF' }],
        holes: [{ slots: ['TE'], cause: 'injury', fillers: [] }],
      }),
    );
    const hole = items.find(i => i.headline.includes('TE has no cover'));
    expect(hole?.detail).toMatch(/no waiver filler ranks/);
  });
});
