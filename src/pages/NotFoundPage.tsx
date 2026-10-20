import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SITE_TITLE } from '../utils/siteTitle';
import styles from './NotFoundPage.module.css';

// TraderApe personality page for unmatched routes — a dead-end in the jungle
// instead of the silent bounce home.
export function NotFoundPage() {
  // The 404 gets its own tab title like every other page, so a dead tab is
  // tellable apart from a loaded one at a glance. Leaving restores the page
  // title — matches the other pages' tab-title pattern.
  useEffect(() => {
    document.title = '404 — Off the Board · TraderApe';
    // Cleanup restores the site default, not the 404 title — matches every
    // other page's cleanup-restores-parent pattern.
    return () => {
      document.title = SITE_TITLE;
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.ape} aria-hidden="true">
        🦍
      </div>
      <h1 className={styles.title}>404 — Off the Board</h1>
      <p className={styles.copy}>
        That route went undrafted. No league, no trade, nothing but jungle back here.
      </p>
      <Link className={styles.homeLink} to="/">
        Back to TraderApe
      </Link>
    </div>
  );
}
