// Game log section on the Player Journey detail pane (backlog item 112):
// the week-by-week record behind the Points By Week chart — opponent and
// full-PPR points per completed week. Hides when there is nothing to show
// (no team, no weekly series, or no completed weeks), so guest mode and old
// snapshots stay quiet exactly like the chart it sits under.

import { useMemo } from 'react';
import { buildGameLog } from '@/utils/gameLog';
import styles from './GameLog.module.css';

interface GameLogProps {
  playerName: string;
  team: string | null | undefined;
  weekly: Record<number, number> | undefined;
  /** Last completed week — the log runs weeks 1 through this week. */
  toWeek: number;
}

export function GameLog({ playerName, team, weekly, toWeek }: GameLogProps) {
  const rows = useMemo(
    () => buildGameLog(team, weekly, toWeek),
    [team, weekly, toWeek],
  );
  if (rows.length === 0) return null;
  return (
    <div className={styles.log}>
      <h3 className={styles.logTitle}>Game Log</h3>
      <table className={styles.logTable}>
        <caption>
          {playerName}&apos;s completed weeks, weeks 1–{toWeek}
        </caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Opponent</th>
            <th scope="col">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.week}>
              <th scope="row">W{row.week}</th>
              <td>{row.opponent ?? 'Bye'}</td>
              <td>
                {row.points === null ? (
                  <span
                    className={styles.logDash}
                    aria-label={
                      row.opponent === null
                        ? `Week ${row.week}: bye week`
                        : `Week ${row.week}: no points recorded`
                    }
                  >
                    —
                  </span>
                ) : (
                  row.points.toFixed(1)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.logFootnote}>
        Full-PPR points from the league snapshot&apos;s weekly series;
        opponents from TraderApe&apos;s bundled 2026 schedule. A dash means no
        points were recorded that week — a bye, a did-not-play, or missing
        data — never a scoreless game.
      </p>
    </div>
  );
}
