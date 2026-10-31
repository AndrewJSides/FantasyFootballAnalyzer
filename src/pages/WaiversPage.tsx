import { useEffect } from 'react';
import { AddDropMoves, BreakoutWatch, DstStreamers, FaabGuidance, HandcuffReport, InjuryReport, KickerStreamers, SkillStreamers, StashReport, TrendingAdds, WaiverTable } from '@/components';
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

        {/* Bid guidance prices the top available targets against this
            league's own FAAB norms — before the historical pickup table. */}
        <FaabGuidance league={league} />

        {/* League-wide waiver momentum, filtered to players this league can
            actually add — priced with TraderApe's own projection + matchup. */}
        <TrendingAdds league={league} />

        {/* Players whose last-3 average is surging vs their own earlier
            pace — role expansions the season rankings haven't caught yet. */}
        <BreakoutWatch league={league} />

        {/* Best available team defenses to stream this week, ranked by how
            generous each opponent's offense has been to opposing defenses. */}
        <DstStreamers league={league} />

        {/* Best available kickers to stream this week, ranked by how
            generous each opponent's defense has been to opposing kickers. */}
        <KickerStreamers league={league} />

        {/* Best available QBs and TEs to stream this week, ranked by how
            generous each opponent's defense has been to the position. */}
        <SkillStreamers league={league} position="QB" />
        <SkillStreamers league={league} position="TE" />

        {/* Every NFL backfield's lead back and direct backup, with league
            ownership — the league-wide answer to which handcuffs are worth
            stashing. */}
        <HandcuffReport league={league} />

        {/* Available players with real rest-of-season value and a short-term
            reason they are cheap this week — the "stash him before the waiver
            rush" answer. */}
        <StashReport league={league} />

        {/* Every injured startable player, worst first, with league
            ownership — the league-wide answer to "who is hurt and who
            owns them". */}
        <InjuryReport league={league} />

        {/* Pair each team's most cuttable bench player with the best waiver
            target that beats him — the "drop THIS for THAT" answer. */}
        <AddDropMoves league={league} />

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
