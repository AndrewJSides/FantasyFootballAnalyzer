import styles from './GuestBanner.module.css';

interface GuestBannerProps {
  // Clears guest mode and lands on the home loader, which auto-loads the
  // single league (the old multi-league connect form is gone).
  onConnect: () => void;
}

// Shown on guest pages (Rankings, Draft Room) to set expectations: the data
// pages, real team names, and season switching all need a real connection.
export function GuestBanner({ onConnect }: GuestBannerProps) {
  return (
    // guest-banner is a global hook so the phone draft room can hide this
    // while a draft is live (see .draft-focus in index.css). The module class
    // is hashed, so a stable name is the only way to reach it from there.
    <div className={`${styles.banner} guest-banner`} role="status">
      <div className={`container ${styles.inner}`}>
        <p className={styles.text}>
          <span className={styles.tag}>Guest mode</span>
          Rankings, site values, and the draft room only. Load the league
          for real team names, draft grades, trades, awards, and history.
          Switching seasons needs a login.
        </p>
        <button
          type="button"
          className={styles.connect}
          onClick={() => { onConnect(); }}
          // The label says what it is — the title says what happens on
          // click (clears guest mode and lands on the home loader, which
          // auto-loads the single league), matching the title discipline.
          title="Leave guest mode and load the league with real team names, grades, trades, and history"
          aria-label="Load the league"
        >
          Load the league
        </button>
      </div>
    </div>
  );
}
