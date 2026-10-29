// Buy Low / Sell High targets panel (backlog item 16): players scoring
// well below (or above) TraderApe's own forward projection over the last
// 3 weeks, with remaining-schedule softness/toughness as the kicker and
// the owning league team named where there is one. Guidance only —
// nothing here moves rosters.
import type { MarketTarget } from '@/utils/buyLowSellHigh';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './BuyLowSellHigh.module.css';

interface BuyLowSellHighProps {
  week: number;
  buyLow: MarketTarget[];
  sellHigh: MarketTarget[];
  /** League mode shows the owning team; guest mode has no rosters. */
  showRosteredBy: boolean;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function rosLabel(t: MarketTarget): string {
  if (!t.ros) return '—';
  const word =
    t.ros.label === 'favorable'
      ? 'Soft'
      : t.ros.label === 'tough'
        ? 'Tough'
        : 'Avg';
  return `${word} (${round1(t.ros.avgRank)})`;
}

function rosClass(t: MarketTarget): string {
  if (!t.ros) return styles.dim;
  return t.ros.label === 'favorable'
    ? styles.muFav
    : t.ros.label === 'tough'
      ? styles.muTough
      : styles.muNeutral;
}

function TargetTable({
  targets,
  kind,
  showRosteredBy,
  emptyText,
}: {
  targets: MarketTarget[];
  kind: 'buy' | 'sell';
  showRosteredBy: boolean;
  emptyText: string;
}) {
  if (targets.length === 0) {
    return <p className={styles.empty}>{emptyText}</p>;
  }
  return (
    <table className={styles.table}>
      <caption className={styles.window}>
        {kind === 'buy' ? 'Buy low' : 'Sell high'} · TraderApe forward projection
        vs last-3 average
      </caption>
      <thead>
        <tr>
          <th scope="col">Player</th>
          <th scope="col">Last-3</th>
          <th scope="col">Proj.</th>
          <th scope="col">Gap</th>
          <th scope="col">ROS sched</th>
          {showRosteredBy && <th scope="col">Rostered by</th>}
        </tr>
      </thead>
      <tbody>
        {targets.map(t => (
          <tr key={t.player.id}>
            <td className={styles.playerCell}>
              <span className={styles.playerName}>
                {t.player.name} <PosBadge pos={t.player.pos} />{' '}
                {t.player.team && <NflTeamLabel team={t.player.team} />}
              </span>
              <ul className={styles.reasons} aria-label={`Why ${t.player.name}`}>
                {t.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </td>
            <td className={styles.nums}>{t.last3}</td>
            <td className={styles.nums}>{t.projection}</td>
            <td
              className={`${styles.nums} ${kind === 'buy' ? styles.gapBuy : styles.gapSell}`}
            >
              {kind === 'buy' ? `−${t.gap}` : `+${Math.abs(t.gap)}`}
            </td>
            <td className={rosClass(t)}>{rosLabel(t)}</td>
            {showRosteredBy && (
              <td className={styles.dim}>{t.rosteredBy ?? 'Free agent'}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BuyLowSellHigh({
  week,
  buyLow,
  sellHigh,
  showRosteredBy,
}: BuyLowSellHighProps) {
  return (
    <section className={styles.panel} aria-label="Buy Low Sell High targets">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Buy Low / Sell High</h2>
        <span className={styles.window}>Week {week} · regression targets</span>
      </div>
      <p className={styles.intro}>
        Startable assets running at least 3 points off TraderApe&apos;s own
        forward projection over their last 3 — buy the cold streaks, sell the
        hot ones before they cool. Research only; nothing here moves rosters.
      </p>
      <h3 className={styles.sideHeading}>
        <span className={styles.buy}>Buy low</span> — underperforming their
        outlook
      </h3>
      <TargetTable
        targets={buyLow}
        kind="buy"
        showRosteredBy={showRosteredBy}
        emptyText="No buy-low candidates right now — no startable asset is running 3+ under projection."
      />
      <h3 className={styles.sideHeading}>
        <span className={styles.sell}>Sell high</span> — overperforming their
        outlook
      </h3>
      <TargetTable
        targets={sellHigh}
        kind="sell"
        showRosteredBy={showRosteredBy}
        emptyText="No sell-high candidates right now — no startable asset is running 3+ over projection."
      />
      <p className={styles.footnote}>
        Method: TraderApe weekly projection (recency-weighted form blended
        with the season baseline, matchup-neutral) vs last-3 actuals; only
        assets with VOR ≥ 1 and 2+ recent stat lines. ROS sched is the
        remaining opponents&apos; allowed-vs-position rank (lower = softer).
      </p>
    </section>
  );
}
