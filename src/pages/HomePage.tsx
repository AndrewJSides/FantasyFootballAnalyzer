import type { LoadingProgress } from '@/hooks/useLeague';
import { DEFAULT_LEAGUE_PIN } from '@/api/pinLeague';
import styles from './HomePage.module.css';

interface HomePageProps {
  onLoadPin: (pin: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  progress: LoadingProgress | null;
}

export function HomePage({ onLoadPin, isLoading, error, progress }: HomePageProps) {
  const base = import.meta.env.BASE_URL;

  // Single-league mode: the app auto-loads our league (App's default-load
  // effect). No PIN form — this page is just the loading / error state.
  const retry = () => onLoadPin(DEFAULT_LEAGUE_PIN);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.kicker}>🦍 TRADERAPE</span>
        <h1 className={styles.title}>Grade the trade before you make it.</h1>
        <p className={styles.subtitle}>
          TraderApe grades fantasy football trades before they happen — value
          over replacement computed for our league's exact shape, with
          roster-aware takes on positional need.
        </p>

        <div className={styles.pinBox} title="Loading our league — no account needed.">
          {isLoading ? (
            <p className={styles.pinLabel}>Loading our league…</p>
          ) : error ? (
            <>
              <p className={styles.pinLabel}>Couldn't load the league.</p>
              <div className={styles.pinRow}>
                <button type="button" onClick={retry} className={styles.pinButton}>
                  Try again
                </button>
              </div>
            </>
          ) : (
            <p className={styles.pinLabel}>Loading our league…</p>
          )}
        </div>

        {isLoading && progress && (
          <div className={styles.progressContainer} role="status" aria-live="polite">
            <div className={styles.progressHeader}>
              <span className={styles.progressStage}>{progress.stage}</span>
              <span className={styles.progressCount}>
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
            {progress.detail && (
              <div className={styles.progressDetail}>{progress.detail}</div>
            )}
          </div>
        )}

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <nav className={styles.heroLinks} aria-label="Start here">
          <a href={`${base}trade-analyzer`}>Trade Analyzer</a>
          <a href={`${base}rankings`}>Rankings</a>
          <span className={styles.heroLinksNote}>No login required</span>
        </nav>
      </header>
    </div>
  );
}
