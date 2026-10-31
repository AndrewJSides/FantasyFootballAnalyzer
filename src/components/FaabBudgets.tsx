import { useMemo } from 'react';
import type { League } from '@/types';
import { ASSUMED_FAAB_BUDGET, faabBudgets } from '@/utils/faabGuidance';
import styles from './FaabBudgets.module.css';

interface FaabBudgetsProps {
  league: League;
}

// FAAB Budget Tracker: the league-wide money picture — who has spent what,
// who still has budget to outbid you. Poorest first. Guidance only: nothing
// here bids, spends, or moves money. Hidden when the league has no recorded
// bids (syncs without bid data, or non-FAAB leagues).
export function FaabBudgets({ league }: FaabBudgetsProps) {
  const rows = useMemo(() => faabBudgets(league), [league]);

  if (!rows) return null;

  const anyTradeFaab = rows.some(r => r.faabReceived > 0 || r.faabSent > 0);

  return (
    <section className={styles.panel} aria-label="FAAB budgets">
      <h2 className={styles.heading}>FAAB Budgets</h2>
      <table className={styles.table} aria-label="Estimated remaining FAAB per team, poorest first">
        <thead>
          <tr>
            <th scope="col">Team</th>
            <th scope="col" className={styles.num}>Claims</th>
            <th scope="col" className={styles.num}>Spent</th>
            <th scope="col" className={styles.num}>Biggest bid</th>
            {anyTradeFaab && (
              <th scope="col" className={styles.num}>FAAB in trades</th>
            )}
            <th scope="col" className={styles.num}>Est. remaining</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const netTrade = row.faabReceived - row.faabSent;
            return (
              <tr key={row.teamId}>
                <th scope="row" className={styles.team}>{row.teamName}</th>
                <td className={styles.num}>{row.claims}</td>
                <td className={styles.num}>${row.spent}</td>
                <td className={styles.num}>${row.biggestBid}</td>
                {anyTradeFaab && (
                  <td
                    className={styles.num}
                    aria-label={
                      netTrade === 0
                        ? `No FAAB moved in trades for ${row.teamName}`
                        : `${row.teamName} ${netTrade > 0 ? 'gained' : 'lost'} $${Math.abs(netTrade)} in trades`
                    }
                    title={
                      netTrade === 0
                        ? 'No FAAB moved in trades'
                        : `Received $${row.faabReceived}, sent $${row.faabSent}`
                    }
                  >
                    {netTrade === 0
                      ? '—'
                      : `${netTrade > 0 ? '+' : '−'}$${Math.abs(netTrade)}`}
                  </td>
                )}
                <td
                  className={`${styles.num} ${row.estRemaining <= 0 ? styles.broke : styles.rich}`}
                  aria-label={
                    row.estRemaining <= 0
                      ? `${row.teamName} has about $${Math.abs(row.estRemaining)} over an assumed $${ASSUMED_FAAB_BUDGET} budget — effectively out of money`
                      : `${row.teamName} has about $${row.estRemaining} remaining of an assumed $${ASSUMED_FAAB_BUDGET} budget`
                  }
                  title={`$${ASSUMED_FAAB_BUDGET} assumed season budget, minus $${row.spent} spent${anyTradeFaab ? `, ${netTrade >= 0 ? '+' : '−'}$${Math.abs(netTrade)} from trades` : ''}`}
                >
                  {row.estRemaining <= 0 ? `$${Math.max(0, row.estRemaining)}` : `$${row.estRemaining}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={styles.note}>
        Remaining assumes the ${ASSUMED_FAAB_BUDGET} season budget (the Yahoo/Sleeper
        default) and synced transactions only — the app doesn't store your
        league's configured budget. FAAB that changed hands in trades is counted
        where the sync reports it.
      </p>
    </section>
  );
}
