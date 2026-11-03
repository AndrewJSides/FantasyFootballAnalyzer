// Latest news for one player on the Player Journey pane (backlog item 110):
// the newest ESPN headlines tagging this player, via the same athlete→pool
// join the /news page uses. Hides entirely while loading, on fetch failure,
// or when no headline tags the player — most players have no news, so the
// pane stays quiet instead of showing an empty box.

import { useEffect, useState } from 'react';
import { fetchNflNews, type NflNewsItem } from '@/api/espnNews';
import { POOL } from '@/data/draftPool';
import { matchNewsAthletes } from '@/utils/newsPlayers';
import { matchKey } from '@/utils/playerNames';
import { timeAgo } from '@/utils/relativeTime';
import styles from './PlayerNews.module.css';

const NEWS_LIMIT = 30;
const MAX_HEADLINES = 5;

export function PlayerNews({ playerName }: { playerName: string }) {
  const [items, setItems] = useState<NflNewsItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    fetchNflNews(NEWS_LIMIT)
      .then(news => {
        if (cancelled) return;
        const matched = matchNewsAthletes(
          news.flatMap(item => item.athletes),
          POOL,
        );
        const key = matchKey(playerName);
        setItems(
          news
            .filter(item =>
              item.athletes.some(athlete => {
                const poolPlayer = matched.get(athlete);
                return (
                  poolPlayer !== undefined && matchKey(poolPlayer.name) === key
                );
              }),
            )
            .slice(0, MAX_HEADLINES),
        );
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [playerName]);

  if (!items || items.length === 0) return null;

  return (
    <div className={styles.news}>
      <h3 className={styles.newsTitle}>Latest news</h3>
      <ul
        className={styles.newsList}
        aria-label={`Latest news about ${playerName}`}
      >
        {items.map(item => (
          <li key={item.id} className={styles.newsItem}>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className={styles.newsLink}
            >
              {item.headline}
            </a>{' '}
            <span className={styles.newsTime}>{timeAgo(item.published)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.newsFootnote}>
        Headlines from ESPN&apos;s free public feed; links open ESPN.
      </p>
    </div>
  );
}
