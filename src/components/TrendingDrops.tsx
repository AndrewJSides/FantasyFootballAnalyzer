import { useCallback, useEffect, useState } from 'react';
import type { League } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { fetchTrendingDrops } from '@/api/sleeperTrending';
import {
  trendingDropTargets,
  MAX_TRENDING_DROPS,
  type TrendingDropTarget,
} from '@/utils/trendingDrops';
import {
  currentWeekEstimate,
  getMatchupRating,
  matchupLabel,
  matchupShort,
} from '@/utils/matchupRating';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './TrendingDrops.module.css';

interface TrendingDropsProps {
  league: League;
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; targets: TrendingDropTarget[] };

// Trending Drops: the players Sleeper leagues are cutting the most in the
// last 24h, joined against the loaded league so each row names the owner
// (or "Free agent") and priced with TraderApe's own numbers (pool
// projection + matchup rating). Rows on the manager's own roster are the
// "should I cut him too?" question; free agents are the "did the market
// overreact?" question. League-wide drops are momentum, not a
// recommendation — the row shows TraderApe's read alongside it. Nothing
// here drops a player; it's waiver-wire research.
export function TrendingDrops({ league, pool = POOL }: TrendingDropsProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [week] = useState(() => currentWeekEstimate());

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const trending = await fetchTrendingDrops(24, 25);
      setState({
        kind: 'ready',
        targets: trendingDropTargets(league, pool, trending, MAX_TRENDING_DROPS),
      });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }, [league, pool]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.panel} aria-label="Trending drops">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Trending Drops</h2>
        <span className={styles.window}>Most-dropped across Sleeper leagues · last 24h</span>
      </div>

      {/* The list swaps in place on load/retry with no navigation; announce
          the change politely. */}
      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading trending drops…</p>
        )}

        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load trending drops ({state.message}). The waiver table
              below is unaffected.
            </p>
            <button type="button" className="input" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {state.kind === 'ready' &&
          (state.targets.length > 0 ? (
            <table className={styles.table}>
              <caption className="visually-hidden">
                Most-dropped players in the last 24 hours, with league
                ownership, TraderApe's projection and matchup rating
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Rank</span>
                  </th>
                  <th scope="col">Player</th>
                  <th scope="col">
                    <abbr title="Drops across Sleeper leagues in the last 24 hours">
                      Drops
                    </abbr>
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <abbr title="Bundled-pool full-PPR season projection (preseason)">
                      Proj
                    </abbr>
                  </th>
                  <th scope="col">Matchup</th>
                </tr>
              </thead>
              <tbody>
                {state.targets.map(({ player, drops, owner, isMine }, i) => {
                  const rating = getMatchupRating(player.team, player.pos, week);
                  const muCls =
                    rating?.label === 'favorable'
                      ? styles.muFav
                      : rating?.label === 'tough'
                        ? styles.muTough
                        : styles.muNeutral;
                  const status = owner ?? 'Free agent';
                  return (
                    <tr key={player.id}>
                      <td className={styles.rank}>{i + 1}</td>
                      <th scope="row" className={styles.playerCell}>
                        <span className={styles.playerName}>{player.name}</span>
                        <span className={styles.playerMeta}>
                          <PosBadge pos={player.pos} />{' '}
                          <NflTeamLabel team={player.team} />
                        </span>
                      </th>
                      <td className={styles.adds}>
                        {drops.toLocaleString()}
                      </td>
                      <td>
                        {status}
                        {isMine && (
                          <span
                            className={styles.mineBadge}
                            title="This player is on your roster — the market is cutting him"
                          >
                            {' '}
                            · cut candidate
                          </span>
                        )}
                      </td>
                      <td>{player.projPtsPpr}</td>
                      <td>
                        {rating ? (
                          <span
                            className={muCls}
                            title={matchupLabel(rating, player.pos)}
                          >
                            {matchupShort(rating)}
                          </span>
                        ) : (
                          <span className={styles.dash} aria-label="No matchup rating available">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className={styles.note}>
              None of the most-dropped players in the last 24 hours are in
              the pool — check back after the next sync.
            </p>
          ))}
      </div>

      <p className={styles.footnote}>
        League-wide drops are momentum, not a recommendation — a cut that
        makes sense in shallow Sleeper leagues may be a buy-low stash here.
        Compare the drop count against TraderApe's projection and matchup.
      </p>
    </section>
  );
}
