// Positional Scarcity Meter (backlog item 91): per-position (QB/RB/WR/TE)
// scarcity on the Trade Value Chart's own 0-100 scale — the trade-deadline
// "which positions are running dry in my league" read. FantasyPros'
// draft-strategy writing frames positional scarcity as the core
// roster-building concept (researched for feature shape only); this is
// priced entirely from TraderApe's own chart engine, no copied content.
// Guidance only.
import { useMemo } from 'react';
import {
  buildPositionalScarcity,
  type PositionScarcity,
  type ScarcityVerdict,
} from '@/utils/positionalScarcity';
import type { ValueLeague } from '@/utils/projectionValues';
import type { TradeValueRow } from '@/utils/tradeValues';
import styles from './PositionalScarcity.module.css';

interface PositionalScarcityProps {
  rows: TradeValueRow[];
  valueLeague: ValueLeague;
  /** League mode only: pool ids actually rostered. Guest mode omits it and
   * the meter prices the wire on the typical-draft-order assumption. */
  rosteredIds?: Set<string>;
}

const VERDICT_LABEL: Record<ScarcityVerdict, string> = {
  deep: 'Deep',
  balanced: 'Balanced',
  thin: 'Thin',
};

const VERDICT_CLASS: Record<ScarcityVerdict, string> = {
  deep: styles.deep,
  balanced: styles.balanced,
  thin: styles.thin,
};

export function PositionalScarcity({
  rows,
  valueLeague,
  rosteredIds,
}: PositionalScarcityProps) {
  const scarcity: PositionScarcity[] = useMemo(
    () => buildPositionalScarcity(rows, valueLeague, rosteredIds),
    [rows, valueLeague, rosteredIds],
  );
  if (scarcity.length === 0) return null;
  const guest = rosteredIds === undefined;
  return (
    <section className={styles.section} aria-label="Positional scarcity">
      <h2 className={styles.title}>Positional Scarcity</h2>
      <p className={styles.note}>
        How dry each position is on the trade-value scale — the starter line
        is the last starter-worthy player for a league this shape, and the
        verdict prices the best waiver option against the chart&rsquo;s own
        tier bands. Guidance only.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            Positional scarcity: starter demand, starter line, best waiver
            option, and scarcity verdict per position
          </caption>
          <thead>
            <tr>
              <th scope="col">Position</th>
              <th scope="col">Starters needed</th>
              <th scope="col">Starter line</th>
              <th scope="col">Best on waivers</th>
              <th scope="col">Rostered</th>
              <th scope="col">Scarcity</th>
            </tr>
          </thead>
          <tbody>
            {scarcity.map(s => (
              <tr key={s.position}>
                <th scope="row">{s.position}</th>
                <td className={styles.num}>{s.demandLine}</td>
                <td
                  className={styles.num}
                  aria-label={
                    s.starterLineValue != null
                      ? `${s.position} starter line: ${s.starterLineValue.toFixed(1)}`
                      : `No ${s.position} starter line on the chart`
                  }
                  title={
                    s.starterLineValue != null
                      ? `Value of the ${s.demandLine}${ordinal(s.demandLine)}-ranked ${s.position}`
                      : undefined
                  }
                >
                  {s.starterLineValue != null ? s.starterLineValue.toFixed(1) : '—'}
                </td>
                <td
                  className={styles.num}
                  aria-label={
                    s.bestWaiverValue != null
                      ? `Best waiver ${s.position}: ${s.bestWaiverValue.toFixed(1)}`
                      : `No waiver ${s.position} on the chart`
                  }
                >
                  {s.bestWaiverValue != null ? s.bestWaiverValue.toFixed(1) : '—'}
                </td>
                <td className={styles.num}>{s.rosteredCount}</td>
                <td>
                  <span
                    className={`${styles.verdict} ${VERDICT_CLASS[s.verdict]}`}
                    aria-label={s.verdictDetail}
                    title={s.verdictDetail}
                  >
                    {VERDICT_LABEL[s.verdict]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.footnote}>
        Method: starter demand = teams × (base slots + FLEX/SUPERFLEX shares
        from the VOR engine). Verdicts price the best waiver option on the
        chart&rsquo;s own tier bands — Deep at Starter level (15+) or above,
        Balanced at 5+, Thin below.{' '}
        {guest
          ? 'Guest mode: without a synced league the wire is priced on the typical-draft-order assumption (rosters take the top N); sync your league for the real wire.'
          : 'League mode: the wire prices the real rosters from your latest sync.'}
      </p>
    </section>
  );
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}
