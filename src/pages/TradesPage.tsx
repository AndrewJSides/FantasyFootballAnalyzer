import { useEffect } from 'react';
import { SITE_TITLE } from '@/utils/siteTitle';
import { DataAsOf } from '@/components/DataAsOf';
import { TradeTable } from '@/components/TradeTable';
import type { League } from '@/types';
import { verdictBasisSummary } from '@/utils/tradeVerdict';
import { TradeReportCard } from '@/components/TradeReportCard';
import styles from './TradesPage.module.css';

interface TradesPageProps {
  league: League;
}

export function TradesPage({ league }: TradesPageProps) {
  const tradeCount = league.trades?.length ?? 0;
  // Tab shows the trade count so the Trades tab reads at a glance and stays
  // tellable apart from the other league tabs (matches the Draft/Values
  // title pattern). Leaving the page restores the site title.
  useEffect(() => {
    document.title = tradeCount > 0 ? `Trades (${tradeCount}) · TraderApe` : 'Trades · TraderApe';
    return () => {
      document.title = SITE_TITLE;
    };
  }, [tradeCount]);
  const hasTrades = league.trades && league.trades.length > 0;
  // Per trade, not per platform: one trade whose weekly data is missing
  // falls back to full-season value while the rest stay post-trade.
  const basisNote = verdictBasisSummary(league.trades);

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Trade Analysis</h1>
          {/* The snapshot comes from the owner's last /admin sync, not a
              live pull — show how fresh it is (matches Teams/Luck pages). */}
          <DataAsOf syncedAt={league.pinSyncedAt} />
          <p className={styles.subtitle}>
            Analyze trades from the {league.season} season
            {basisNote && ` · ${basisNote}`}
          </p>
        </div>

        {hasTrades ? (
          <>
            <TradeReportCard league={league} />
            <TradeTable trades={league.trades || []} teams={league.teams} />
          </>
        ) : (
          <div className={styles.empty}>
            <h2>No Trades Found</h2>
            <p>
              No trades have been made in this league this season, or trade data
              could not be loaded.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
