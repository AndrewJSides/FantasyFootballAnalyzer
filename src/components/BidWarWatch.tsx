import { useMemo } from 'react';
import type { League, Team } from '@/types';
import { buildBidWarWatch, type BidWarVerdict } from '@/utils/bidWarWatch';
import type { WaiverPriorityTarget } from '@/utils/waiverPriority';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './BidWarWatch.module.css';

interface BidWarWatchProps {
  league: League;
  team: Team;
  targets: WaiverPriorityTarget[];
}

const VERDICT_LABEL: Record<BidWarVerdict, string> = {
  hot: 'Bid war',
  warm: '1 rival',
  clear: 'Clear',
};

const VERDICT_DETAIL: Record<BidWarVerdict, string> = {
  hot: 'Two or more rivals need this position and can bid — bid with conviction',
  warm: 'One rival needs this position and can bid — do not bid the minimum',
  clear: 'No rival needs this position — a light bid should land him',
};

// Bid War Watch: who else wants your waiver target. For each of the Waiver
// Priority queue's top targets, name the rival teams with a positional need
// plus each rival's estimated remaining FAAB, with a contested/clear read
// that nudges the bid band. Guidance only — nothing is claimed or bid here.
// Rendered inside the Waiver Priority section's aria-live region so it
// re-ranks in place on team change.
export function BidWarWatch({ league, team, targets }: BidWarWatchProps) {
  const rows = useMemo(
    () => buildBidWarWatch(league, team, targets),
    [league, team, targets],
  );

  if (rows.length === 0) return null;

  return (
    <section className={styles.block} aria-label="Bid war watch">
      <h3 className={styles.subheading}>Bid War Watch</h3>
      <table className={styles.table}>
        <caption className="visually-hidden">
          For each top waiver target: the rival teams with a positional need,
          their estimated remaining FAAB, and the bidding read
        </caption>
        <thead>
          <tr>
            <th scope="col">Target</th>
            <th scope="col">Rival demand</th>
            <th scope="col">Read</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.player.id}>
              <td>
                <PosBadge pos={row.player.pos} />
                <span className={styles.playerName}> {row.player.name} </span>
                <NflTeamLabel team={row.player.team} />
              </td>
              <td>
                {row.rivals.length === 0 ? (
                  <span className={styles.dim}>No rival needs a {row.player.pos}</span>
                ) : (
                  <ul
                    className={styles.rivals}
                    aria-label={`Rivals needing a ${row.player.pos}: ${row.rivals
                      .map(
                        r =>
                          `${r.teamName}${
                            r.estRemaining === null
                              ? ''
                              : r.canBid
                                ? `, $${r.estRemaining} left`
                                : ', out of FAAB'
                          }`,
                      )
                      .join('; ')}`}
                  >
                    {row.rivals.map(r => (
                      <li key={r.teamId} className={r.canBid ? undefined : styles.broke}>
                        {r.teamName}
                        {r.estRemaining === null ? null : r.canBid ? (
                          <span className={styles.budget}> (${r.estRemaining} left)</span>
                        ) : (
                          <span className={styles.broke}> — out of FAAB</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td>
                <span
                  className={`${styles.verdict} ${styles[row.verdict]}`}
                  title={VERDICT_DETAIL[row.verdict]}
                >
                  {VERDICT_LABEL[row.verdict]}
                </span>
                <ul className={styles.advice} aria-label={`Bidding read for ${row.player.name}`}>
                  {row.advice.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.footnote}>
        Rival demand is priced on each team's positional need vs the league
        median plus this league's recorded FAAB bids — it names who can
        outbid you, not who will. Guidance only: nothing is claimed or bid
        here.
      </p>
    </section>
  );
}
