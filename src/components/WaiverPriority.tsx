import { useMemo, useState } from 'react';
import type { League } from '@/types';
import { POOL } from '@/data/draftPool';
import { buildWaiverPriority } from '@/utils/waiverPriority';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './WaiverPriority.module.css';

interface WaiverPriorityProps {
  league: League;
}

// Waiver priority queue: the ranked "claim THIS first" list for one team.
// Combines positional need, upcoming bye-week gaps, and player value into a
// single score; FAAB bid ranges price each row where the league has recorded
// bids. Guidance only — nothing is claimed here.
export function WaiverPriority({ league }: WaiverPriorityProps) {
  const myTeam = league.teams.find(t => t.isMyTeam) ?? league.teams[0];
  const [teamId, setTeamId] = useState<string>(myTeam?.id ?? '');
  const team = league.teams.find(t => t.id === teamId) ?? myTeam;

  const queue = useMemo(
    () => (team ? buildWaiverPriority(league, team, POOL, 8) : []),
    [league, team],
  );

  const hasBids = queue.some(t => t.bid !== null);

  return (
    <section className={styles.panel} aria-label="Waiver priority queue">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Waiver Priority Queue</h2>
        <div className={styles.teamPick}>
          <label htmlFor="waiverPriorityTeam" className={styles.teamLabel}>
            Ranking for
          </label>
          <select
            id="waiverPriorityTeam"
            className="input"
            value={team?.id ?? ''}
            onChange={e => setTeamId(e.target.value)}
            title="Rank waiver claims for this team's needs and upcoming bye weeks"
          >
            {league.teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {queue.length === 0 ? (
        <p className={styles.note}>
          No claimable targets right now — the available pool has no
          projected QB/RB/WR/TE outside league rosters.
        </p>
      ) : (
        <div aria-live="polite">
          <table className={styles.table}>
            <caption className="visually-hidden">
              Ranked waiver claims for {team?.name}: rank, player, projection,
              {hasBids ? ' suggested bid, and' : ''} why they rank where they do
            </caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Proj</th>
                {hasBids && <th scope="col">Bid</th>}
                <th scope="col">Why this rank</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((target, i) => (
                <tr key={target.player.id}>
                  <td className={styles.rank}>{i + 1}</td>
                  <td>
                    <PosBadge pos={target.player.pos} />
                    <span className={styles.playerName}> {target.player.name} </span>
                    <NflTeamLabel team={target.player.team} />
                    {target.gapWeeks.length > 0 && (
                      <span className={styles.gapBadge}>
                        Fills Wk {target.gapWeeks.join('/Wk ')} gap
                      </span>
                    )}
                  </td>
                  <td>{(target.player.projPtsPpr ?? 0).toFixed(0)}</td>
                  {hasBids && (
                    <td>
                      {target.bid ? `$${target.bid.low}–$${target.bid.high}` : '—'}
                    </td>
                  )}
                  <td>
                    <ul className={styles.reasons} aria-label={`Why ${target.player.name} ranks ${i + 1}`}>
                      {target.reasons.map((reason, j) => (
                        <li key={j}>{reason}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.footnote}>
        Ranked on value (pool full-PPR projection), your positional need vs
        the league median, and whether the player fills an upcoming bye-week
        gap — priced on this league's rosters and transactions, not expert
        consensus. Guidance only: nothing is claimed or bid here.
      </p>
    </section>
  );
}
