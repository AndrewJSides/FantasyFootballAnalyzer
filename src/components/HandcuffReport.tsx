import { useState } from 'react';
import type { League, Player } from '@/types';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import { buildHandcuffReport, type HandcuffStatus } from '@/utils/handcuffReport';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './HandcuffReport.module.css';

interface HandcuffReportProps {
  league: League;
  /** Test override: a synthetic pool replaces the bundled one. */
  pool?: DraftPoolFile;
}

// League mode: pool player id -> owning fantasy team name, resolved against
// the bundled pool (mirrors the Trade Finder page's leagueRosterMaps).
function leagueOwners(league: League, pool: DraftPoolFile): Map<string, string> {
  const index = indexPool(pool);
  const owners = new Map<string, string>();
  for (const team of league.teams) {
    for (const p of team.roster ?? []) {
      const resolved = resolvePoolPlayer(p as Player, index);
      if (resolved) owners.set(resolved.id, team.name);
    }
  }
  return owners;
}

function statusText(status: HandcuffStatus, handcuffOwner: string | null): string {
  switch (status) {
    case 'secured':
      return 'Secured — handcuff sits on the lead back\u2019s team';
    case 'available':
      return 'Available on waivers';
    case 'rival-held':
      return handcuffOwner ? `Held by ${handcuffOwner}` : 'Held by another team';
    case 'unknown':
      return 'Ownership unknown (guest mode)';
  }
}

function statusClass(status: HandcuffStatus): string {
  switch (status) {
    case 'secured':
      return styles.statusSecured;
    case 'available':
      return styles.statusAvailable;
    case 'rival-held':
      return styles.statusRival;
    case 'unknown':
      return styles.statusUnknown;
  }
}

// RB Handcuff Report: every NFL backfield's lead back and the direct backup
// who inherits the job if he misses time, with league ownership resolved —
// the league-wide answer to "which handcuffs are worth stashing". Priced on
// TraderApe's own Sleeper full-PPR season projections. Guidance only: nothing
// here moves a roster.
export function HandcuffReport({ league, pool: poolOverride }: HandcuffReportProps) {
  const [pool] = useState(() => poolOverride ?? POOL);
  const [owners] = useState(() => leagueOwners(league, pool));
  const hasRosters = owners.size > 0;
  const rows = buildHandcuffReport({ pool, ownerByPoolId: owners });

  return (
    <section className={styles.panel} aria-label="R B handcuff report">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>RB Handcuff Report</h2>
        <span className={styles.window}>
          Lead-back insurance · {pool.season} season
        </span>
      </div>

      {rows.length === 0 ? (
        <p className={styles.note}>
          No handcuff pairs found in the bundled pool.
        </p>
      ) : (
        <table className={styles.table}>
          <caption className="visually-hidden">
            Every NFL team&apos;s lead running back and direct backup, with
            ownership and the backup&apos;s projected full-PPR points
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Rank</span>
              </th>
              <th scope="col">Team</th>
              <th scope="col">Lead back</th>
              <th scope="col">Handcuff</th>
              <th scope="col">
                <abbr title="Sleeper season-long projected full-PPR points for the handcuff">
                  Cuff proj
                </abbr>
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.nflTeam}>
                <td className={styles.rank}>{i + 1}</td>
                <td>
                  <NflTeamLabel team={row.nflTeam} size="xs" />
                </td>
                <th scope="row" className={styles.playerCell}>
                  {row.lead.name}
                  {hasRosters && row.leadOwner && (
                    <span className={styles.owner}>{row.leadOwner}</span>
                  )}
                </th>
                <td className={styles.playerCell}>
                  {row.handcuff.name}
                  {hasRosters && row.handcuffOwner && (
                    <span className={styles.owner}>{row.handcuffOwner}</span>
                  )}
                </td>
                <td className={styles.nums}>
                  {row.handcuff.projPtsPpr != null
                    ? Math.round(row.handcuff.projPtsPpr)
                    : '—'}
                </td>
                <td className={styles.statusCell}>
                  <span className={statusClass(row.status)}>
                    {statusText(row.status, row.handcuffOwner)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className={styles.footnote}>
        Lead backs and handcuffs from Sleeper depth-chart order in the bundled
        pool (positional-rank fallback). Ownership resolves from the last
        /admin sync. Waiver research only — nothing here moves a roster.
      </p>
    </section>
  );
}
