// Trade report card util: per-team trade PAR totals, W-L record, best/worst
// trade selection, grades, and the null hide-conditions.
import { describe, it, expect } from 'vitest';
import { buildTradeReportCard } from './tradeReportCard';
import type { Trade, Team } from '@/types';

function side(
  teamId: string,
  teamName: string,
  netPar: number | undefined,
  netValue = 0,
): Trade['teams'][number] {
  return {
    teamId,
    teamName,
    playersReceived: [],
    playersSent: [],
    parGained: 0,
    parLost: 0,
    netPAR: netPar as number,
    pointsGained: 0,
    pointsLost: 0,
    netValue,
  };
}

function trade(
  id: string,
  week: number,
  teams: Trade['teams'],
  winner?: string,
  status: Trade['status'] = 'completed',
): Trade {
  return { id, timestamp: 1, week, status, teams, winner };
}

function mkTeam(id: string, name: string): Team {
  return { id, name, roster: [] } as Team;
}

describe('buildTradeReportCard', () => {
  it('sums net PAR, ranks best first, records W-L and best/worst trades, grades', () => {
    const trades = [
      trade('t1', 3, [side('a', 'Alpha', 12.5), side('b', 'Beta', -12.5)], 'a'),
      trade('t2', 5, [side('a', 'Alpha', -4), side('b', 'Beta', 4)], 'b'),
    ];
    const teams = [mkTeam('a', 'Alpha'), mkTeam('b', 'Beta')];
    const rows = buildTradeReportCard(trades, teams);
    expect(rows).not.toBeNull();
    // Alpha: +8.5, Beta: -8.5 — Alpha first.
    expect(rows![0].teamName).toBe('Alpha');
    expect(rows![0].trades).toBe(2);
    expect(rows![0].wins).toBe(1);
    expect(rows![0].losses).toBe(1);
    expect(rows![0].fair).toBe(0);
    expect(rows![0].totalNetPar).toBe(8.5);
    expect(rows![0].bestTrade).toEqual({ label: 'W3 vs Beta', netPar: 12.5 });
    expect(rows![0].worstTrade).toEqual({ label: 'W5 vs Beta', netPar: -4 });
    expect(rows![0].grade).toBe('A+');
    expect(rows![1].teamName).toBe('Beta');
    expect(rows![1].totalNetPar).toBe(-8.5);
    expect(rows![1].grade).toBe('C+');
  });

  it('ignores pending and vetoed trades', () => {
    const trades = [
      trade('t1', 3, [side('a', 'Alpha', 12.5), side('b', 'Beta', -12.5)], 'a'),
      trade('t2', 6, [side('a', 'Alpha', 100), side('b', 'Beta', -100)], undefined, 'pending'),
      trade('t3', 7, [side('a', 'Alpha', 100), side('b', 'Beta', -100)], undefined, 'vetoed'),
    ];
    const rows = buildTradeReportCard(trades, [mkTeam('a', 'Alpha'), mkTeam('b', 'Beta')]);
    expect(rows![0].trades).toBe(1);
    expect(rows![0].totalNetPar).toBe(12.5);
  });

  it('falls back to netValue when the sync graded no netPAR', () => {
    const trades = [
      trade('t1', 3, [side('a', 'Alpha', undefined, 9), side('b', 'Beta', undefined, -9)], 'a'),
    ];
    const rows = buildTradeReportCard(trades, [mkTeam('a', 'Alpha'), mkTeam('b', 'Beta')]);
    expect(rows![0].totalNetPar).toBe(9);
    expect(rows![1].totalNetPar).toBe(-9);
  });

  it('counts a no-winner trade as fair for both sides', () => {
    const trades = [
      trade('t1', 3, [side('a', 'Alpha', 1), side('b', 'Beta', -1)]),
    ];
    const rows = buildTradeReportCard(trades, [mkTeam('a', 'Alpha'), mkTeam('b', 'Beta')]);
    expect(rows![0].wins).toBe(0);
    expect(rows![0].losses).toBe(0);
    expect(rows![0].fair).toBe(1);
  });

  it('labels multi-team deals instead of guessing the opponent', () => {
    const trades = [
      trade('t1', 4, [
        side('a', 'Alpha', 5),
        side('b', 'Beta', -2),
        side('c', 'Gamma', -3),
      ], 'a'),
    ];
    const rows = buildTradeReportCard(trades, [mkTeam('a', 'Alpha'), mkTeam('b', 'Beta'), mkTeam('c', 'Gamma')]);
    expect(rows![0].bestTrade!.label).toBe('W4 · multi-team');
  });

  it('excludes teams that made no trades', () => {
    const trades = [
      trade('t1', 3, [side('a', 'Alpha', 5), side('b', 'Beta', -5)], 'a'),
    ];
    const rows = buildTradeReportCard(trades, [mkTeam('a', 'Alpha'), mkTeam('b', 'Beta'), mkTeam('c', 'Gamma')]);
    expect(rows!.map(r => r.teamName)).toEqual(['Alpha', 'Beta']);
  });

  it('returns null when there are no completed trades or no teams', () => {
    expect(buildTradeReportCard([], [mkTeam('a', 'Alpha')])).toBeNull();
    expect(buildTradeReportCard(undefined, [mkTeam('a', 'Alpha')])).toBeNull();
    expect(
      buildTradeReportCard(
        [trade('t1', 3, [side('a', 'Alpha', 5), side('b', 'Beta', -5)], 'a', 'pending')],
        [mkTeam('a', 'Alpha')],
      ),
    ).toBeNull();
    expect(
      buildTradeReportCard(
        [trade('t1', 3, [side('a', 'Alpha', 5), side('b', 'Beta', -5)], 'a')],
        [],
      ),
    ).toBeNull();
  });
});
