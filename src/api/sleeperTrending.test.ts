import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchTrendingAdds } from './sleeperTrending';

vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), debug: vi.fn() } }));

afterEach(() => vi.unstubAllGlobals());

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status, json: async () => body })),
  );
}

describe('fetchTrendingAdds', () => {
  it('maps player_id/count rows to playerId/count pairs', async () => {
    mockFetch([
      { player_id: 'abc', count: 120 },
      { player_id: 'def', count: 87 },
    ]);
    const r = await fetchTrendingAdds(24, 25);
    expect(r).toEqual([
      { playerId: 'abc', count: 120 },
      { playerId: 'def', count: 87 },
    ]);
  });

  it('drops malformed rows instead of failing', async () => {
    mockFetch([
      { player_id: 'abc', count: 120 },
      { player_id: 42, count: 'lots' },
      null,
      { nope: true },
    ]);
    const r = await fetchTrendingAdds(24, 25);
    expect(r).toEqual([{ playerId: 'abc', count: 120 }]);
  });

  it('throws on HTTP errors so the UI can show an explicit error state', async () => {
    mockFetch({ error: 'boom' }, false, 503);
    await expect(fetchTrendingAdds(24, 25)).rejects.toThrow('HTTP 503');
  });

  it('throws on unexpected response shapes', async () => {
    mockFetch({ players: [] });
    await expect(fetchTrendingAdds(24, 25)).rejects.toThrow('unexpected response shape');
  });

  it('throws when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(fetchTrendingAdds(24, 25)).rejects.toThrow('network down');
  });

  it('passes the lookback and limit through to the URL', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }));
    vi.stubGlobal('fetch', spy);
    await fetchTrendingAdds(12, 10);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain('lookback_hours=12');
    expect(String(spy.mock.calls[0][0])).toContain('limit=10');
  });
});
