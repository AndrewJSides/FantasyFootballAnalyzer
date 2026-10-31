import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchNflNews } from './espnNews';

vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), debug: vi.fn() } }));

afterEach(() => vi.unstubAllGlobals());

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status, json: async () => body })),
  );
}

const article = {
  id: 50333636,
  headline: 'Packers rule out Josh Jacobs for Sunday',
  description: 'Jacobs is out with an ankle injury.',
  published: '2026-10-31T06:27:30Z',
  images: [{ url: 'https://a.espncdn.com/photo/x.jpg' }],
  categories: [
    { type: 'league', description: 'NFL' },
    {
      type: 'team',
      description: 'Green Bay Packers',
      team: { abbreviation: 'GB' },
    },
    { type: 'athlete', description: 'Josh Jacobs' },
  ],
  links: { web: { href: 'https://www.espn.com/nfl/story/_/id/50333636/x' } },
};

describe('fetchNflNews', () => {
  it('maps ESPN articles to news items with athlete and team tags', async () => {
    mockFetch({ header: 'NFL News', articles: [article] });
    const r = await fetchNflNews(30);
    expect(r).toEqual([
      {
        id: '50333636',
        headline: 'Packers rule out Josh Jacobs for Sunday',
        description: 'Jacobs is out with an ankle injury.',
        published: '2026-10-31T06:27:30Z',
        url: 'https://www.espn.com/nfl/story/_/id/50333636/x',
        imageUrl: 'https://a.espncdn.com/photo/x.jpg',
        athletes: ['Josh Jacobs'],
        teams: ['GB'],
      },
    ]);
  });

  it('tolerates missing optional fields and drops malformed articles', async () => {
    mockFetch({
      articles: [
        { ...article, images: [], categories: [] },
        { ...article, description: undefined },
        { headline: 'no published or link', description: 'x' },
        null,
        { nope: true },
      ],
    });
    const r = await fetchNflNews(30);
    expect(r).toHaveLength(2);
    expect(r[0].imageUrl).toBeUndefined();
    expect(r[0].athletes).toEqual([]);
    expect(r[0].teams).toEqual([]);
    expect(r[1].description).toBe('');
  });

  it('throws on HTTP errors so the UI can show an explicit error state', async () => {
    mockFetch({ error: 'boom' }, false, 503);
    await expect(fetchNflNews(30)).rejects.toThrow('ESPN news: HTTP 503');
  });

  it('throws on unexpected response shapes', async () => {
    mockFetch({ articles: 'nope' });
    await expect(fetchNflNews(30)).rejects.toThrow(
      'ESPN news: unexpected response shape',
    );
  });

  it('throws on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down');
      }),
    );
    await expect(fetchNflNews(30)).rejects.toThrow('down');
  });
});
