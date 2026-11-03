// Opportunity Share Leaders board (backlog item 108): per-position
// (RB/WR/TE) opportunity-share leaders over the last 3 completed weeks —
// the season-long "how much of this offense runs through him" reference
// board. Companion to Target Share (item 107), which prices passing
// volume only: a touch here is a carry or a target, priced against the
// player's own NFL team's touches. Priced on Sleeper's free public weekly
// stats at runtime (same data as Opportunity Watch), league-independent
// so guests get the full board like the /targets page.

import { useCallback, useEffect, useState } from 'react';
import { POOL } from '@/data/draftPool';
import type { DraftPoolFile } from '@/types/draft';
import { fetchWeeklyUsage } from '@/api/sleeperUsage';
import { currentWeekEstimate } from '@/utils/matchupRating';
import {
  buildOpportunityLeaders,
  OPPORTUNITY_POSITIONS,
  type OpportunityLeader,
  type OpportunityPosition,
} from '@/utils/opportunityLeaders';
import styles from './OpportunityLeadersPage.module.css';

interface OpportunityLeadersPageProps {
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; leaders: Map<OpportunityPosition, OpportunityLeader[]> };

const pct = (n: number): string => `${Math.round(n * 100)}%`;

function rowAriaLabel(row: OpportunityLeader): string {
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}): ` +
    `${pct(row.opportunityShare)} of his team's touches over his last ${row.games} ` +
    `games, ${row.touchesPerGame} touches per game (${row.carriesPerGame} carries, ${row.targetsPerGame} targets)`
  );
}

export function OpportunityLeadersPage({ pool = POOL }: OpportunityLeadersPageProps) {
  const [position, setPosition] = useState<OpportunityPosition>('RB');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Pure NFL data — the estimate prices the latest completed weeks in both
  // league and guest mode.
  const [week] = useState(() => currentWeekEstimate());

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const usage = await fetchWeeklyUsage(pool.season, week - 1);
      if (!usage) throw new Error('no weekly usage data');
      setState({
        kind: 'ready',
        leaders: buildOpportunityLeaders({
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

  const weekStart = week - 3;
  const weekEnd = week - 1;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Opportunity Share Leaders</h1>
      <p className={styles.lede}>
        How much of the offense runs through him: the highest shares of
        their own team's touches (carries + targets) at each skill position
        over the last three completed weeks. Rank 1 commands the most
        workload — the volume read behind every waiver and trade decision.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {OPPORTUNITY_POSITIONS.map(pos => (
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
          <p className={styles.note}>Loading opportunity shares…</p>
        )}
        {state.kind === 'error' && (
          <div className={styles.error}>
            <p className={styles.note}>
              Couldn't load opportunity data ({state.message}). Sleeper's
              free public stats may be down.
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
            const rows = state.leaders.get(position) ?? [];
            if (rows.length === 0) {
              return (
                <p className={styles.note}>
                  No {position} opportunity leaders for weeks {weekStart}–
                  {weekEnd} yet.
                </p>
              );
            }
            return (
              <div className={styles.tableWrapper}>
                <table
                  className={styles.table}
                  aria-label={`Opportunity share leaders at ${position}, weeks ${weekStart} through ${weekEnd}`}
                >
                  <caption className={styles.caption}>
                    Top {position}s by opportunity share (weeks {weekStart}–
                    {weekEnd})
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="visually-hidden">Rank</span>
                      </th>
                      <th scope="col">Player</th>
                      <th scope="col">NFL</th>
                      <th scope="col">
                        <abbr title="Share of the player's NFL team's touches (carries + targets) over the player's last 3 completed weeks">
                          Opp %
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Touches (carries + targets) per game over the last 3 completed weeks">
                          Touches/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Carries per game over the last 3 completed weeks">
                          Carries/gm
                        </abbr>
                      </th>
                      <th scope="col">
                        <abbr title="Targets per game over the last 3 completed weeks">
                          Targets/gm
                        </abbr>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.player.id}>
                        <td>{i + 1}</td>
                        <th scope="row" aria-label={rowAriaLabel(row)}>
                          {row.player.name}
                        </th>
                        <td>{row.player.team ?? '—'}</td>
                        <td>{pct(row.opportunityShare)}</td>
                        <td>{row.touchesPerGame.toFixed(1)}</td>
                        <td>{row.carriesPerGame.toFixed(1)}</td>
                        <td>{row.targetsPerGame.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
      </div>

      <p className={styles.footnote}>
        Method: opportunity share (player touches / team touches, a touch
        being a carry or a target) over the last three completed weeks,
        from Sleeper's free public weekly stats; 2+ games required. An
        opportunity map, not a forecast: pair it with health and matchup
        before a start/sit call.
      </p>
    </div>
  );
}
