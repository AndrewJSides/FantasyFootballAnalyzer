import { useCallback, useEffect, useState } from 'react';
import type { League } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { fetchNflNews, type NflNewsItem } from '@/api/espnNews';
import {
  newsWaiverTargets,
  type NewsWaiverTarget,
} from '@/utils/newsWaiverTargets';
import {
  currentWeekEstimate,
  getMatchupRating,
  matchupLabel,
  matchupShort,
} from '@/utils/matchupRating';
import { timeAgo } from '@/utils/relativeTime';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './NewsWaiverTargets.module.css';

interface NewsWaiverTargetsProps {
  league: League;
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; targets: NewsWaiverTarget[] };

// In the News: available players tagged in the latest ESPN headlines —
// the news signal the waiver wire was missing. A backup named starter or
// a star's injury first surfaces as a headline, and the add window closes
// fast. Nothing here adds a player; it's waiver-wire research.
export function NewsWaiverTargets({
  league,
  pool = POOL,
}: NewsWaiverTargetsProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [week] = useState(() => currentWeekEstimate());

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const items: NflNewsItem[] = await fetchNflNews(30);
      setState({ kind: 'ready', targets: newsWaiverTargets(league, items, pool, 8) });
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
    <section className={styles.panel} aria-label="In the news">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>In the News</h2>
        <span className={styles.window}>
          Latest ESPN headlines · available players
        </span>
      </div>

      {/* The list swaps in place on load/retry with no navigation; announce
          the change politely. */}
      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading the latest headlines…</p>
        )}

        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load the latest headlines ({state.message}). The
              waiver sections below are unaffected.
            </p>
            <button
              type="button"
              className="input"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        )}

        {state.kind === 'ready' &&
          (state.targets.length > 0 ? (
            <table className={styles.table}>
              <caption className="visually-hidden">
                Available players tagged in the latest NFL headlines, with
                TraderApe's projection and this week's matchup rating
              </caption>
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">Headline</th>
                  <th scope="col">
                    <abbr title="Bundled-pool full-PPR season projection (preseason)">
                      Proj
                    </abbr>
                  </th>
                  <th scope="col">Matchup</th>
                </tr>
              </thead>
              <tbody>
                {state.targets.map(
                  ({ player, headline, url, published }) => {
                    const rating = getMatchupRating(
                      player.team,
                      player.pos,
                      week,
                    );
                    const muCls =
                      rating?.label === 'favorable'
                        ? styles.muFav
                        : rating?.label === 'tough'
                          ? styles.muTough
                          : styles.muNeutral;
                    return (
                      <tr key={player.id}>
                        <th scope="row" className={styles.playerCell}>
                          <span className={styles.playerName}>
                            {player.name}
                          </span>
                          <span className={styles.playerMeta}>
                            <PosBadge pos={player.pos} />{' '}
                            <NflTeamLabel team={player.team} />
                          </span>
                        </th>
                        <td>
                          <a
                            className={styles.headline}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {headline}
                          </a>
                          <span className={styles.headlineTime}>
                            {timeAgo(published)}
                          </span>
                        </td>
                        <td className={styles.proj}>{player.projPtsPpr}</td>
                        <td>
                          {rating ? (
                            <span
                              className={muCls}
                              title={matchupLabel(rating, player.pos)}
                            >
                              {matchupShort(rating)}
                            </span>
                          ) : (
                            <span
                              className={styles.dash}
                              aria-label="No matchup rating available"
                            >
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          ) : (
            <p className={styles.note}>
              None of the players in the latest headlines are available in
              this league — they're all already rostered here.
            </p>
          ))}
      </div>

      <p className={styles.footnote}>
        Headlines are news, not recommendations — compare TraderApe's
        projection and matchup before spending FAAB.
      </p>
    </section>
  );
}
