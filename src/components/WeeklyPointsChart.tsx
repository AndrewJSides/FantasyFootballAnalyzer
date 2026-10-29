// Player value-over-time chart (backlog item 8): week-by-week full-PPR points
// on the Player Journey page, so a player's rises and falls are visible at a
// glance. Hand-rolled SVG — no charting dependency, keeps the bundle lean.
// Accessibility: the SVG carries role="img" with a plain-language summary
// aria-label, every bar has a <title> for hover, and a visually-hidden table
// gives screen readers the full week-by-week series.

import { useMemo } from 'react';
import { buildWeekSeries, summarizeWeekSeries } from '@/utils/weekSeries';
import styles from './WeeklyPointsChart.module.css';

interface WeeklyPointsChartProps {
  playerName: string;
  weekly: Record<number, number>;
}

const VIEW_W = 600;
const VIEW_H = 240;
const M = { top: 26, right: 16, bottom: 30, left: 46 };

export function WeeklyPointsChart({ playerName, weekly }: WeeklyPointsChartProps) {
  const series = useMemo(() => buildWeekSeries(weekly), [weekly]);
  const stats = useMemo(() => summarizeWeekSeries(series), [series]);

  if (stats.games === 0) return null;

  const plotW = VIEW_W - M.left - M.right;
  const plotH = VIEW_H - M.top - M.bottom;
  const maxPoints = Math.max(...series.map(s => s.points ?? 0));
  const yMax = Math.max(10, Math.ceil(maxPoints / 10) * 10);
  const n = series.length;
  const slotW = plotW / n;
  const slotX = (i: number) => M.left + i * slotW;
  const valueY = (pts: number) => M.top + plotH - (pts / yMax) * plotH;
  const avgY = valueY(stats.average);
  const baselineY = M.top + plotH;
  // Value labels crowd below ~18 weeks; the <title> tooltips and the
  // screen-reader table still carry every number.
  const showValues = slotW >= 28;

  const summary =
    `Weekly full-PPR points for ${playerName}: ${stats.games} ` +
    `game${stats.games === 1 ? '' : 's'} recorded, best week ${stats.bestWeek} ` +
    `with ${stats.bestPoints.toFixed(1)} points, average ` +
    `${stats.average.toFixed(1)} per game.`;

  return (
    <figure className={styles.figure}>
      <div className={styles.chartWrap}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className={styles.chart}
          role="img"
          aria-label={summary}
        >
          {/* Y gridlines. */}
          {[0, yMax / 2, yMax].map(g => (
            <g key={g}>
              <line
                x1={M.left}
                x2={VIEW_W - M.right}
                y1={valueY(g)}
                y2={valueY(g)}
                className={styles.gridLine}
              />
              <text
                x={M.left - 8}
                y={valueY(g) + 3.5}
                className={styles.gridLabel}
                textAnchor="end"
              >
                {g}
              </text>
            </g>
          ))}
          {/* Season average. */}
          <line
            x1={M.left}
            x2={VIEW_W - M.right}
            y1={avgY}
            y2={avgY}
            className={styles.avgLine}
          />
          <text
            x={VIEW_W - M.right}
            y={avgY - 5}
            className={styles.avgLabel}
            textAnchor="end"
          >
            avg {stats.average.toFixed(1)}
          </text>
          {/* Bars. */}
          {series.map((s, i) => {
            const bx = slotX(i) + slotW * 0.2;
            const bw = Math.max(3, slotW * 0.6);
            const labelX = slotX(i) + slotW / 2;
            if (s.points === null) {
              return (
                <g key={s.week}>
                  <title>{`Week ${s.week}: no game recorded`}</title>
                  <line
                    x1={bx}
                    x2={bx + bw}
                    y1={baselineY}
                    y2={baselineY}
                    className={styles.missingTick}
                  />
                  <text x={labelX} y={VIEW_H - 10} className={styles.weekLabel} textAnchor="middle">
                    W{s.week}
                  </text>
                </g>
              );
            }
            const isBest = s.week === stats.bestWeek;
            const h = (s.points / yMax) * plotH;
            return (
              <g key={s.week}>
                <title>{`Week ${s.week}: ${s.points.toFixed(1)} points`}</title>
                <rect
                  data-testid="week-bar"
                  x={bx}
                  // A scoreless game still counts as a played game — keep a
                  // sliver so it reads as played-but-zero, distinct from the
                  // dashed "no game" tick above.
                  y={baselineY - Math.max(h, 1.5)}
                  width={bw}
                  height={Math.max(h, 1.5)}
                  className={isBest ? styles.bestBar : styles.bar}
                />
                {showValues && (
                  <text
                    x={labelX}
                    y={baselineY - h - 5}
                    className={styles.valueLabel}
                    textAnchor="middle"
                  >
                    {s.points.toFixed(1)}
                  </text>
                )}
                <text x={labelX} y={VIEW_H - 10} className={styles.weekLabel} textAnchor="middle">
                  W{s.week}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className={styles.legend} aria-hidden="true">
        <span className={styles.legendItem}>
          <span className={styles.swatchBest} /> best week
        </span>
        <span className={styles.legendItem}>
          <span className={styles.swatchAvg} /> season average
        </span>
        <span className={styles.legendItem}>
          <span className={styles.swatchMissing} /> no game
        </span>
      </div>
      {/* Screen-reader data table: the SVG's aria-label summarizes, this
          carries the full series for anyone who wants the numbers. */}
      <table className="visually-hidden">
        <caption>Weekly full-PPR points for {playerName}</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Points</th>
          </tr>
        </thead>
        <tbody>
          {series.map(s => (
            <tr key={s.week}>
              <th scope="row">Week {s.week}</th>
              <td>{s.points === null ? 'no game' : s.points.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
