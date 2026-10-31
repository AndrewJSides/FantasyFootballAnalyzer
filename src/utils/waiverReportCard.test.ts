// Waiver report card util: per-team waiver PAR totals, best/worst pickup
// selection, grades, and the null hide-conditions.
import { describe, it, expect } from 'vitest';
import { buildWaiverReportCard } from './waiverReportCard';
import type { Player, Team, Transaction } from '@/types';

function pickup(name: string, par: number | null): Player {
  return { id: name, platformId: name, name, position: 'WR', team: 'FA', pointsAboveReplacement: par ?? undefined } as Player;
}

function wireTx(teamId: string, adds: Player[], type: 'waiver' | 'free_agent' = 'waiver'): Transaction {
  return {
    id: `${teamId}-${adds.map(a => a.name).join('+')}`,
    type,
    timestamp: 1,
    week: 2,
    teamId,
    teamName: teamId,
    adds,
    drops: [],
  } as Transaction;
}

function mkTeam(id: string, name: string, txs: Transaction[]): Team {
  return { id, name, roster: [], transactions: txs } as Team;
}

describe('buildWaiverReportCard', () => {
  it('sums PAR, ranks best first, names best/worst pickups and grades', () => {
    const rows = buildWaiverReportCard([
      mkTeam('a', 'Alpha', [wireTx('a', [pickup('Boom', 12.5), pickup('Bust', -3)])]),
      mkTeam('b', 'Beta', [wireTx('b', [pickup('Steady', 4)])]),
    ]);
    expect(rows).not.toBeNull();
    // Alpha: 9.5 PAR, Beta: 4 PAR — Alpha first.
    expect(rows![0].teamName).toBe('Alpha');
    expect(rows![0].totalPar).toBe(9.5);
    expect(rows![0].claims).toBe(1);
    expect(rows![0].pickups).toBe(2);
    expect(rows![0].bestPickup).toEqual({ name: 'Boom', par: 12.5 });
    expect(rows![0].worstPickup).toEqual({ name: 'Bust', par: -3 });
    expect(rows![0].grade).toBe('A+');
    expect(rows![1].teamName).toBe('Beta');
    // Two-team scale: last place is percentile 0.5 → C+ on this league's curve.
    expect(rows![1].grade).toBe('C+');
  });

  it('rounds total PAR to one decimal', () => {
    const rows = buildWaiverReportCard([
      mkTeam('a', 'Alpha', [wireTx('a', [pickup('X', 1.05), pickup('Y', 2.05)])]),
    ]);
    expect(rows![0].totalPar).toBe(3.1);
  });

  it('counts free_agent transactions and multiple claims', () => {
    const rows = buildWaiverReportCard([
      mkTeam('a', 'Alpha', [
        wireTx('a', [pickup('X', 5)], 'free_agent'),
        wireTx('a', [pickup('Y', 1)]),
      ]),
    ]);
    expect(rows![0].claims).toBe(2);
    expect(rows![0].pickups).toBe(2);
  });

  it('ignores trades', () => {
    const tradeTx = { ...wireTx('a', [pickup('Traded', 50)]), type: 'trade' } as Transaction;
    const rows = buildWaiverReportCard([
      mkTeam('a', 'Alpha', [tradeTx, wireTx('a', [pickup('X', 2)])]),
    ]);
    expect(rows![0].claims).toBe(1);
    expect(rows![0].totalPar).toBe(2);
    expect(rows![0].bestPickup?.name).toBe('X');
  });

  it('returns null when no team has wire activity', () => {
    expect(buildWaiverReportCard([mkTeam('a', 'Alpha', [])])).toBeNull();
  });

  it('returns null when the sync graded no pickups (old snapshot)', () => {
    const rows = buildWaiverReportCard([
      mkTeam('a', 'Alpha', [wireTx('a', [pickup('X', null)])]),
    ]);
    expect(rows).toBeNull();
  });

  it('skips ungraded pickups but counts them', () => {
    const rows = buildWaiverReportCard([
      mkTeam('a', 'Alpha', [wireTx('a', [pickup('X', 5), pickup('Y', null)])]),
    ]);
    expect(rows![0].pickups).toBe(2);
    expect(rows![0].totalPar).toBe(5);
    expect(rows![0].bestPickup?.name).toBe('X');
  });
});
