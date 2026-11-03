import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWeeklyPprPoints } from './sleeperWeeklyPoints';

vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), debug: vi.fn() } }));

function mockWeeks(
  byWeek: Record<
    number,
    Record<
      string,
      {
        pts_ppr?: number;
        gp?: number;
        pass_td?: number;
        rush_td?: number;
        rec_td?: number;
        rec_tgt?: number;
        rush_att?: number;
        pass_att?: number;
      } | null
    > | 'fail'
  >,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const week = Number(url.split('/').pop());
      const body = byWeek[week];
      if (body === undefined || body === 'fail')
        return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => body };
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchWeeklyPprPoints', () => {
  it('maps each player to pts_ppr per week and weeks played (gp > 0)', async () => {
    mockWeeks({
      1: { a: { pts_ppr: 12.5, gp: 1 }, b: { pts_ppr: 0, gp: 1 }, c: { pts_ppr: 9, gp: 0 } },
      2: { a: { pts_ppr: 20, gp: 1 } },
    });
    const r = await fetchWeeklyPprPoints(2026, 2);
    expect(r?.weeks).toEqual([1, 2]);
    expect(r?.pointsBySleeperId).toEqual({ a: { 1: 12.5, 2: 20 }, b: { 1: 0 } });
    expect(r?.gamesBySleeperId).toEqual({ a: [1, 2], b: [1] });
  });

  it('counts a played week toward games even when pts_ppr is absent', async () => {
    mockWeeks({ 1: { a: { gp: 1 } } });
    const r = await fetchWeeklyPprPoints(2026, 1);
    expect(r?.pointsBySleeperId).toEqual({});
    expect(r?.gamesBySleeperId).toEqual({ a: [1] });
  });

  it('leaves a failed week out of the covered weeks', async () => {
    mockWeeks({ 1: { a: { pts_ppr: 10, gp: 1 } }, 2: 'fail', 3: { a: { pts_ppr: 5, gp: 1 } } });
    const r = await fetchWeeklyPprPoints(2026, 3);
    expect(r?.weeks).toEqual([1, 3]);
    expect(r?.pointsBySleeperId.a).toEqual({ 1: 10, 3: 5 });
  });

  it('returns undefined when no week loads or no week is asked for', async () => {
    mockWeeks({ 1: 'fail' });
    expect(await fetchWeeklyPprPoints(2026, 1)).toBeUndefined();
    expect(await fetchWeeklyPprPoints(2026, 0)).toBeUndefined();
  });

  it('carries TD points and usage component lines per played week', async () => {
    mockWeeks({
      1: {
        a: { pts_ppr: 18, gp: 1, pass_td: 1, rush_td: 1, rec_tgt: 5, rush_att: 10 },
        b: { pts_ppr: 4, gp: 1, rec_td: 0, rec_tgt: 2 },
        c: { pts_ppr: 9, gp: 0, pass_td: 2 },
        d: { gp: 1, rush_td: 1 },
      },
      2: { a: { pts_ppr: 12, gp: 1, rush_td: 2, rec_tgt: 3, rush_att: 8, pass_att: 4 } },
    });
    const r = await fetchWeeklyPprPoints(2026, 2);
    // TD scoring: 4 per passing TD, 6 per rush/rec TD.
    expect(r?.tdPtsBySleeperId).toEqual({ a: { 1: 10, 2: 12 }, b: { 1: 0 } });
    expect(r?.usageBySleeperId).toEqual({ a: { 1: 15, 2: 15 }, b: { 1: 2 } });
    // No points line, no component lines — the series stay aligned.
    expect(r?.tdPtsBySleeperId.d).toBeUndefined();
    expect(r?.usageBySleeperId.d).toBeUndefined();
  });

  it('caps the request at 18 weeks', async () => {
    mockWeeks({});
    await fetchWeeklyPprPoints(2026, 25);
    expect(fetch).toHaveBeenCalledTimes(18);
  });
});
