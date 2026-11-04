import { useCallback, useEffect, useState } from 'react';
import type { League } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { fetchTrendingAdds } from '@/api/sleeperTrending';
import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';
import { trendingTargets, type TrendingTarget } from '@/utils/trendingAdds';
import {
  currentWeekEstimate,
  getMatchupRating,
  matchupLabel,
  matchupShort,
} from '@/utils/matchupRating';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './TrendingAdds.module.css';

interface TrendingAddsProps {
  league: League;
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; targets: TrendingTarget[] };

// Item-134 Sleeper projection cell: Sleeper's own week-N projection next to
// TraderApe's pool projection, so a momentum add can be checked against the
// market number for THIS week (the pool projection is a season number). A
// pending or failed fetch just leaves dashes — the table never waits on it.
function SleeperCell({
  player,
  projections,
  ready,
  week,
}: {
  player: TrendingTarget['player'];
  projections: Record<string, number> | undefined;
  ready: boolean;
  week: number;
}) {
  const sid = player.sleeperId;
  const value = ready && sid ? projections?.[sid] : undefined;
  if (value === undefined) {
    return (
      <td
        aria-label={
          ready
            ? 'No Sleeper projection for this player'
            : 'Sleeper projection not loaded'
        }
      >
        <span className={styles.dash}>—</span>
      </td>
    );
  }
  const label = `Sleeper projection ${value.toFixed(1)} for week ${week}`;
  return (
    <td title={label} aria-label={label}>
      {value.toFixed(1)}
    </td>
  );
}

// Trending Adds: the players Sleeper leagues are adding the most in the
// last 24h, filtered to players actually available in this league and
// priced with TraderApe's own numbers (pool projection + matchup rating).
// Sleeper's trending endpoint is league-wide momentum, not a recommendation
// — the row shows TraderApe's read alongside it. Nothing here adds a player;
// it's waiver-wire research.
export function TrendingAdds({ league, pool = POOL }: TrendingAddsProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [week] = useState(() => currentWeekEstimate());

  // Sleeper projection column (backlog item 134): one no-auth request
  // shared across the rows; silent degrade to dashes on failure.
  const season = league.season ?? pool.season;
  const [sleeperProjections, setSleeperProjections] = useState<
    Record<string, number> | undefined
  >(undefined);
  const [sleeperReady, setSleeperReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchSleeperWeekProjections(season, week)
      .then(data => {
        if (!cancelled) {
          setSleeperProjections(data);
          setSleeperReady(true);
        }
      })
      .catch(() => {
        // Silent degrade: dashes, the table still ranks on add count.
      });
    return () => {
      cancelled = true;
    };
  }, [season, week]);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const trending = await fetchTrendingAdds(24, 25);
      setState({ kind: 'ready', targets: trendingTargets(league, pool, trending, 10) });
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
    <section className={styles.panel} aria-label="Trending adds">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Trending Adds</h2>
        <span className={styles.window}>Most-added across Sleeper leagues · last 24h</span>
      </div>

      {/* The list swaps in place on load/retry with no navigation; announce
          the change politely. */}
      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading trending adds…</p>
        )}

        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load trending adds ({state.message}). The waiver table
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
                Most-added players in the last 24 hours who are available in
                this league, with TraderApe's projection, Sleeper's week
                projection, and matchup rating
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Rank</span>
                  </th>
                  <th scope="col">Player</th>
                  <th scope="col">
                    <abbr title="Adds across Sleeper leagues in the last 24 hours">
                      Adds
                    </abbr>
                  </th>
                  <th scope="col">
                    <abbr title="Bundled-pool full-PPR season projection (preseason)">
                      Proj
                    </abbr>
                  </th>
                  <th scope="col">
                    <abbr title={`Sleeper's projected fantasy points for week ${week}`}>
                      Sleeper
                    </abbr>
                  </th>
                  <th scope="col">Matchup</th>
                </tr>
              </thead>
              <tbody>
                {state.targets.map(({ player, adds }, i) => {
                  const rating = getMatchupRating(player.team, player.pos, week);
                  const muCls =
                    rating?.label === 'favorable'
                      ? styles.muFav
                      : rating?.label === 'tough'
                        ? styles.muTough
                        : styles.muNeutral;
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
                        {adds.toLocaleString()}
                      </td>
                      <td>{player.projPtsPpr}</td>
                      <SleeperCell
                        player={player}
                        projections={sleeperProjections}
                        ready={sleeperReady}
                        week={week}
                      />
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
              None of the most-added players in the last 24 hours are
              available in this league — they're all already rostered here.
            </p>
          ))}
      </div>

      <p className={styles.footnote}>
        League-wide adds are momentum, not a recommendation — compare the add
        count against TraderApe's projection and matchup before spending FAAB.
        The Sleeper column shows Sleeper&apos;s own week {week} projection
        where published; a dash means no Sleeper line for that player.
      </p>
    </section>
  );
}
