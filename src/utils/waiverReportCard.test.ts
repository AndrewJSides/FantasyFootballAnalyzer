// Waiver report card util: per-team waiver PAR totals, best/worst pickup
// selection, grades, and the null hide-conditions.
import { describe, it, expect } from 'vitest';
import { attachFaabEfficiency, buildWaiverReportCard } from './waiverReportCard';
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

describe('attachFaabEfficiency', () => {
  it('prices dollars per PAR point, one decimal', () => {
    const rows = buildWaiverReportCard([
      mkTeam('a', 'Alpha', [wireTx('a', [pickup('Boom', 20)])]),
      mkTeam('b', 'Beta', [wireTx('b', [pickup('Steady', 10)])]),
    ])!;
    const eff = attachFaabEfficiency(rows, [
      { teamId: 'a', teamName: 'Alpha', claims: 1, spent: 25, biggestBid: 25, faabReceived: 0, faabSent: 0, estRemaining: 75 },
      { teamId: 'b', teamName: 'Beta', claims: 1, spent: 40, biggestBid: 40, faabReceived: 0, faabSent: 0, estRemaining: 60 },
    ]);
    // 25 / 20 = 1.25 -> 1.3; 40 / 10 = 4.0
    expect(eff.get('a')).toEqual({ spent: 25, dollarsPerPoint: 1.3, freeProduction: false });
    expect(eff.get('b')).toEqual({ spent: 40, dollarsPerPoint: 4, freeProduction: false });
  });

  it('flags free production and no-return spend', () => {
    const rows = buildWaiverReportCard([
      mkTeam('a', 'Alpha', [wireTx('a', [pickup('Freebie', 8)])]),
      mkTeam('b', 'Beta', [wireTx('b', [pickup('Dud', -2)])]),
    ])!;
    const eff = attachFaabEfficiency(rows, [
      { teamId: 'a', teamName: 'Alpha', claims: 1, spent: 0, biggestBid: 0, faabReceived: 0, faabSent: 0, estRemaining: 100 },
      { teamId: 'b', teamName: 'Beta', claims: 1, spent: 15, biggestBid: 15, faabReceived: 0, faabSent: 0, estRemaining: 85 },
    ]);
    expect(eff.get('a')).toEqual({ spent: 0, dollarsPerPoint: null, freeProduction: true });
    expect(eff.get('b')).toEqual({ spent: 15, dollarsPerPoint: null, freeProduction: false });
  });

  it('skips teams with no matching budget row', () => {
    const rows = buildWaiverReportCard([
      mkTeam('a', 'Alpha', [wireTx('a', [pickup('Boom', 12)])]),
    ])!;
    expect(attachFaabEfficiency(rows, []).size).toBe(0);
  });
});
