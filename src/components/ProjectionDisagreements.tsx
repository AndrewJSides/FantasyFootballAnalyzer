import { useCallback, useEffect, useState } from 'react';
import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';
import {
  buildProjectionDisagreements,
  type ProjectionDisagreement,
  type ProjectionDisagreements,
} from '@/utils/projectionDisagreements';
import type { WeeklyRankRow } from '@/utils/weeklyRankings';
import { PosBadge } from './PosBadge';
import styles from './ProjectionDisagreements.module.css';

interface ProjectionDisagreementsProps {
  /** This week's board rows (TraderApe projections). */
  rows: WeeklyRankRow[];
  season: number;
  week: number;
  /**
   * Item-122 shared fetch: when the parent page already holds Sleeper's
   * projections (it renders them in the board's Sleeper column), pass them
   * here instead of fetching a second copy. Passing sleeperProjectionsLoading
   * opts into shared mode entirely: ready data renders the tables, a failed
   * load renders the error state with the parent's retry, and loading
   * renders the loading note. With none of these props the component keeps
   * its original self-fetch behavior.
   */
  sleeperProjections?: Record<string, number>;
  sleeperProjectionsLoading?: boolean;
  sleeperProjectionsFailed?: boolean;
  onRetrySleeperProjections?: () => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: ProjectionDisagreements };

// Where TraderApe's weekly model bets against Sleeper's weekly
// projections (backlog item 121): the board's boldest calls in both
// directions. A big bullish gap is a start/sit tiebreak; a big bearish
// gap is a fade warning. Nothing here moves a roster — it's the model's
// edge made inspectable.
export function ProjectionDisagreements({
  rows,
  season,
  week,
  sleeperProjections,
  sleeperProjectionsLoading,
  sleeperProjectionsFailed,
  onRetrySleeperProjections,
}: ProjectionDisagreementsProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const sleeper = await fetchSleeperWeekProjections(season, week);
      setState({ kind: 'ready', data: buildProjectionDisagreements(rows, sleeper) });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }, [rows, season, week]);

  // Shared mode is signaled by the loading prop alone; the self-fetch
  // effect below stays dormant so the page's single request serves both
  // the board column and this section.
  const sharedMode = sleeperProjectionsLoading !== undefined;

  useEffect(() => {
    if (!sharedMode) void load();
  }, [load, sharedMode]);

  // In shared mode the display state derives from the parent's fetch, so
  // the tables re-price the moment the parent's data lands (and the
  // parent's retry re-runs them) with no second request.
  const displayState: LoadState = sharedMode
    ? sleeperProjectionsLoading
      ? { kind: 'loading' }
      : sleeperProjectionsFailed
        ? { kind: 'error', message: 'Sleeper projections request failed' }
        : sleeperProjections
          ? { kind: 'ready', data: buildProjectionDisagreements(rows, sleeperProjections) }
          : { kind: 'loading' }
    : state;

  const retry = sharedMode && onRetrySleeperProjections ? onRetrySleeperProjections : load;

  return (
    <section className={styles.panel} aria-label={`Where TraderApe disagrees with Sleeper for week ${week}`}>
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Where We Disagree</h2>
        <span className={styles.window}>
          TraderApe week {week} projection vs Sleeper&apos;s week {week} projection
        </span>
      </div>

      {/* The tables swap in place on load/retry with no navigation; announce
          the change politely. */}
      <div aria-live="polite">
        {displayState.kind === 'loading' && (
          <p className={styles.note}>Loading Sleeper&apos;s week {week} projections…</p>
        )}

        {displayState.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn&apos;t load Sleeper&apos;s projections ({displayState.message}).
              The rankings board above is unaffected.
            </p>
            <button type="button" className="input" onClick={() => void retry()}>
              Retry
            </button>
          </div>
        )}

        {displayState.kind === 'ready' &&
          (displayState.data.bullish.length > 0 || displayState.data.bearish.length > 0 ? (
            <div className={styles.tables}>
              <DisagreementTable
                title="TraderApe higher"
                caption={`Players TraderApe's week ${week} projection rates above Sleeper's, largest gap first`}
                rows={displayState.data.bullish}
                week={week}
              />
              <DisagreementTable
                title="TraderApe lower"
                caption={`Players TraderApe's week ${week} projection rates below Sleeper's, largest gap first`}
                rows={displayState.data.bearish}
                week={week}
              />
            </div>
          ) : (
            <p className={styles.note}>
              No disagreements this week — TraderApe&apos;s projections match
              Sleeper&apos;s on every board player with a Sleeper line.
            </p>
          ))}
      </div>

      <p className={styles.footnote}>
        Gaps are full-PPR points for week {week}: TraderApe&apos;s model
        (recency-weighted form + season baseline) minus Sleeper&apos;s free
        weekly projection. Sleeper&apos;s number is the market read, not a
        recommendation — a gap is a second opinion, not a verdict.
      </p>
    </section>
  );
}

function DisagreementTable({
  title,
  caption,
  rows,
  week,
}: {
  title: string;
  caption: string;
  rows: ProjectionDisagreement[];
  week: number;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={styles.tableBlock}>
      <h3 className={styles.subheading}>{title}</h3>
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">
              <abbr title={`TraderApe's projected fantasy points for week ${week}`}>
                TraderApe
              </abbr>
            </th>
            <th scope="col">
              <abbr title={`Sleeper's projected fantasy points for week ${week}`}>
                Sleeper
              </abbr>
            </th>
            <th scope="col">
              <abbr title="TraderApe projection minus Sleeper projection, in full-PPR points">
                Gap
              </abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.playerId}>
              <th scope="row" className={styles.playerCell}>
                <span className={styles.playerName}>{d.name}</span>
                <span className={styles.playerMeta}>
                  <PosBadge pos={d.pos} /> {d.team}
                </span>
              </th>
              <td className={styles.num}>{d.traderApe.toFixed(1)}</td>
              <td className={styles.num}>{d.sleeper.toFixed(1)}</td>
              <td
                className={`${styles.num} ${d.gap > 0 ? styles.gapUp : styles.gapDown}`}
                aria-label={`${d.gap > 0 ? '+' : ''}${d.gap.toFixed(1)} points vs Sleeper`}
              >
                {d.gap > 0 ? '+' : ''}
                {d.gap.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
