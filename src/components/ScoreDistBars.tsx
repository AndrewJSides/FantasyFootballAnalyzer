// ScoreDistBars (backlog item 24b): per-team P10/median/P90 score
// distributions from the matchup's Monte Carlo run, drawn as range bars on
// a shared scale — the visual answer to "shootout or snoozer". Two labeled
// rows per matchup: a P10–P90 band with a median tick. Pure display: the
// numbers come from weeklyWinProb's simulation.

import type { ScoreDistribution } from '@/utils/weeklyWinProb';
import styles from './ScoreDistBars.module.css';

export interface ScoreDistRow {
  label: string;
  dist: ScoreDistribution;
}

/** Shared scale across all rows so the two bands are visually comparable. */
function scale(rows: ScoreDistRow[]): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rows) {
    lo = Math.min(lo, r.dist.p10);
    hi = Math.max(hi, r.dist.p90);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
    return { lo: 0, hi: 1 };
  }
  const pad = (hi - lo) * 0.05;
  return { lo: lo - pad, hi: hi + pad };
}

function pct(value: number, lo: number, hi: number): number {
  return ((value - lo) / (hi - lo)) * 100;
}

export default function ScoreDistBars({ rows }: { rows: ScoreDistRow[] }) {
  const { lo, hi } = scale(rows);
  const summary = rows
    .map(
      r =>
        `${r.label}: 80% of simulated weeks score between ${r.dist.p10.toFixed(1)} and ${r.dist.p90.toFixed(1)} (median ${r.dist.median.toFixed(1)})`,
    )
    .join('. ');
  return (
    <div className={styles.bars} role="img" aria-label={`Score distributions. ${summary}`}>
      {rows.map(r => {
        const left = pct(r.dist.p10, lo, hi);
        const right = pct(r.dist.p90, lo, hi);
        const med = pct(r.dist.median, lo, hi);
        return (
          <div key={r.label} className={styles.row}>
            <span className={styles.label} title={r.label}>
              {r.label}
            </span>
            <span className={styles.track} aria-hidden="true">
              <span
                className={styles.band}
                data-testid="dist-band"
                style={{ left: `${left}%`, width: `${right - left}%` }}
              />
              <span className={styles.tick} data-testid="dist-tick" style={{ left: `${med}%` }} />
            </span>
            <span className={styles.numbers}>
              {r.dist.p10.toFixed(1)}–{r.dist.p90.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
