import { useMemo } from 'react';
import type { League } from '@/types';
import { buildWaiverReportCard } from '@/utils/waiverReportCard';
import styles from './WaiverReportCard.module.css';

interface WaiverReportCardProps {
  league: League;
}

// Waiver Wire Report Card: who is winning the waiver wire this season —
// per-team claims, waiver pickups, summed points-above-replacement, best and
// worst pickup, and a letter grade. Hidden when the league has no wire
// activity or the sync graded no pickups. Guidance only: nothing here moves
// rosters.
export function WaiverReportCard({ league }: WaiverReportCardProps) {
  const rows = useMemo(() => buildWaiverReportCard(league.teams), [league]);

  if (!rows) return null;

  return (
    <section className={styles.panel} aria-label="Waiver report card">
      <h2 className={styles.heading}>Waiver Report Card</h2>
      <table className={styles.table} aria-label="Waiver wire report card, best grade first">
        <thead>
          <tr>
            <th scope="col">Team</th>
            <th scope="col" className={styles.num}>Claims</th>
            <th scope="col" className={styles.num}>Pickups</th>
            <th scope="col" className={styles.num}>Waiver PAR</th>
            <th scope="col">Best pickup</th>
            <th scope="col">Worst pickup</th>
            <th scope="col" className={styles.num}>Grade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.teamId}>
              <th scope="row" className={styles.team}>{row.teamName}</th>
              <td className={styles.num}>{row.claims}</td>
              <td className={styles.num}>{row.pickups}</td>
              <td
                className={`${styles.num} ${row.totalPar >= 0 ? styles.positive : styles.negative}`}
                aria-label={`${row.teamName}'s waiver pickups are worth ${row.totalPar} points above replacement`}
                title="Summed points above replacement across graded pickups"
              >
                {row.totalPar >= 0 ? `+${row.totalPar}` : row.totalPar}
              </td>
              <td
                aria-label={row.bestPickup ? `${row.bestPickup.name}, ${row.bestPickup.par} points above replacement` : 'No graded pickups'}
              >
                {row.bestPickup ? `${row.bestPickup.name} (+${row.bestPickup.par})` : '—'}
              </td>
              <td
                aria-label={row.worstPickup ? `${row.worstPickup.name}, ${row.worstPickup.par} points above replacement` : 'No graded pickups'}
              >
                {row.worstPickup ? `${row.worstPickup.name} (${row.worstPickup.par})` : '—'}
              </td>
              <td
                className={styles.num}
                aria-label={`${row.teamName} waiver grade ${row.grade}`}
                title="Graded against this league's waiver totals"
              >
                {row.grade}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.note}>
        Points above replacement (PAR) comes from the owner&apos;s last sync —
        how each pickup has scored since joining the team versus a replacement-
        level player. Grades are relative to this league only.
      </p>
    </section>
  );
}
