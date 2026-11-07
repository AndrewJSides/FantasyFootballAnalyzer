import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWeeklyUsage } from './sleeperUsage';

vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), debug: vi.fn() } }));

afterEach(() => vi.unstubAllGlobals());

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status, json: async () => body })),
  );
}

describe('fetchWeeklyUsage', () => {
  it('maps per-week stats to usage lines for played weeks', async () => {
    mockFetch({
      p1: { gp: 1, off_snp: 55, tm_off_snp: 70, rec_tgt: 8, rush_att: 2, rec: 6, rush_rz_att: 3, rec_rz_tgt: 2, rec_air_yd: 96, rec_20_29: 1, rec_30_39: 1, rec_40p: 1, rec_lng: 45, rec_yar: 61, rec_yd: 58, rush_yd: 12, rush_td: 1, rec_td: 2, pass_yd: 301, pass_td: 2, pass_att: 34, pass_cmp: 21, pass_int: 1, rush_fd: 4, rec_fd: 3, pts_ppr: 21.5 },
      p2: { gp: 0, off_snp: 0, tm_off_snp: 70, rec_tgt: 0, rush_att: 0, rec: 0 },
    });
    const r = await fetchWeeklyUsage(2026, 1);
    expect(r?.weeks).toEqual([1]);
    expect(r?.usageBySleeperId.p1[1]).toEqual({
      offSnaps: 55,
      teamSnaps: 70,
      targets: 8,
      rushAtt: 2,
      receptions: 6,
      rzOpps: 5,
      airYards: 96,
      deepRec: 3,
      longRec: 45,
      yac: 61,
      recYards: 58,
      rushYards: 12,
      rushTd: 1,
      recTd: 2,
      passYards: 301,
      passTd: 2,
      passAtt: 34,
      passCmp: 21,
      passInt: 1,
      rushFd: 4,
      recFd: 3,
      ptsPpr: 21.5,
      sacks: 0,
      defInt: 0,
      fumRec: 0,
      defTd: 0,
      safeties: 0,
      blkKick: 0,
      ptsAllow: 0,
      fgm: 0,
      fga: 0,
      xpm: 0,
    });
    // gp 0 → no line recorded.
    expect(r?.usageBySleeperId.p2).toBeUndefined();
  });

  it('treats missing fields as zero and skips failed weeks', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls += 1;
        if (url.endsWith('/2026/2')) {
          return { ok: false, status: 500, json: async () => ({}) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ p1: { gp: 1 } }),
        };
      }),
    );
    const r = await fetchWeeklyUsage(2026, 2);
    expect(calls).toBe(2);
    expect(r?.weeks).toEqual([1]);
    expect(r?.usageBySleeperId.p1[1]).toEqual({
      offSnaps: 0,
      teamSnaps: 0,
      targets: 0,
      rushAtt: 0,
      receptions: 0,
      rzOpps: 0, airYards: 0, deepRec: 0, longRec: 0, yac: 0, recYards: 0, rushYards: 0, rushTd: 0, recTd: 0, passYards: 0, passTd: 0, passAtt: 0, passCmp: 0, passInt: 0, rushFd: 0, recFd: 0, ptsPpr: 0, sacks: 0, defInt: 0, fumRec: 0, defTd: 0, safeties: 0, blkKick: 0, ptsAllow: 0, fgm: 0, fga: 0, xpm: 0,
    });
  });

  it('returns undefined when no week loads', async () => {
    mockFetch({ error: 'boom' }, false, 503);
    await expect(fetchWeeklyUsage(2026, 2)).resolves.toBeUndefined();
  });

  it('returns undefined for an empty week range', async () => {
    await expect(fetchWeeklyUsage(2026, 0)).resolves.toBeUndefined();
  });
});
