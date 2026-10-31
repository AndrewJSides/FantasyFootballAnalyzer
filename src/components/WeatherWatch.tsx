import { useEffect, useRef, useState } from 'react';
import {
  buildGameVenues,
  fetchKickoffWeather,
  gameKickoffLabelFallback,
  summarizeWeatherWatch,
  type StarterRef,
  type WeatherWatchSummary,
} from '@/utils/weatherWatch';
import { gameKickoff } from '@/utils/gameTimes';
import styles from './WeatherWatch.module.css';

interface WeatherWatchProps {
  /** Current NFL week; undefined hides the section. */
  week: number | undefined;
  /** The page's optimized starters, so flagged games can name them. */
  starters: StarterRef[];
  /** Cache TTL in ms (tests); defaults to 6 hours. */
  cacheTtlMs?: number;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; summary: WeatherWatchSummary }
  | { kind: 'hidden' };

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

function cacheKey(week: number): string {
  return `weatherWatch:2026:${week}`;
}

function readCache(week: number, ttlMs: number): WeatherWatchSummary | null {
  try {
    const raw = localStorage.getItem(cacheKey(week));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt: number; summary: WeatherWatchSummary };
    if (!parsed || typeof parsed.fetchedAt !== 'number') return null;
    if (Date.now() - parsed.fetchedAt > ttlMs) return null;
    return parsed.summary;
  } catch {
    return null;
  }
}

function writeCache(week: number, summary: WeatherWatchSummary): void {
  try {
    localStorage.setItem(cacheKey(week), JSON.stringify({ fetchedAt: Date.now(), summary }));
  } catch {
    // Storage full or unavailable — weather just re-fetches next visit.
  }
}

// Weather Watch: kickoff-hour weather flags for the current NFL week —
// "is the game itself a problem?" Forecasts come from Open-Meteo's free
// forecast API at each venue; dome / retractable-roof games are
// weather-neutral and never flagged. A failed fetch hides the section
// quietly: weather is a bonus signal, not a page blocker.
export function WeatherWatch({ week, starters, cacheTtlMs = DEFAULT_TTL_MS }: WeatherWatchProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const startersRef = useRef(starters);
  startersRef.current = starters;

  useEffect(() => {
    if (week === undefined) {
      setState({ kind: 'hidden' });
      return;
    }
    let cancelled = false;
    const load = async () => {
      const cached = readCache(week, cacheTtlMs);
      if (cached) {
        if (!cancelled) setState({ kind: 'ready', summary: cached });
        return;
      }
      try {
        const venues = buildGameVenues(week);
        const weather = await fetchKickoffWeather(venues);
        const summary = summarizeWeatherWatch(venues, weather, startersRef.current);
        writeCache(week, summary);
        if (!cancelled) setState({ kind: 'ready', summary });
      } catch {
        if (!cancelled) setState({ kind: 'hidden' });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [week, cacheTtlMs]);

  if (state.kind !== 'ready') return null;
  const { summary } = state;

  return (
    <section aria-label="Weather watch">
      <h2 className={styles.sectionTitle}>Weather watch</h2>
      {/* The alert list swaps in after the forecast fetch; announce it. */}
      <div aria-live="polite">
        {summary.alerts.length > 0 ? (
          <ul className={styles.watchList} aria-label="Games with weather concerns">
            {summary.alerts.map(a => (
              <li key={`${a.home}:${a.away}`} className={`${styles.watchItem} ${styles.risk}`}>
                <strong>
                  {a.away} @ {a.home} — {a.venueName}, {a.city}.
                </strong>{' '}
                Kickoff {gameKickoff(a.home, week)?.label ?? gameKickoffLabelFallback(a.kickoffIso)}:{' '}
                {a.tempF}°F, wind {a.windMph} mph (gusts {a.gustsMph}), {a.precipProb}% chance of
                precipitation.{' '}
                {a.notes.map(n => (
                  <span key={n}>{n} </span>
                ))}
                {a.affectedStarters.length > 0 && (
                  <span className={styles.starters}>
                    Your starters in this game: {a.affectedStarters.join(', ')}.
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.allClear}>
            No weather concerns — checked {summary.gamesChecked} upcoming outdoor{' '}
            {summary.gamesChecked === 1 ? 'game' : 'games'}
            {summary.domesSkipped > 0 &&
              ` (${summary.domesSkipped} under a roof, weather-neutral)`}
            .
          </p>
        )}
      </div>
      <p className={styles.note}>
        Kickoff-hour forecasts from Open-Meteo&apos;s free forecast API. Flagged: wind 15+ mph
        sustained or 25+ mph gusts, 40%+ chance of precipitation, 32°F or below. Dome and
        retractable-roof games are weather-neutral.
      </p>
    </section>
  );
}
