// NFL live scoreboard (backlog item 84): this week's NFL games with live
// scores from ESPN's free public scoreboard API — the same free-data family
// as the /news feed and the fetch:gametimes script. Yahoo, ESPN and Sleeper
// all ship live scores on game day; TraderApe had nothing live.
//
// League mode marks each game with the manager's rostered players on either
// NFL team ("your guys"), so a manager sees at a glance which of his players
// are on the field. The board auto-refreshes every 60s while any game is
// live; announced via an aria-live region.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SITE_TITLE } from '@/utils/siteTitle';
import { fetchNflScoreboard, type ScoreboardGame } from '@/api/espnScoreboard';
import {
  gameMyPlayersLine,
  scoreboardCounts,
  sortScoreboardGames,
  teamMyPlayers,
} from '@/utils/scoreboard';
import { myTeamPoolIds } from '@/utils/myTeamNews';
import { currentWeekEstimate } from '@/utils/matchupRating';
import { timeAgo } from '@/utils/relativeTime';
import { POOL } from '@/data/draftPool';
import type { League } from '@/types';
import styles from './ScoreboardPage.module.css';

type Status = 'loading' | 'ready' | 'error';

// Re-fetch while games are live so the board tracks the action; paused once
// everything is final or pre-game to avoid pointless polling.
const LIVE_REFRESH_MS = 60_000;

interface ScoreboardPageProps {
  // Present in league mode; absent for guests. The "your guys" markers only
  // appear when the league has a remembered my-team with a synced roster.
  league?: League;
}

function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function gameAriaLabel(game: ScoreboardGame): string {
  const away = `${game.awayName} ${game.awayAbbr}`;
  const home = `${game.homeName} ${game.homeAbbr}`;
  if (game.state === 'in') {
    const score =
      game.awayScore !== null && game.homeScore !== null
        ? `${game.awayScore} to ${game.homeScore}`
        : 'score unavailable';
    return `${away} at ${home}, live: ${score}, ${game.statusLine}`;
  }
  if (game.state === 'post') {
    const score =
      game.awayScore !== null && game.homeScore !== null
        ? `${game.awayScore} to ${game.homeScore}`
        : 'score unavailable';
    return `${away} at ${home}, final: ${score}`;
  }
  return `${away} at ${home}, kicks off ${kickoffLabel(game.date)}`;
}

export function ScoreboardPage({ league }: ScoreboardPageProps) {
  const season = league?.season ?? 2026;
  const week = league?.currentWeek ?? currentWeekEstimate();
  const [games, setGames] = useState<ScoreboardGame[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [announcement, setAnnouncement] = useState('Loading NFL scores.');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setAnnouncement('Loading NFL scores.');
    try {
      const board = await fetchNflScoreboard(season, week);
      setGames(board);
      setUpdatedAt(Date.now());
      setStatus('ready');
      const counts = scoreboardCounts(board);
      setAnnouncement(
        board.length > 0
          ? `Loaded ${board.length} games for week ${week}: ` +
            `${counts.live} live, ${counts.upcoming} upcoming, ${counts.final} final.`
          : `No games found for week ${week}.`,
      );
    } catch {
      setStatus('error');
      setAnnouncement('Could not load NFL scores.');
    }
  }, [season, week]);

  useEffect(() => {
    load();
  }, [load]);

  // Tab title follows the page while mounted (matches the News tab pattern).
  // Leaving the page restores the site title.
  useEffect(() => {
    document.title = 'NFL Scores · TraderApe';
    return () => {
      document.title = SITE_TITLE;
    };
  }, []);

  const sorted = useMemo(() => sortScoreboardGames(games), [games]);
  const counts = useMemo(() => scoreboardCounts(games), [games]);
  const hasLive = counts.live > 0;

  // Auto-refresh while any game is live; stop polling once the slate is
  // done or hasn't started (manual Refresh still works).
  useEffect(() => {
    if (refreshTimer.current) {
      clearInterval(refreshTimer.current);
      refreshTimer.current = null;
    }
    if (status === 'ready' && hasLive) {
      refreshTimer.current = setInterval(() => {
        void load();
      }, LIVE_REFRESH_MS);
    }
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      refreshTimer.current = null;
    };
  }, [status, hasLive, load]);

  // "Your guys": the manager's rostered players per NFL team, so each game
  // names who's on the field from his roster.
  const byTeam = useMemo(() => {
    if (!league) return new Map<string, Array<{ name: string; pos: string }>>();
    return teamMyPlayers(myTeamPoolIds(league), POOL);
  }, [league]);

  return (
    <div className={styles.scoreboardPage}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>NFL Scores</h1>
          <p className={styles.subtitle}>
            Week {week} · live scores from ESPN&apos;s free public feed
          </p>
        </div>

        <div className={styles.toolbar}>
          <p className={styles.counts} aria-hidden="true">
            {counts.live} live · {counts.upcoming} upcoming · {counts.final}{' '}
            final
          </p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={status === 'loading'}
            className={styles.refreshButton}
          >
            {status === 'loading' ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <p className={styles.updated} aria-hidden="true">
          {updatedAt !== null && status === 'ready'
            ? `Updated ${timeAgo(new Date(updatedAt).toISOString())}${
                hasLive ? ' · auto-refreshes every minute while games are live' : ''
              }`
            : '\u00A0'}
        </p>

        <div className="visually-hidden" role="status" aria-live="polite">
          {announcement}
        </div>

        <div className={styles.status}>
          {status === 'loading' && <p>Loading scores…</p>}
          {status === 'error' && (
            <div>
              <p>Couldn&apos;t load the scores. ESPN&apos;s feed may be down.</p>
              <button
                type="button"
                onClick={() => void load()}
                className={styles.retryButton}
              >
                Try again
              </button>
            </div>
          )}
          {status === 'ready' && sorted.length === 0 && (
            <p>No games on the slate for week {week} — check back soon.</p>
          )}
        </div>

        {status === 'ready' && sorted.length > 0 && (
          <ul className={styles.board} aria-label={`Week ${week} NFL scores`}>
            {sorted.map(game => {
              const myLine = gameMyPlayersLine(game, byTeam);
              return (
                <li
                  key={game.id}
                  className={`${styles.game} ${styles[game.state]}`}
                  aria-label={gameAriaLabel(game)}
                >
                  <div className={styles.teams}>
                    <span className={styles.team}>
                      <span className={styles.abbr}>{game.awayAbbr}</span>
                      <span className={styles.score}>
                        {game.awayScore ?? '–'}
                      </span>
                    </span>
                    <span className={styles.at} aria-hidden="true">
                      @
                    </span>
                    <span className={styles.team}>
                      <span className={styles.abbr}>{game.homeAbbr}</span>
                      <span className={styles.score}>
                        {game.homeScore ?? '–'}
                      </span>
                    </span>
                  </div>
                  <div className={styles.meta}>
                    {game.state === 'in' && (
                      <span className={styles.liveBadge}>LIVE</span>
                    )}
                    <span className={styles.stateLine}>
                      {game.state === 'pre'
                        ? kickoffLabel(game.date)
                        : game.statusLine}
                    </span>
                  </div>
                  {myLine && (
                    <p className={styles.myGuys}>
                      <span className={styles.myGuysLabel}>Your guys:</span>{' '}
                      {myLine}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className={styles.method}>
          Method: live scores from ESPN&apos;s free public scoreboard API,
          refreshed while games are in progress. &ldquo;Your guys&rdquo; marks
          players on your synced roster in league mode.
        </p>
      </div>
    </div>
  );
}
