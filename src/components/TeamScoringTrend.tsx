// Team scoring trend chart (backlog item 94): per-week actual points as
// bars, the week's league-average score as a dashed line, and a diamond
// marker for the best lineup the team could have fielded (where the sync
// carries weekly lineups). Hand-rolled SVG — no charting dependency.
// Accessibility: role="img" with a plain-language summary aria-label, a
// <title> per bar, and a visually-hidden data table with the full series.

import { useMemo } from 'react';
import type { TeamScoringTrend } from '@/utils/teamScoringTrend';
import styles from './TeamScoringTrend.module.css';

interface TeamScoringTrendProps {
  teamName: string;
  trend: TeamScoringTrend;
}

const VIEW_W = 600;
const VIEW_H = 240;
const M = { top: 26, right: 16, bottom: 30, left: 46 };

export function TeamScoringTrend({ teamName, trend }: TeamScoringTrendProps) {
  const { weeks } = trend;
  const yMax = useMemo(() => {
    const peak = Math.max(
      ...weeks.map(w => Math.max(w.points, w.leagueAvg, w.bestLineup ?? 0)),
    );
    return Math.max(10, Math.ceil(peak / 20) * 20);
  }, [weeks]);

  const plotW = VIEW_W - M.left - M.right;
  const plotH = VIEW_H - M.top - M.bottom;
  const n = weeks.length;
  const slotW = plotW / n;
  const slotX = (i: number) => M.left + i * slotW;
  const valueY = (pts: number) => M.top + plotH - (pts / yMax) * plotH;
  const baselineY = M.top + plotH;
  const showValues = slotW >= 28;
  const hasBestLineup = weeks.some(w => w.bestLineup !== null);

  // Dashed league-average line through the weekly averages.
  const avgPoints = weeks
    .map((w, i) => `${(slotX(i) + slotW / 2).toFixed(1)},${valueY(w.leagueAvg).toFixed(1)}`)
    .join(' ');

  const summary =
    `Scoring trend for ${teamName}: ${weeks.length} completed ` +
    `week${weeks.length === 1 ? '' : 's'}, season average ` +
    `${trend.seasonAvg.toFixed(1)} points, best week ${trend.bestWeek} ` +
    `with ${weeks.find(w => w.week === trend.bestWeek)?.points.toFixed(1)} points.`;

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
          {/* League-average line. */}
          <polyline
            points={avgPoints}
            fill="none"
            className={styles.avgLine}
          />
          <text
            x={VIEW_W - M.right}
            y={valueY(weeks[weeks.length - 1].leagueAvg) - 5}
            className={styles.avgLabel}
            textAnchor="end"
          >
            lg avg {weeks[weeks.length - 1].leagueAvg.toFixed(1)}
          </text>
          {/* Weekly bars + best-lineup markers. */}
          {weeks.map((w, i) => {
            const bx = slotX(i) + slotW * 0.2;
            const bw = Math.max(3, slotW * 0.6);
            const labelX = slotX(i) + slotW / 2;
            const isBest = w.week === trend.bestWeek;
            const h = (w.points / yMax) * plotH;
            const markY = w.bestLineup !== null ? valueY(w.bestLineup) : null;
            return (
              <g key={w.week}>
                <title>
                  {`Week ${w.week}: ${w.points.toFixed(1)} points ` +
                    `(league avg ${w.leagueAvg.toFixed(1)}` +
                    `${w.bestLineup !== null ? `, best lineup ${w.bestLineup.toFixed(1)}` : ''})`}
                </title>
                <rect
                  data-testid="trend-bar"
                  x={bx}
                  y={baselineY - Math.max(h, 1.5)}
                  width={bw}
                  height={Math.max(h, 1.5)}
                  className={isBest ? styles.bestBar : styles.bar}
                />
                {markY !== null && (
                  <rect
                    data-testid="best-lineup-mark"
                    x={labelX - 4.5}
                    y={markY - 4.5}
                    width={9}
                    height={9}
                    transform={`rotate(45 ${labelX} ${markY})`}
                    className={styles.bestLineupMark}
                  />
                )}
                {showValues && (
                  <text
                    x={labelX}
                    y={baselineY - h - 5}
                    className={styles.valueLabel}
                    textAnchor="middle"
                  >
                    {w.points.toFixed(1)}
                  </text>
                )}
                <text x={labelX} y={VIEW_H - 10} className={styles.weekLabel} textAnchor="middle">
                  W{w.week}
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
          <span className={styles.swatchAvg} /> league avg
        </span>
        {hasBestLineup && (
          <span className={styles.legendItem}>
            <span className={styles.swatchLineup} /> best lineup
          </span>
        )}
      </div>
      <table className="visually-hidden">
        <caption>Weekly scoring trend for {teamName}</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Points</th>
            <th scope="col">League avg</th>
            <th scope="col">Best lineup</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map(w => (
            <tr key={w.week}>
              <th scope="row">Week {w.week}</th>
              <td>{w.points.toFixed(1)}</td>
              <td>{w.leagueAvg.toFixed(1)}</td>
              <td>{w.bestLineup !== null ? w.bestLineup.toFixed(1) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.footnote}>
        Bars are actual weekly scores (best week highlighted); the dashed
        line is the league's average score each week; diamonds mark the
        best lineup the roster could have fielded where the sync carries
        weekly lineups. Completed weeks only.
      </p>
    </figure>
  );
}
