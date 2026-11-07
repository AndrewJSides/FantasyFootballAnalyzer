// Weekly Grades (backlog item 183) — the live weekly prediction grades on
// the Model Report: per completed week, how the frozen pre-kickoff
// projections actually did against Sleeper actuals (MAE, within-±5 share,
// over/under/in-line counts, bias, top miss reasons, accuracy by position,
// and the biggest over/underperformers by name). No league data needed, so
// league and guest modes share it. Hides when no grade file is bundled.
import { useState } from 'react';
import { POOL } from '@/data/draftPool';
import { GRADED_WEEKS, type BundledGradeWeek } from '@/data/projectionGrades';
import {
  gradeReasonLabel,
  summarizeWeeklyGrade,
  type WeeklyGradeSummary,
} from '@/utils/weeklyGrades';
import styles from './WeeklyGrades.module.css';

function fmt(n: number): string {
  return n.toFixed(2);
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function biasLine(bias: number): string {
  if (bias === 0) return 'no bias';
  return bias < 0
    ? `projections ran high by ${fmt(Math.abs(bias))} pts`
    : `projections ran low by ${fmt(bias)} pts`;
}

function MissTable({
  caption,
  rows,
}: {
  caption: string;
  rows: WeeklyGradeSummary['biggestOver'];
}) {
  if (rows.length === 0) return null;
  return (
    <table className={styles.table}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Player</th>
          <th scope="col">Pos</th>
          <th scope="col">Proj.</th>
          <th scope="col">Actual</th>
          <th scope="col">Diff</th>
          <th scope="col">Main reason</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.playerId}>
            <th scope="row">
              {row.name} <span className={styles.team}>{row.team}</span>
            </th>
            <td>{row.position}</td>
            <td>{fmt(row.predicted)}</td>
            <td>{fmt(row.actual)}</td>
            <td>
              {row.diff > 0 ? '+' : ''}
              {fmt(row.diff)}
            </td>
            <td>{gradeReasonLabel(row.primaryReason)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WeeklyGrades({ weeks = GRADED_WEEKS }: { weeks?: BundledGradeWeek[] }) {
  const summaries = weeks
    .map(w => summarizeWeeklyGrade(w.file, POOL))
    .filter((s): s is WeeklyGradeSummary => s !== null)
    .sort((a, b) => b.week - a.week);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const selected =
    summaries.find(s => s.week === selectedWeek) ?? summaries[0];

  if (!selected) return null;

  const { outperformed, underperformed, inLine } = selected;

  const gradedDate = selected.gradedAt
    ? new Date(selected.gradedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'unknown date';

  return (
    <section aria-labelledby="model-report-weekly-grades">
      <h2 id="model-report-weekly-grades">Weekly grades — how the projections actually did</h2>
      {summaries.length > 1 && (
        <div className={styles.filterBar} role="group" aria-label="Graded week">
          {summaries.map(s => (
            <button
              key={s.week}
              type="button"
              className={`${styles.filterButton} ${s.week === selected.week ? styles.active : ''}`}
              aria-pressed={s.week === selected.week}
              onClick={() => setSelectedWeek(s.week)}
            >
              Week {s.week}
            </button>
          ))}
        </div>
      )}
      <div aria-live="polite">
        <p>
          Week {selected.week}: {selected.graded} players graded · mean absolute error{' '}
          <strong>{fmt(selected.mae)} pts</strong> · within ±{selected.threshold} pts{' '}
          <strong>{pct(selected.within5Pct)}</strong> of the time · {outperformed}{' '}
          over / {underperformed} under / {inLine} in line ·{' '}
          {biasLine(selected.bias)}. Graded {gradedDate}.
        </p>

        {selected.byPosition.length > 0 && (
          <table className={styles.table}>
            <caption>
              Week {selected.week} accuracy by position, full PPR
            </caption>
            <thead>
              <tr>
                <th scope="col">Pos</th>
                <th scope="col">Graded</th>
                <th scope="col">MAE</th>
                <th scope="col">Within ±{selected.threshold}</th>
                <th scope="col">Bias</th>
              </tr>
            </thead>
            <tbody>
              {selected.byPosition.map(row => (
                <tr key={row.position}>
                  <th scope="row">{row.position}</th>
                  <td>{row.graded}</td>
                  <td>{fmt(row.mae)}</td>
                  <td>{pct(row.within5Pct)}</td>
                  <td>
                    {row.bias > 0 ? '+' : ''}
                    {fmt(row.bias)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {selected.topReasons.length > 0 && (
          <>
            <h3>Why the misses missed</h3>
            <ul>
              {selected.topReasons.map(r => (
                <li key={r.reason}>
                  {r.label} — {r.count}
                </li>
              ))}
            </ul>
          </>
        )}

        <MissTable
          caption={`Week ${selected.week} biggest beats — projected low, scored high`}
          rows={selected.biggestOver}
        />
        <MissTable
          caption={`Week ${selected.week} biggest misses — projected high, scored low`}
          rows={selected.biggestUnder}
        />
      </div>
      <p className={styles.footnote}>
        Method: each week&apos;s frozen pre-kickoff snapshot is graded against Sleeper&apos;s
        free weekly actuals in full PPR once the week&apos;s games finish. A player counts
        as in line within ±{selected.threshold} pts; the rest split into over- and
        underperformers by the same band. New graded weeks appear here when they land.
      </p>
    </section>
  );
}
