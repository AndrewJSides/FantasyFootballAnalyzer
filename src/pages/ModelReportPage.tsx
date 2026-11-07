// Model Report Card (backlog item 115): TraderApe's own weekly projection
// model, measured not claimed — overall and per-position MAE against the
// naive prior-mean baseline, within-±5 rate, and bias, from the bundled
// backtest snapshot (npm run backtest:projections, Sleeper weekly stats,
// replay uses earlier weeks only), plus the measured verdicts on the three
// extra terms. No league data needed, so league and guest modes share it.
// The headline is honest by construction: weeks 1–8 tie the naive baseline
// (6.74 vs 6.72 MAE), win at RB, and trail slightly at WR/TE.
import { useEffect, useMemo } from 'react';
import backtestJson from '@/data/projectionBacktest.2026.json';
import { WeeklyGrades } from '@/components/WeeklyGrades';
import {
  summarizeModelReport,
  verdictLabel,
  type RawBacktestJson,
} from '@/utils/modelReport';
import { SITE_TITLE } from '../utils/siteTitle';
import styles from './ModelReportPage.module.css';

function fmt(n: number): string {
  return n.toFixed(2);
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function ModelReportPage() {
  useEffect(() => {
    document.title = 'Model Report · TraderApe';
    return () => {
      document.title = SITE_TITLE;
    };
  }, []);

  const report = useMemo(
    () => summarizeModelReport(backtestJson as unknown as RawBacktestJson),
    [],
  );

  if (!report) {
    return (
      <div className={styles.page}>
        <div className="container">
          <h1 className={styles.title}>Model Report</h1>
          <p>No backtest snapshot is bundled yet — run npm run backtest:projections and copy the output into src/data.</p>
        </div>
      </div>
    );
  }

  const snapshotDate = report.generatedAt
    ? new Date(report.generatedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'unknown date';

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Model Report</h1>
          <p className={styles.subtitle}>
            {report.season} · {report.weekRange} · {report.predictions.toLocaleString()} predictions
            over {report.players} players
          </p>
        </div>

        <section aria-labelledby="model-report-headline">
          <h2 id="model-report-headline">How good is TraderApe&apos;s projection?</h2>
          <p>
            Mean absolute error <strong>{fmt(report.mae)} pts</strong> vs{' '}
            <strong>{fmt(report.naiveMae)} pts</strong> for the naive baseline (each player&apos;s
            prior mean) — {verdictLabel(report.verdict).toLowerCase()} by{' '}
            {fmt(Math.abs(report.maeGap))} pts. Within ±5 pts of actual{' '}
            <strong>{pct(report.within5Pct)}</strong> of the time, with a{' '}
            {report.bias < 0 ? 'low' : 'high'} bias of {fmt(report.bias)} pts.
          </p>
        </section>

        <section aria-labelledby="model-report-positions">
          <h2 id="model-report-positions">Accuracy by position</h2>
          <table className={styles.table}>
            <caption>
              TraderApe model MAE vs the naive prior-mean baseline, {report.weekRange}
            </caption>
            <thead>
              <tr>
                <th scope="col">Pos</th>
                <th scope="col">Predictions</th>
                <th scope="col">Model MAE</th>
                <th scope="col">Naive MAE</th>
                <th scope="col">Gap</th>
                <th scope="col">Within ±5</th>
                <th scope="col">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {report.byPosition.map(row => (
                <tr key={row.position}>
                  <th scope="row">{row.position}</th>
                  <td>{row.predictions}</td>
                  <td>{fmt(row.mae)}</td>
                  <td>{fmt(row.naiveMae)}</td>
                  <td>
                    {row.maeGap > 0 ? '+' : ''}
                    {fmt(row.maeGap)}
                  </td>
                  <td>{pct(row.within5Pct)}</td>
                  <td>{verdictLabel(row.verdict)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <WeeklyGrades />

        <section aria-labelledby="model-report-terms">
          <h2 id="model-report-terms">Why the extra terms stay off</h2>
          <p>
            Each term below was priced at several strengths on the same weeks. The production
            model runs all three at zero — every nonzero pricing measured worse or no better,
            so the terms stay off until a re-test says otherwise.
          </p>
          {report.experiments.map(family => (
            <div key={family.family}>
              <h3>{family.family}</h3>
              <table className={styles.table}>
                <caption>
                  {family.family} candidate pricings, overall MAE ({report.weekRange})
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Pricing</th>
                    <th scope="col">MAE</th>
                    <th scope="col">In production</th>
                  </tr>
                </thead>
                <tbody>
                  {family.variants.map(v => (
                    <tr key={v.name}>
                      <th scope="row">{v.name}</th>
                      <td>{fmt(v.mae)}</td>
                      <td>{v.isProduction ? 'Yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        <p className={styles.footnote}>
          Method: week-by-week replay — each scored week&apos;s projection uses only earlier
          weeks, scored against Sleeper&apos;s free weekly actuals in full PPR. Snapshot from{' '}
          {snapshotDate}; refreshes when the backtest re-runs. The naive baseline is each
          player&apos;s prior mean, so &ldquo;trails naive&rdquo; means the recency weighting
          adds nothing measurable yet — not that the projections are unusable.
        </p>
      </div>
    </div>
  );
}
