import { useState } from 'react';
import type { LoadingProgress } from '@/hooks/useLeague';
import styles from './HomePage.module.css';

interface HomePageProps {
  onLoadPin: (pin: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  progress: LoadingProgress | null;
}

export function HomePage({ onLoadPin, isLoading, error, progress }: HomePageProps) {
  const [pin, setPin] = useState('');
  const base = import.meta.env.BASE_URL;

  const submit = () => {
    const trimmed = pin.trim();
    if (trimmed) onLoadPin(trimmed);
  };

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

        {/* PIN entry is the front door: no accounts, no connect forms. */}
        <div
          className={styles.pinBox}
          title="Enter the league PIN to load our league — no account needed."
        >
          <label className={styles.pinLabel} htmlFor="league-pin">
            League PIN
          </label>
          <div className={styles.pinRow}>
            <input
              id="league-pin"
              value={pin}
              onChange={e => setPin(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="Enter PIN"
              autoComplete="off"
              maxLength={10}
              className={styles.pinInput}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={submit}
              disabled={isLoading || !pin.trim()}
              className={styles.pinButton}
            >
              {isLoading ? 'Loading…' : 'Load league'}
            </button>
          </div>
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
