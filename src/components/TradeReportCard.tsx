import { useMemo } from 'react';
import type { League } from '@/types';
import { buildTradeReportCard } from '@/utils/tradeReportCard';
import styles from './TradeReportCard.module.css';

interface TradeReportCardProps {
  league: League;
}

// Season Trade Report Card: who is winning the trade market — per-team
// trades made, trade W-L record, summed net points-above-replacement,
// best and worst deal, and a letter grade. Hidden when the league has no
// completed trades. Guidance only: nothing here moves rosters.
export function TradeReportCard({ league }: TradeReportCardProps) {
  const rows = useMemo(
    () => buildTradeReportCard(league.trades, league.teams),
    [league],
  );

  if (!rows) return null;

  const fmtPar = (par: number) =>
    par >= 0 ? `+${par}` : `${par}`;

  return (
    <section className={styles.panel} aria-label="Season trade report card">
      <h2 className={styles.heading}>Season Trade Report Card</h2>
      <table className={styles.table} aria-label="Season trade report card, best grade first">
        <thead>
          <tr>
            <th scope="col">Team</th>
            <th scope="col" className={styles.num}>Trades</th>
            <th scope="col">W-L-F</th>
            <th scope="col" className={styles.num}>Trade PAR</th>
            <th scope="col">Best trade</th>
            <th scope="col">Worst trade</th>
            <th scope="col" className={styles.num}>Grade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.teamId}>
              <th scope="row" className={styles.team}>{row.teamName}</th>
              <td className={styles.num}>{row.trades}</td>
              <td
                aria-label={`${row.teamName} won ${row.wins}, lost ${row.losses}, and drew ${row.fair} trades`}
              >
                {row.wins}-{row.losses}-{row.fair}
              </td>
              <td
                className={`${styles.num} ${row.totalNetPar >= 0 ? styles.positive : styles.negative}`}
                aria-label={`${row.teamName}'s trades are worth ${fmtPar(row.totalNetPar)} points above replacement in total`}
                title="Summed net points above replacement across completed trades"
              >
                {fmtPar(row.totalNetPar)}
              </td>
              <td
                aria-label={row.bestTrade ? `Best trade: ${row.bestTrade.label}, ${fmtPar(row.bestTrade.netPar)} points above replacement` : 'No trades'}
              >
                {row.bestTrade ? `${row.bestTrade.label} (${fmtPar(row.bestTrade.netPar)})` : '—'}
              </td>
              <td
                aria-label={row.worstTrade ? `Worst trade: ${row.worstTrade.label}, ${fmtPar(row.worstTrade.netPar)} points above replacement` : 'No trades'}
              >
                {row.worstTrade ? `${row.worstTrade.label} (${fmtPar(row.worstTrade.netPar)})` : '—'}
              </td>
              <td
                className={styles.num}
                aria-label={`${row.teamName} trade grade ${row.grade}`}
                title="Graded against this league's trade totals"
              >
                {row.grade}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.note}>
        Net points above replacement (PAR) per completed trade comes from the
        owner&apos;s last sync. Grades are relative to this league only.
        Trades that moved draft picks or FAAB dollars can&apos;t be fully
        valued — PAR covers the players.
      </p>
    </section>
  );
}
