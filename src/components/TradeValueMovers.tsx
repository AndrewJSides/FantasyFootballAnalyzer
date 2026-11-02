// Trade Value Risers & Fallers (backlog item 82): the biggest trade-value
// movers between the two most recent daily chart snapshots — the
// trade-timing answer (buy the riser before he peaks, move the faller
// before he drops further) that the absolute-value chart never surfaced.
// FantasyPros publishes a weekly "Risers & Fallers" series (researched for
// feature shape only); these movers are computed from TraderApe's own
// daily trade-value snapshots, no copied content. Guidance only.
import { useMemo } from 'react';
import type { PoolPlayer } from '@/types/draft';
import {
  tradeValueMovers,
  type TradeValueMover,
  type TradeValueMoversInfo,
  type TradeValueRow,
  type TradeValueSnapshot,
} from '@/utils/tradeValues';
import { injuryOf } from '@/utils/seasonOutlook';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './TradeValueMovers.module.css';

interface TradeValueMoversProps {
  snapshots: TradeValueSnapshot[];
  /** Current chart rows — supplies player names/details for mover ids. */
  rows: TradeValueRow[];
  /** League mode only; pool id → team name. */
  owners?: Map<string, string>;
}

function injuryTag(player: PoolPlayer): string | null {
  const info = injuryOf(player);
  if (!info) return null;
  if (info.seasonEnding || info.outNow) return player.injuryStatus ?? 'OUT';
  return null;
}

function rankArrow(rankDelta: number): string {
  if (rankDelta > 0) return '↑';
  if (rankDelta < 0) return '↓';
  return '→';
}

function MoverTable({
  movers,
  caption,
  players,
  owners,
  signedDelta,
}: {
  movers: TradeValueMover[];
  caption: string;
  players: Map<string, PoolPlayer>;
  owners?: Map<string, string>;
  signedDelta: string;
}) {
  if (movers.length === 0) return null;
  return (
    <div className={styles.tableWrap}>
      <h3 className={styles.subTitle}>{caption}</h3>
      <table className={styles.table}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Rank</th>
            <th scope="col">Value change</th>
            {owners && <th scope="col">Owner</th>}
          </tr>
        </thead>
        <tbody>
          {movers.map(m => {
            const player = players.get(m.poolId);
            if (!player) return null;
            const tag = injuryTag(player);
            const rankText = `${m.oldRank} ${rankArrow(m.rankDelta)} ${m.newRank}`;
            return (
              <tr key={m.poolId}>
                <th scope="row">
                  {player.name}
                  {tag && <span className={styles.injuryTag}> {tag}</span>}
                  <span className={styles.dim}>
                    {' '}
                    <PosBadge pos={player.pos} /> <NflTeamLabel team={player.team} />
                  </span>
                </th>
                <td
                  className={styles.num}
                  aria-label={`Rank moved from ${m.oldRank} to ${m.newRank}`}
                  title={`Rank ${m.oldRank} → ${m.newRank}`}
                >
                  {rankText}
                </td>
                <td
                  className={`${styles.num} ${signedDelta}`}
                  aria-label={`${player.name} trade value ${m.valueDelta > 0 ? 'rose' : 'fell'} ${Math.abs(m.valueDelta).toFixed(1)}, from ${m.oldValue.toFixed(1)} to ${m.newValue.toFixed(1)}`}
                  title={`${m.oldValue.toFixed(1)} → ${m.newValue.toFixed(1)}`}
                >
                  {m.valueDelta > 0 ? '+' : ''}
                  {m.valueDelta.toFixed(1)}
                </td>
                {owners && <td>{owners.get(m.poolId) ?? 'Free agent'}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TradeValueMovers({ snapshots, rows, owners }: TradeValueMoversProps) {
  const info: TradeValueMoversInfo | null = useMemo(
    () => tradeValueMovers(snapshots),
    [snapshots],
  );
  const players = useMemo(() => new Map(rows.map(r => [r.player.id, r.player])), [rows]);
  if (!info) return null;
  const { risers, fallers } = info;
  if (risers.length === 0 && fallers.length === 0) return null;
  return (
    <section className={styles.section} aria-label="Trade value movers">
      <h2 className={styles.title}>Value Movers</h2>
      <p className={styles.note}>
        The biggest trade-value risers and fallers since {info.baselineDate} —
        buy the riser before he peaks, move the faller before he drops
        further. Guidance only.
      </p>
      <div className={styles.tables}>
        <MoverTable
          movers={risers}
          caption="Risers"
          players={players}
          owners={owners}
          signedDelta={styles.up}
        />
        <MoverTable
          movers={fallers}
          caption="Fallers"
          players={players}
          owners={owners}
          signedDelta={styles.down}
        />
      </div>
      <p className={styles.footnote}>
        Method: ranked by TraderApe&rsquo;s own daily trade-value snapshots
        (standard 10-team full-PPR scale), moves under 1.5 value points cut as
        noise.
      </p>
    </section>
  );
}
