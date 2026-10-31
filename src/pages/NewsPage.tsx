import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SITE_TITLE } from '@/utils/siteTitle';
import { fetchNflNews, type NflNewsItem } from '@/api/espnNews';
import { matchNewsAthletes } from '@/utils/newsPlayers';
import { filterNewsToMyPlayers, myTeamPoolIds } from '@/utils/myTeamNews';
import { timeAgo } from '@/utils/relativeTime';
import { POOL } from '@/data/draftPool';
import type { League } from '@/types';
import styles from './NewsPage.module.css';

type Status = 'loading' | 'ready' | 'error';
type Scope = 'all' | 'mine';

const NEWS_LIMIT = 30;

interface NewsPageProps {
  // Present in league mode; absent for guests. The "My players" filter only
  // appears when the league has a remembered my-team with a synced roster.
  league?: League;
}

export function NewsPage({ league }: NewsPageProps) {
  const [items, setItems] = useState<NflNewsItem[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [scope, setScope] = useState<Scope>('all');
  const [announcement, setAnnouncement] = useState('Loading NFL headlines.');

  const load = useCallback(async () => {
    setStatus('loading');
    setAnnouncement('Loading NFL headlines.');
    try {
      const news = await fetchNflNews(NEWS_LIMIT);
      setItems(news);
      setStatus('ready');
      setAnnouncement(
        news.length > 0
          ? `Loaded ${news.length} NFL headlines.`
          : 'No headlines returned.',
      );
    } catch {
      setStatus('error');
      setAnnouncement('Could not load NFL headlines.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Tab title follows the page while mounted (matches the Trades tab
  // pattern). Leaving the page restores the site title.
  useEffect(() => {
    document.title = 'NFL News · TraderApe';
    return () => {
      document.title = SITE_TITLE;
    };
  }, []);

  // Athlete names -> pool players, so tagged players deep-link into Player
  // Journey. Unmatched names render as plain text.
  const playerByAthlete = useMemo(() => {
    const names = items.flatMap(item => item.athletes);
    return matchNewsAthletes(names, POOL);
  }, [items]);

  // Roster-scoped filter (backlog item 58): pool ids on the manager's own
  // roster, so "My players" keeps only headlines tagging one of them.
  const myPoolIds = useMemo(
    () => (league ? myTeamPoolIds(league) : new Set<string>()),
    [league],
  );
  const myItems = useMemo(
    () => filterNewsToMyPlayers(items, playerByAthlete, myPoolIds),
    [items, playerByAthlete, myPoolIds],
  );
  const showScopeToggle = myPoolIds.size > 0;
  const visibleItems = scope === 'mine' && showScopeToggle ? myItems : items;

  const chooseScope = (next: Scope) => {
    setScope(next);
    const shown = next === 'mine' ? myItems.length : items.length;
    setAnnouncement(
      next === 'mine'
        ? `Showing ${shown} ${shown === 1 ? 'headline' : 'headlines'} about your players.`
        : `Showing all ${shown} ${shown === 1 ? 'headline' : 'headlines'}.`,
    );
  };

  return (
    <div className={styles.newsPage}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>NFL News</h1>
          <p className={styles.subtitle}>
            Latest headlines from ESPN&apos;s free public feed
          </p>
        </div>

        <div className={styles.toolbar}>
          {showScopeToggle ? (
            <div
              className={styles.scopeToggle}
              role="group"
              aria-label="News scope"
            >
              <button
                type="button"
                className={styles.scopeButton}
                aria-pressed={scope === 'all'}
                onClick={() => chooseScope('all')}
              >
                All news ({items.length})
              </button>
              <button
                type="button"
                className={styles.scopeButton}
                aria-pressed={scope === 'mine'}
                onClick={() => chooseScope('mine')}
              >
                My players ({myItems.length})
              </button>
            </div>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={load}
            disabled={status === 'loading'}
            className={styles.refreshButton}
          >
            {status === 'loading' ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className={styles.status}>
          {status === 'loading' && <p>Loading headlines…</p>}
          {status === 'error' && (
            <div>
              <p>Couldn&apos;t load the headlines. ESPN&apos;s feed may be down.</p>
              <button
                type="button"
                onClick={load}
                className={styles.retryButton}
              >
                Try again
              </button>
            </div>
          )}
          {status === 'ready' && visibleItems.length === 0 && (
            <p>
              {scope === 'mine' && showScopeToggle
                ? 'No headlines right now tag anyone on your roster.'
                : 'No headlines right now — check back soon.'}
            </p>
          )}
        </div>

        {status === 'ready' && visibleItems.length > 0 && (
          <ul className={styles.list}>
            {visibleItems.map(item => (
              <li key={item.id} className={styles.card}>
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className={styles.thumb}
                    loading="lazy"
                  />
                )}
                <div className={styles.body}>
                  <h2 className={styles.headline}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.headline}
                    </a>
                  </h2>
                  {item.description && (
                    <p className={styles.description}>{item.description}</p>
                  )}
                  <div className={styles.meta}>
                    <time
                      dateTime={item.published}
                      title={item.published}
                      className={styles.time}
                    >
                      {timeAgo(item.published)}
                    </time>
                    {item.teams.map(team => (
                      <span key={team} className={styles.teamChip}>
                        {team}
                      </span>
                    ))}
                    {item.athletes.map(name => {
                      const player = playerByAthlete.get(name);
                      return player ? (
                        <Link
                          key={name}
                          to={`/players?player=${encodeURIComponent(player.id)}`}
                          className={styles.athleteLink}
                          title={`View ${name} in Player Journey`}
                        >
                          {name}
                        </Link>
                      ) : (
                        <span key={name} className={styles.athleteText}>
                          {name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className={styles.footnote}>
          Headlines from ESPN&apos;s free public NFL news API. Tagged players
          link into Player Journey where they match TraderApe&apos;s player
          pool; unmatched names are shown as text. The &ldquo;My players&rdquo;
          filter shows only headlines tagged to players on your synced roster.
          Headline links open ESPN in a new tab.
        </p>

        <span className="visually-hidden" aria-live="polite">
          {announcement}
        </span>
      </div>
    </div>
  );
}
