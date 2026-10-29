import { useState } from 'react';
import type { League, Player } from '@/types';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import { buildInjuryReport, type InjurySeverityTier } from '@/utils/injuryReport';
import { injuryAbbrev, injuryTitle } from '@/utils/injury';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './InjuryReport.module.css';

interface InjuryReportProps {
  league: League;
  /** Test override: a synthetic pool replaces the bundled one. */
  pool?: DraftPoolFile;
}

/** Show at most 40 rows — worst first — so the report stays scannable. */
const MAX_ROWS = 40;

// League mode: pool player id -> owning fantasy team name, resolved against
// the bundled pool (mirrors the HandcuffReport leagueOwners).
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

function tierClass(tier: InjurySeverityTier): string {
  switch (tier) {
    case 'season-ending':
      return styles.tierSeasonEnding;
    case 'out':
      return styles.tierOut;
    case 'doubtful':
      return styles.tierDoubtful;
    case 'questionable':
      return styles.tierQuestionable;
    default:
      return styles.tierOther;
  }
}

// League Injury Report: every startable QB/RB/WR/TE with a current Sleeper
// injury designation, worst first, with league ownership resolved — the
// league-wide answer to "who is hurt and who owns them". Priced on
// TraderApe's own bundled pool data; waiver research only, nothing here
// moves a roster.
export function InjuryReport({ league, pool: poolOverride }: InjuryReportProps) {
  const [pool] = useState(() => poolOverride ?? POOL);
  const [owners] = useState(() => leagueOwners(league, pool));
  const hasRosters = owners.size > 0;
  const rows = buildInjuryReport({ pool, ownerByPoolId: owners }).slice(0, MAX_ROWS);

  return (
    <section className={styles.panel} aria-label="League injury report">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Injury Report</h2>
        <span className={styles.window}>
          Sleeper designations · {pool.season} season
        </span>
      </div>

      {rows.length === 0 ? (
        <p className={styles.note}>
          No injured players in the bundled pool.
        </p>
      ) : (
        <table className={styles.table}>
          <caption className="visually-hidden">
            Injured players sorted by severity, with injury detail and the
            fantasy team that owns each one
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Rank</span>
              </th>
              <th scope="col">Player</th>
              <th scope="col">NFL</th>
              <th scope="col">Pos</th>
              <th scope="col">Status</th>
              <th scope="col">Detail</th>
              <th scope="col">Owner</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.player.id}>
                <td className={styles.rank}>{i + 1}</td>
                <th scope="row" className={styles.playerCell}>
                  {row.player.name}
                </th>
                <td>
                  <NflTeamLabel team={row.player.team} size="xs" />
                </td>
                <td className={styles.pos}>{row.player.pos}</td>
                <td className={styles.statusCell}>
                  <span
                    className={tierClass(row.tier)}
                    title={injuryTitle(row.player)}
                    aria-label={`${row.player.name}: ${injuryTitle(row.player)}`}
                  >
                    {injuryAbbrev(row.player.injuryStatus ?? '')}
                  </span>
                </td>
                <td className={styles.detail}>{row.detail || '—'}</td>
                <td className={styles.ownerCell}>
                  {hasRosters ? row.owner ?? 'Free agent' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className={styles.footnote}>
        Designations from Sleeper&apos;s injury data in the bundled pool,
        refreshed twice daily. Ownership resolves from the last /admin sync.
        Waiver research only — nothing here moves a roster.
      </p>
    </section>
  );
}
