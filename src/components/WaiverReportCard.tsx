import { useMemo } from 'react';
import type { League } from '@/types';
import { attachFaabEfficiency, buildWaiverReportCard } from '@/utils/waiverReportCard';
import { faabBudgets } from '@/utils/faabGuidance';
import styles from './WaiverReportCard.module.css';

interface WaiverReportCardProps {
  league: League;
}

// Waiver Wire Report Card: who is winning the waiver wire this season —
// per-team claims, waiver pickups, summed points-above-replacement, best and
// worst pickup, and a letter grade. When the sync recorded FAAB bids, two
// extra columns show each team's FAAB spend and dollars per PAR point — who
// gets the most production per FAAB dollar. Hidden when the league has no
// wire activity or the sync graded no pickups. Guidance only: nothing here
// moves rosters.
export function WaiverReportCard({ league }: WaiverReportCardProps) {
  const rows = useMemo(() => buildWaiverReportCard(league.teams), [league]);
  const budgets = useMemo(() => faabBudgets(league), [league]);
  const efficiency = useMemo(
    () => (rows && budgets ? attachFaabEfficiency(rows, budgets) : null),
    [rows, budgets],
  );

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
            {efficiency && <th scope="col" className={styles.num}>FAAB $</th>}
            {efficiency && <th scope="col" className={styles.num}>$/pt</th>}
            <th scope="col">Best pickup</th>
            <th scope="col">Worst pickup</th>
            <th scope="col" className={styles.num}>Grade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const eff = efficiency?.get(row.teamId);
            return (
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
                {efficiency && eff && (
                  <td
                    className={styles.num}
                    aria-label={`${row.teamName} spent $${eff.spent} of FAAB on waiver claims`}
                    title="FAAB dollars spent on waiver and free-agent claims"
                  >
                    ${eff.spent}
                  </td>
                )}
                {efficiency && eff && (
                  <td
                    className={styles.num}
                    aria-label={
                      eff.freeProduction
                        ? `${row.teamName} produced ${row.totalPar} points above replacement without spending FAAB`
                        : eff.dollarsPerPoint !== null
                          ? `${row.teamName} paid $${eff.dollarsPerPoint} of FAAB per point above replacement`
                          : `${row.teamName} spent $${eff.spent} of FAAB with no points above replacement to show for it`
                    }
                    title="FAAB dollars spent per point above replacement"
                  >
                    {eff.freeProduction
                      ? 'Free'
                      : eff.dollarsPerPoint !== null
                        ? `$${eff.dollarsPerPoint}`
                        : '—'}
                  </td>
                )}
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
            );
          })}
        </tbody>
      </table>
      <p className={styles.note}>
        Points above replacement (PAR) comes from the owner&apos;s last sync —
        how each pickup has scored since joining the team versus a replacement-
        level player. Grades are relative to this league only.
        {efficiency &&
          ' FAAB $ and $/pt come from the league\u2019s recorded winning bids: $/pt is FAAB spent per point above replacement (Free means positive PAR from $0 claims only).'}
      </p>
    </section>
  );
}
