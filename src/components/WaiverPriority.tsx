import { useEffect, useMemo, useState } from 'react';
import type { League } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';
import { currentWeekEstimate } from '@/utils/matchupRating';
import { buildWaiverPriority } from '@/utils/waiverPriority';
import { BidWarWatch } from './BidWarWatch';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './WaiverPriority.module.css';

interface WaiverPriorityProps {
  league: League;
}

// Item-144 Sleeper projection cell: Sleeper's own week-N projection next to
// TraderApe's, so the FAAB spend call can be checked against the market
// number. A pending or failed fetch just leaves dashes — the queue never
// waits on it.
function SleeperCell({
  player,
  projections,
  ready,
  week,
}: {
  player: PoolPlayer;
  projections: Record<string, number> | undefined;
  ready: boolean;
  week: number;
}) {
  const sid = player.sleeperId;
  const value = ready && sid ? projections?.[sid] : undefined;
  if (value === undefined) {
    return (
      <td
        className={`${styles.num} ${styles.dim}`}
        aria-label={
          ready
            ? 'No Sleeper projection for this player'
            : 'Sleeper projection not loaded'
        }
      >
        —
      </td>
    );
  }
  const label = `Sleeper projection ${value.toFixed(1)} for week ${week}`;
  return (
    <td className={styles.num} title={label} aria-label={label}>
      {value.toFixed(1)}
    </td>
  );
}

// Waiver priority queue: the ranked "claim THIS first" list for one team.
// Combines positional need, upcoming bye-week gaps, and player value into a
// single score; FAAB bid ranges price each row where the league has recorded
// bids. Guidance only — nothing is claimed here.
export function WaiverPriority({ league }: WaiverPriorityProps) {
  const myTeam = league.teams.find(t => t.isMyTeam) ?? league.teams[0];
  const [teamId, setTeamId] = useState<string>(myTeam?.id ?? '');
  const team = league.teams.find(t => t.id === teamId) ?? myTeam;
  const week = league.currentWeek ?? currentWeekEstimate();

  // Sleeper projection column (backlog item 144): one no-auth request
  // shared across the queue rows; silent degrade to dashes on failure.
  const [sleeperProjections, setSleeperProjections] = useState<
    Record<string, number> | undefined
  >(undefined);
  const [sleeperReady, setSleeperReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchSleeperWeekProjections(league.season, week)
      .then(data => {
        if (!cancelled) {
          setSleeperProjections(data);
          setSleeperReady(true);
        }
      })
      .catch(() => {
        // Silent degrade: dashes, the queue still ranks on its own number.
      });
    return () => {
      cancelled = true;
    };
  }, [league.season, week]);

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
              Sleeper projection,
              {hasBids ? ' suggested bid, and' : ''} why they rank where they do
            </caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Proj</th>
                <th scope="col" className={styles.num}>
                  <abbr title={`Sleeper's projected fantasy points for week ${week}`}>Sleeper</abbr>
                </th>
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
                  <SleeperCell
                    player={target.player}
                    projections={sleeperProjections}
                    ready={sleeperReady}
                    week={week}
                  />
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
          {team && <BidWarWatch league={league} team={team} targets={queue} />}
        </div>
      )}

      <p className={styles.footnote}>
        Ranked on value (pool full-PPR projection), your positional need vs
        the league median, and whether the player fills an upcoming bye-week
        gap — priced on this league's rosters and transactions, not expert
        consensus. The Sleeper column shows Sleeper&apos;s own week {week}{' '}
        projection where published; a dash means no Sleeper line for that
        player, and the ranking counts TraderApe rows only. Guidance only:
        nothing is claimed or bid here.
      </p>
    </section>
  );
}
