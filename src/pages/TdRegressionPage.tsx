// TD Regression Watch board (backlog item 179): per-position (RB/WR/TE)
// expected-touchdown regression candidates over the completed weeks this
// season — the buy-low / sell-high half of the Red Zone Leaders board.
// Priced on Sleeper's free public weekly stats at runtime (rush_rz_att +
// rec_rz_tgt for opportunity, rush_td + rec_td for actuals), league-
// independent so guests get the full board like the /red-zone page.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildTdRegression,
  TD_REGRESSION_POSITIONS,
  type TdRegressionLists,
  type TdRegressionPosition,
  type TdRegressionRow,
} from '@/utils/tdRegression';
import styles from './TdRegressionPage.module.css';

interface TdRegressionPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; lists: Map<TdRegressionPosition, TdRegressionLists> };

const signed1 = (n: number): string =>
  n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);

function rowAriaLabel(row: TdRegressionRow, direction: 'due' | 'cooling'): string {
  const read =
    direction === 'due'
      ? 'scored fewer touchdowns than his red-zone opportunity implies — touchdowns are coming'
      : 'scored more touchdowns than his red-zone opportunity implies — touchdowns are likely to dry up';
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${row.tds} touchdowns vs ${row.xTd.toFixed(1)} expected (${signed1(row.gap)}), ` +
    `${row.rzOpps} red-zone opportunities over ${row.games} games — ${read}`
  );
}

function RegressionTable({
  rows,
  position,
  direction,
  weekStart,
  weekEnd,
}: {
  rows: TdRegressionRow[];
  position: TdRegressionPosition;
  direction: 'due' | 'cooling';
  weekStart: number;
  weekEnd: number;
}) {
  const heading =
    direction === 'due' ? 'Due for more TDs' : 'Due for fewer TDs';
  const tableName =
    direction === 'due'
      ? `TD regression — ${position}s due for more touchdowns, weeks ${weekStart} through ${weekEnd}`
      : `TD regression — ${position}s due for fewer touchdowns, weeks ${weekStart} through ${weekEnd}`;
  return (
    <section aria-labelledby={`${direction}-${position}-heading`}>
      <h2
        id={`${direction}-${position}-heading`}
        className={styles.sectionTitle}
      >
        {heading}
      </h2>
      {rows.length === 0 ? (
        <p className={styles.note}>
          No {position} is {direction === 'due' ? 'due for more' : 'due for fewer'}{' '}
          touchdowns over weeks {weekStart}–{weekEnd}.
        </p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table} aria-label={tableName}>
            <caption className={styles.caption}>
              {position}s {direction === 'due' ? 'due for more' : 'due for fewer'}{' '}
              touchdowns (weeks {weekStart}–{weekEnd})
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Rank</span>
                </th>
                <th scope="col">Player</th>
                <th scope="col">NFL</th>
                <th scope="col">
                  <abbr title="Actual rushing + receiving touchdowns over the completed weeks this season">
                    TDs
                  </abbr>
                </th>
                <th scope="col">
                  <abbr title="Expected touchdowns: the player's red-zone opportunities priced at his position's league-wide touchdowns-per-red-zone-opportunity rate">
                    xTD
                  </abbr>
                </th>
                <th scope="col">
                  <abbr title="Actual touchdowns minus expected touchdowns — negative means touchdowns are coming, positive means they are likely to dry up">
                    Gap
                  </abbr>
                </th>
                <th scope="col">
                  <abbr title="Red-zone opportunities (rush attempts + targets inside the 20) over the completed weeks this season">
                    RZ Opps
                  </abbr>
                </th>
                <th scope="col">
                  <abbr title="Games with a stat line in the completed weeks this season">
                    Games
                  </abbr>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.player.id}>
                  <td>{i + 1}</td>
                  <th scope="row" aria-label={rowAriaLabel(row, direction)}>
                    {row.player.name}
                  </th>
                  <td>{row.player.team ?? '—'}</td>
                  <td>{row.tds}</td>
                  <td>{row.xTd.toFixed(1)}</td>
                  <td>{signed1(row.gap)}</td>
                  <td>{row.rzOpps}</td>
                  <td>{row.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function TdRegressionPage({ pool = POOL }: TdRegressionPageProps) {
  const [position, setPosition] = useState<TdRegressionPosition>('RB');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Pure NFL data — the estimate prices the completed weeks in both
  // league and guest mode.
  const [week] = useState(() => currentWeekEstimate());

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const usage = await fetchWeeklyUsage(pool.season, week - 1);
      if (!usage) throw new Error('no weekly usage data');
      setState({
        kind: 'ready',
        lists: buildTdRegression({
          poolPlayers: pool.players,
          usageBySleeperId: usage.usageBySleeperId,
          currentWeek: week,
        }),
      });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }, [pool, week]);

  useEffect(() => {
    void load();
  }, [load]);

  const weekStart = 1;
  const weekEnd = week - 1;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>TD Regression Watch</h1>
      <p className={styles.lede}>
        Whose touchdown totals already diverge from their red-zone
        opportunity: expected touchdowns (xTD) price each player&apos;s
        red-zone work at his position&apos;s league-wide scoring rate, so a
        big gap is the buy-low (TDs coming) or sell-high (TDs drying up)
        signal at the trade deadline.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {TD_REGRESSION_POSITIONS.map(pos => (
          <button
            key={pos}
            type="button"
            className={pos === position ? styles.chipOn : styles.chip}
            aria-pressed={pos === position}
            onClick={() => setPosition(pos)}
          >
            {pos}
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {state.kind === 'loading' && (
          <p className={styles.note}>Loading TD regression candidates…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn&apos;t load TD regression data ({state.message}).
              Sleeper&apos;s free public stats may be down.
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
          (() => {
            const lists = state.lists.get(position);
            if (!lists || (lists.due.length === 0 && lists.cooling.length === 0)) {
              return (
                <p className={styles.note}>
                  No {position} regression candidates for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <>
                <RegressionTable
                  rows={lists.due}
                  position={position}
                  direction="due"
                  weekStart={weekStart}
                  weekEnd={weekEnd}
                />
                <RegressionTable
                  rows={lists.cooling}
                  position={position}
                  direction="cooling"
                  weekStart={weekStart}
                  weekEnd={weekEnd}
                />
              </>
            );
          })()}
      </div>

      <p className={styles.footnote}>
        Method: expected touchdowns (xTD) = a player&apos;s red-zone
        opportunities (rush attempts + targets inside the 20) × his
        position&apos;s league-wide touchdowns per red-zone opportunity, over
        the completed weeks this season from Sleeper&apos;s free public weekly
        stats; rushing + receiving touchdowns only, 3+ games required, and a
        |gap| of 1.5+ touchdowns to make a list. An opportunity map, not a
        forecast: pair it with health and matchup before a trade call.
      </p>
    </div>
  );
}
