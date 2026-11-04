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
export function ProjectionDisagreements({ rows, season, week }: ProjectionDisagreementsProps) {
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

  useEffect(() => {
    void load();
  }, [load]);

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
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading Sleeper&apos;s week {week} projections…</p>
        )}

        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn&apos;t load Sleeper&apos;s projections ({state.message}).
              The rankings board above is unaffected.
            </p>
            <button type="button" className="input" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {state.kind === 'ready' &&
          (state.data.bullish.length > 0 || state.data.bearish.length > 0 ? (
            <div className={styles.tables}>
              <DisagreementTable
                title="TraderApe higher"
                caption={`Players TraderApe's week ${week} projection rates above Sleeper's, largest gap first`}
                rows={state.data.bullish}
                week={week}
              />
              <DisagreementTable
                title="TraderApe lower"
                caption={`Players TraderApe's week ${week} projection rates below Sleeper's, largest gap first`}
                rows={state.data.bearish}
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
