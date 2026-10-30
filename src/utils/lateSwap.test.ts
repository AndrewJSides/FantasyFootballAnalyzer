import { describe, expect, it } from 'vitest';
import { lateSwapAlerts, type WatchPlayer } from '@/utils/lateSwap';

// Week 8 fixtures (from the bundled ESPN snapshot): DAL/ARI kick Sunday
// 18:00 UTC (2:00pm ET, "Sun 1pm"), KC/DEN kick 21:25 UTC (5:25pm ET,
// "Sun 4pm"). DAL's K/DAL matchup: DAL hosts ARI.
const STARTER_EARLY: WatchPlayer = {
  name: 'CeeDee Lamb',
  position: 'WR',
  nflTeam: 'DAL',
  slot: 'WR',
};
const BENCH_LATE_WR: WatchPlayer = {
  name: 'Rashee Rice',
  position: 'WR',
  nflTeam: 'KC',
};
const BENCH_LATE_RB: WatchPlayer = {
  name: 'Isiah Pacheco',
  position: 'RB',
  nflTeam: 'KC',
};
const STARTER_LATE: WatchPlayer = {
  name: 'Patrick Mahomes',
  position: 'QB',
  nflTeam: 'KC',
  slot: 'QB',
};

describe('lateSwapAlerts', () => {
  it('warns on a Questionable starter with a later same-slot bench option', () => {
    const alerts = lateSwapAlerts({
      starters: [{ ...STARTER_EARLY, injuryStatus: 'Questionable' }],
      bench: [BENCH_LATE_WR],
      week: 8,
    });
    const risk = alerts.find(a => a.kind === 'risk');
    expect(risk).toBeDefined();
    expect(risk!.headline).toContain('CeeDee Lamb');
    expect(risk!.headline).toContain('Questionable');
    // The bench option plays later, so a late scratch is still swappable.
    expect(risk!.detail).toContain('Rashee Rice');
  });

  it('warns when a game-time decision has NO later cover', () => {
    const alerts = lateSwapAlerts({
      starters: [{ ...STARTER_LATE, injuryStatus: 'Doubtful' }],
      bench: [BENCH_LATE_RB],
      week: 8,
    });
    const risk = alerts.find(a => a.kind === 'risk');
    expect(risk).toBeDefined();
    expect(risk!.detail).toMatch(/no same-slot bench player.*later/i);
  });

  it('stays silent for healthy starters', () => {
    const alerts = lateSwapAlerts({
      starters: [STARTER_EARLY, STARTER_LATE],
      bench: [BENCH_LATE_WR],
      week: 8,
    });
    expect(alerts.filter(a => a.kind === 'risk')).toHaveLength(0);
  });

  it('names late-swap insurance pieces playing after early locks', () => {
    const alerts = lateSwapAlerts({
      starters: [STARTER_EARLY, STARTER_LATE],
      bench: [BENCH_LATE_RB],
      week: 8,
    });
    const insurance = alerts.find(a => a.kind === 'insurance');
    expect(insurance).toBeDefined();
    expect(insurance!.headline).toContain('Isiah Pacheco');
    expect(insurance!.detail).toMatch(/stays swappable until/);
  });

  it('never counts a bench player in an ineligible slot as cover', () => {
    // A same-slot FLEX starter vs a later bench player who can't fill it.
    const flexStarter: WatchPlayer = {
      name: 'Sam LaPorta',
      position: 'TE',
      nflTeam: 'DAL',
      slot: 'FLEX',
      injuryStatus: 'Questionable',
    };
    const alerts = lateSwapAlerts({
      starters: [flexStarter],
      bench: [BENCH_LATE_RB],
      week: 8,
    });
    const risk = alerts.find(a => a.kind === 'risk');
    expect(risk).toBeDefined();
    // The later RB fills FLEX, so it IS cover — assert the contract both
    // ways via a player who can't: a late QB for a FLEX TE starter.
    const qbBench: WatchPlayer = { name: 'Bo Nix', position: 'QB', nflTeam: 'DEN' };
    const alerts2 = lateSwapAlerts({
      starters: [flexStarter],
      bench: [qbBench],
      week: 8,
    });
    expect(alerts2.find(a => a.kind === 'risk')!.detail).toMatch(/no same-slot/i);
  });

  it('returns nothing without a week', () => {
    expect(
      lateSwapAlerts({ starters: [STARTER_EARLY], bench: [], week: undefined }),
    ).toHaveLength(0);
  });
});
