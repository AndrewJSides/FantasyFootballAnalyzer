// Fantasy points allowed board (backlog item 102): every NFL defense ranked
// by fantasy points allowed per game to each skill position, softest first —
// TraderApe's own bundled allowed-vs-position data (the same numbers behind
// the weekly matchup chips), league-independent so guests get the full board.

import { useMemo, useState } from 'react';
import {
  ALLOWED_POSITIONS,
  allowedRead,
  buildPointsAllowedBoard,
  type AllowedPosition,
} from '@/utils/pointsAllowed';
import styles from './PointsAllowedPage.module.css';

const READ_LABEL: Record<ReturnType<typeof allowedRead>, string> = {
  favorable: 'Favorable',
  neutral: 'Neutral',
  tough: 'Tough',
};

function rowAriaLabel(team: string, avg: number, rank: number, pos: AllowedPosition): string {
  return `${team}: allows ${avg.toFixed(1)} fantasy points per game to ${pos}s, ranked ${rank} of 32 — ${READ_LABEL[allowedRead(rank)].toLowerCase()} matchup for your ${pos}`;
}

export function PointsAllowedPage() {
  const [position, setPosition] = useState<AllowedPosition>('QB');
  const board = useMemo(() => buildPointsAllowedBoard(position), [position]);
  const [weekStart, weekEnd] = board.weeks;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Fantasy Points Allowed</h1>
      <p className={styles.lede}>
        Which defenses get torched by each position — and which shut it down.
        Rank 1 allows the most points (the softest matchup for your player).
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {ALLOWED_POSITIONS.map(pos => (
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
        <div className={styles.tableWrapper}>
          <table
            className={styles.table}
            aria-label={`Fantasy points allowed per game to ${position}s, weeks ${weekStart} through ${weekEnd}`}
          >
            <caption className={styles.caption}>
              32 NFL defenses by fantasy points allowed per game to {position}s
              (weeks {weekStart}–{weekEnd})
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Team</th>
                <th scope="col">Allowed / gm</th>
                <th scope="col">Matchup</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map(row => {
                const read = allowedRead(row.rank);
                return (
                  <tr key={row.team}>
                    <td>{row.rank}</td>
                    <th scope="row">{row.team}</th>
                    <td>{row.avg.toFixed(1)}</td>
                    <td>
                      <span
                        className={
                          read === 'favorable'
                            ? styles.muFav
                            : read === 'tough'
                              ? styles.muTough
                              : styles.muNeutral
                        }
                        title={rowAriaLabel(row.team, row.avg, row.rank, position)}
                        aria-label={rowAriaLabel(row.team, row.avg, row.rank, position)}
                      >
                        {READ_LABEL[read]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className={styles.footnote}>
        Method: average full-PPR fantasy points each defense allowed per game to
        the position over completed weeks {weekStart}–{weekEnd}, from Sleeper's
        free weekly stats via <code>npm run fetch:matchups</code>. Rank 1 allows
        the most — the softest matchup. A difficulty map, not a forecast: pair
        it with volume and health before a start/sit call.
      </p>
    </div>
  );
}
