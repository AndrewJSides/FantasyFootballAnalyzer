import { useEffect } from 'react';
import { WaiverTable } from '@/components';
import { DataAsOf } from '@/components/DataAsOf';
import { SITE_TITLE } from '../utils/siteTitle';
import type { League } from '@/types';
import styles from './WaiversPage.module.css';

interface WaiversPageProps {
  league: League;
}

export function WaiversPage({ league }: WaiversPageProps) {
  // Tab title tells the Waivers tab apart from the other league tabs
  // (matches the Teams/Trades/Rankings/Luck page titles). Leaving restores
  // the site title (matches the Admin/Awards/Luck discipline).
  useEffect(() => {
    document.title = 'Waiver Wire · TraderApe';
    return () => {
      document.title = SITE_TITLE;
    };
  }, []);
  const hasTransactions = league.teams.some(
    team => team.transactions && team.transactions.length > 0
  );

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Waiver Wire</h1>
          {/* Transactions come from the owner's last /admin sync, not a live
              pull — show how fresh the snapshot is (matches
              Teams/Luck/Trades/Awards pages). */}
          <DataAsOf syncedAt={league.pinSyncedAt} />
          <p className={styles.subtitle}>
            {league.season} pickups and free agent adds
          </p>
        </div>

        {hasTransactions ? (
          <WaiverTable
            teams={league.teams}
            pointsBasis={league.waiverPointsBasis}
          />
        ) : (
          <div className={styles.empty}>
            <h2>No Transaction Data Available</h2>
            <p>
              Transaction data could not be loaded for this league.
              This might happen if:
            </p>
            <ul aria-label="No transaction data available">
              <li>No waiver claims or free agent pickups have been made yet</li>
              <li>This is a new league with no activity</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
