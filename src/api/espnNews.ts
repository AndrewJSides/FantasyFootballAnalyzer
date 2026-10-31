// Latest NFL headlines from ESPN's free public news API (no auth).
// Powers the /news page — FantasyPros, Sleeper and Yahoo all ship a news
// feed; TraderApe had none. Same fetch contract as sleeperTrending.ts:
// 10s timeout, throws on HTTP/network failure so the page can show an
// explicit error state rather than a silent empty list.

import { logger } from '@/utils/logger';

const NEWS_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news';
const FETCH_TIMEOUT_MS = 10_000;

export interface NflNewsItem {
  /** ESPN article id, stable for keying the list. */
  id: string;
  headline: string;
  description: string;
  /** ISO timestamp from ESPN's `published` field. */
  published: string;
  /** Canonical ESPN article URL. */
  url: string;
  imageUrl?: string;
  /** Full athlete names from ESPN's athlete categories (may be empty). */
  athletes: string[];
  /** NFL abbreviations from ESPN's team categories (may be empty). */
  teams: string[];
}

interface NewsCategory {
  type?: unknown;
  description?: unknown;
  team?: { abbreviation?: unknown };
}

interface NewsArticle {
  id?: unknown;
  headline?: unknown;
  description?: unknown;
  published?: unknown;
  images?: Array<{ url?: unknown }>;
  categories?: unknown;
  links?: { web?: { href?: unknown } };
}

function isCategory(c: unknown): c is NewsCategory {
  return typeof c === 'object' && c !== null;
}

/** Parse one article row; returns undefined for malformed rows so one bad
 *  article never sinks the whole feed. */
function parseArticle(article: unknown): NflNewsItem | undefined {
  if (typeof article !== 'object' || article === null) return undefined;
  const a = article as NewsArticle;
  if (
    typeof a.headline !== 'string' ||
    typeof a.published !== 'string' ||
    typeof a.links?.web?.href !== 'string'
  ) {
    return undefined;
  }
  const athletes: string[] = [];
  const teams: string[] = [];
  if (Array.isArray(a.categories)) {
    for (const raw of a.categories) {
      if (!isCategory(raw)) continue;
      if (
        raw.type === 'athlete' &&
        typeof raw.description === 'string' &&
        raw.description.length > 0
      ) {
        athletes.push(raw.description);
      } else if (
        raw.type === 'team' &&
        typeof raw.team?.abbreviation === 'string' &&
        raw.team.abbreviation.length > 0
      ) {
        teams.push(raw.team.abbreviation);
      }
    }
  }
  const item: NflNewsItem = {
    id: String(a.id ?? a.headline),
    headline: a.headline,
    description:
      typeof a.description === 'string' ? a.description : '',
    published: a.published,
    url: a.links.web.href,
    athletes,
    teams,
  };
  const imageUrl = a.images?.[0]?.url;
  if (typeof imageUrl === 'string' && imageUrl.length > 0) {
    item.imageUrl = imageUrl;
  }
  return item;
}

/** Fetch the latest NFL headlines. Throws on HTTP or network failure so the
 *  caller can show an explicit error state rather than a silent empty list. */
export async function fetchNflNews(
  limit = 30,
): Promise<NflNewsItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${NEWS_BASE}?limit=${limit}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ESPN news: HTTP ${res.status}`);
    const data: unknown = await res.json();
    if (
      typeof data !== 'object' ||
      data === null ||
      !Array.isArray((data as { articles?: unknown }).articles)
    ) {
      throw new Error('ESPN news: unexpected response shape');
    }
    const articles = (data as { articles: unknown[] }).articles;
    return articles
      .map(parseArticle)
      .filter((item): item is NflNewsItem => item !== undefined);
  } catch (e) {
    logger.warn('[espn-news] fetch failed:', e);
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    clearTimeout(timeout);
  }
}
