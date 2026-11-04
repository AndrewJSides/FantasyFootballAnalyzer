import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSleeperWeekProjections } from './sleeperWeeklyProjections';

vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), debug: vi.fn() } }));

afterEach(() => vi.unstubAllGlobals());

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status, json: async () => body })),
  );
}

describe('fetchSleeperWeekProjections', () => {
  it('maps player_id/pts_ppr rows to a sleeper-id projection map', async () => {
    mockFetch([
      { player_id: 'abc', stats: { pts_ppr: 18.4 } },
      { player_id: 'def', stats: { pts_ppr: 9.1 } },
    ]);
    await expect(fetchSleeperWeekProjections(2026, 9)).resolves.toEqual({
      abc: 18.4,
      def: 9.1,
    });
  });

  it('drops rows with no finite pts_ppr instead of failing', async () => {
    mockFetch([
      { player_id: 'abc', stats: { pts_ppr: 18.4 } },
      { player_id: 'idp', stats: { pts_ppr: null } },
      { player_id: 'nan', stats: { pts_ppr: 'lots' } },
      null,
      { nope: true },
    ]);
    await expect(fetchSleeperWeekProjections(2026, 9)).resolves.toEqual({
      abc: 18.4,
    });
  });

  it('throws on HTTP errors so the UI can show an explicit error state', async () => {
    mockFetch({ error: 'boom' }, false, 503);
    await expect(fetchSleeperWeekProjections(2026, 9)).rejects.toThrow('HTTP 503');
  });

  it('throws on unexpected response shapes', async () => {
    mockFetch({ players: [] });
    await expect(fetchSleeperWeekProjections(2026, 9)).rejects.toThrow(
      'unexpected response shape',
    );
  });

  it('hits the season/week projections endpoint', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchSleeperWeekProjections(2026, 9);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.sleeper.app/projections/nfl/2026/9?season_type=regular',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });
});
