// Trade Value Chart (backlog item 26): every startable QB/RB/WR/TE on a
// single 0-100 trade-value scale computed from TraderApe's own VOR engine,
// plus a package evaluator that weighs both sides of a deal by summed
// chart values. League mode prices the league's exact shape and flags
// ownership; guest mode degrades to the 10-team full-PPR default shape,
// owner-free. Competitor charts (e.g. FantasyPros' trade value chart)
// researched for feature shape only — values computed from TraderApe's own
// data, no copied content.
import { useEffect, useMemo, useState } from 'react';
import { PosBadge, TradeValueMovers } from '@/components';
import { PositionalScarcity } from '@/components/PositionalScarcity';
import { POOL } from '@/data/draftPool';
import snapshotsJson from '@/data/tradeValueSnapshots.2026.json';
import type { League } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { injuryOf } from '@/utils/seasonOutlook';
import { leagueOwnerMap } from '@/utils/rosRankings';
import { currentWeekEstimate, matchupLabel } from '@/utils/matchupRating';
import { upcomingMatchupChips } from '@/utils/upcomingMatchups';
import { SITE_TITLE } from '@/utils/siteTitle';
import {
  auctionDollars,
  buildTradeValueChart,
  GUEST_AUCTION_BUDGET,
  leagueAuctionSpend,
  PACKAGE_FAIR_BAND,
  packageTotals,
  TRADE_VALUE_TIERS,
  tradeValueDeltas,
  type TradeValueRow,
  type TradeValueSnapshot,
} from '@/utils/tradeValues';
import { valueLeagueFor } from '@/utils/tradeAnalysis';
import { vorConfigFor } from '@/utils/projectionValues';
import styles from './TradeValuesPage.module.css';

type PosFilter = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE';
const FILTERS: PosFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE'];
const CHART_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const SIDE_A_KEY = 'trade-values-side-a';
const SIDE_B_KEY = 'trade-values-side-b';

/** Stored chart snapshots, oldest first (see scripts/snapshotTradeValues.ts). */
const SNAPSHOTS: TradeValueSnapshot[] = (
  snapshotsJson as { snapshots: TradeValueSnapshot[] }
).snapshots;

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-10-30" → "Oct 30" (parts parsed directly, no timezone shift). */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${MONTHS_SHORT[Number(m) - 1]} ${Number(d)}`;
}

/** "2026-10-30" → "October 30, 2026". */
function longDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${MONTHS_LONG[Number(m) - 1]} ${Number(d)}, ${y}`;
}

/**
 * One cell of the value-change column: the signed delta vs the baseline
 * snapshot, priced on the standard 10-team full-PPR scale so it compares
 * apples-to-apples in league mode too.
 */
function DeltaCell({
  name,
  delta,
  baselineDate,
}: {
  name: string;
  delta: number | null;
  baselineDate: string;
}) {
  if (delta == null) {
    return (
      <span
        className={styles.deltaNone}
        title={`${name} was not on the ${shortDate(baselineDate)} baseline chart`}
      >
        —
      </span>
    );
  }
  const cls =
    delta > 0 ? styles.deltaUp : delta < 0 ? styles.deltaDown : styles.deltaFlat;
  const signed = delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'unchanged';
  return (
    <span
      className={cls}
      title={`${name} trade value ${direction} ${Math.abs(delta).toFixed(1)} since ${longDate(baselineDate)} (standard 10-team full-PPR scale)`}
      aria-label={`Change since ${longDate(baselineDate)}: ${signed}`}
    >
      {signed}
    </span>
  );
}

function injuryTag(player: PoolPlayer): string | null {
  const info = injuryOf(player);
  if (!info) return null;
  if (info.seasonEnding || info.outNow) return player.injuryStatus ?? 'OUT';
  return null;
}

/**
 * One cell of the "Next 3" column (backlog item 101): the player's next 3
 * played weeks as favorable/tough/neutral matchup chips, priced on the
 * same season-to-date allowed-vs-position averages as the Start/Sit
 * Upcoming column — a difficulty map, not a forecast. At the trade
 * deadline this answers "is his schedule about to get soft or tough"
 * right in the row where the value is priced.
 */
function UpcomingCell({
  player,
  week,
}: {
  player: PoolPlayer;
  week: number;
}) {
  const chips = upcomingMatchupChips(player.team, player.pos, week);
  if (chips.length === 0) {
    return (
      <span
        className={styles.upcomingNone}
        title={`No upcoming matchup ratings for ${player.name}`}
      >
        —
      </span>
    );
  }
  return (
    <span className={styles.upcoming}>
      {chips.map(c =>
        c.rating ? (
          <span
            key={c.week}
            className={
              c.rating.label === 'favorable'
                ? styles.muFav
                : c.rating.label === 'tough'
                  ? styles.muTough
                  : styles.muNeutral
            }
            title={matchupLabel(c.rating, player.pos)}
            aria-label={`Week ${c.week}: ${matchupLabel(c.rating, player.pos)}`}
          >
            W{c.week} {c.opponent}
          </span>
        ) : null,
      )}
    </span>
  );
}

function searchPool(pool: DraftPoolFile, query: string, exclude: Set<string>, limit = 8): PoolPlayer[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const prefix: PoolPlayer[] = [];
  const infix: PoolPlayer[] = [];
  for (const p of pool.players) {
    if (exclude.has(p.id) || !CHART_POSITIONS.has(p.pos)) continue;
    const name = p.name.toLowerCase();
    if (name.startsWith(q)) {
      if (prefix.length < limit) prefix.push(p);
    } else if (name.includes(q)) {
      if (infix.length < limit) infix.push(p);
    }
    if (prefix.length >= limit && infix.length >= limit) break;
  }
  return [...prefix, ...infix].slice(0, limit);
}

function loadStoredIds(key: string, valid: Set<string>): string[] {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids.filter(id => valid.has(id)) : [];
  } catch {
    return [];
  }
}

function storeIds(key: string, ids: string[]): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* storage unavailable: sides still work for this session */
  }
}

/** Multi-player side builder: search the pool, add/remove chart players. */
function SideBuilder({
  idPrefix,
  title,
  pool,
  ids,
  valueByPoolId,
  onAdd,
  onRemove,
}: {
  idPrefix: string;
  title: string;
  pool: DraftPoolFile;
  ids: string[];
  valueByPoolId: Map<string, number>;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(pool.players.map(p => [p.id, p])), [pool]);
  const exclude = useMemo(() => new Set(ids), [ids]);
  const results = useMemo(() => searchPool(pool, query, exclude), [pool, query, exclude]);
  const inputId = `${idPrefix}-player-search`;
  const hintId = `${idPrefix}-search-hint`;

  return (
    <section className={styles.picker} aria-label={`${title} players`}>
      <h3 className={styles.pickerTitle}>{title}</h3>
      {ids.length > 0 && (
        <ul className={styles.sideList} aria-label={`${title} selected players`}>
          {ids.map(id => {
            const p = byId.get(id);
            if (!p) return null;
            return (
              <li key={id} className={styles.sideRow}>
                <span>
                  {p.name} <PosBadge pos={p.pos} />{' '}
                  <span className={styles.sideValue}>{valueByPoolId.get(id) ?? 0}</span>
                </span>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => onRemove(id)}
                  aria-label={`Remove ${p.name} from ${title}`}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <label htmlFor={inputId} className={styles.searchLabel}>
        Add a player to {title.toLowerCase()}
      </label>
      <input
        id={inputId}
        type="search"
        className={styles.searchInput}
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Type a player name…"
        autoComplete="off"
        aria-describedby={hintId}
      />
      <p id={hintId} className={styles.searchHint}>
        Quarterbacks, running backs, wide receivers, and tight ends.
      </p>
      {results.length > 0 && (
        <ul className={styles.searchResults} aria-label={`Matching players for ${title}`}>
          {results.map(p => (
            <li key={p.id}>
              <button
                type="button"
                className={styles.searchResult}
                onClick={() => {
                  onAdd(p.id);
                  setQuery('');
                }}
                aria-label={`Add ${p.name}, ${p.pos}, ${p.team} to ${title}`}
              >
                {p.name} <PosBadge pos={p.pos} />{' '}
                <span className={styles.resultTeam}>{p.team}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TradeValuesPage({
  league,
  pool: poolOverride,
}: {
  league: League;
  /** Test override: a synthetic pool replaces the bundled one. */
  pool?: DraftPoolFile;
}) {
  const [pos, setPos] = useState<PosFilter>('ALL');
  const [pool] = useState(() => poolOverride ?? POOL);
  const live = league.status === 'live' && league.currentWeek != null;

  // The chart prices the deadline question "is his schedule about to get
  // soft or tough" on the same week the matchup columns price elsewhere:
  // the league's current week in league mode, the estimate in guest mode.
  const chartWeek = league.currentWeek ?? currentWeekEstimate();

  // League shape for the chart and the scarcity meter (hoisted so both
  // price the same league). Scoring adjustments hoisted too so the chart
  // memo stays dependency-clean.
  const valueLeague = useMemo(
    () => valueLeagueFor(live ? league : null),
    [live, league],
  );
  const tePremium = (league.tePremiumPerReception ?? 0) > 0;
  const sixPtPassTd = (league.passTdPoints ?? 4) >= 6;
  const vorCfg = useMemo(
    () => vorConfigFor({ tePremium, sixPtPassTd }),
    [tePremium, sixPtPassTd],
  );

  useEffect(() => {
    document.title = 'Trade Value Chart · TraderApe';
    return () => {
      document.title = SITE_TITLE;
    };
  }, []);

  const rows = useMemo(() => {
    return buildTradeValueChart(pool.players, {
      league: valueLeague,
      tePremium,
      sixPtPassTd,
      cfg: vorCfg,
    });
  }, [pool, valueLeague, tePremium, sixPtPassTd, vorCfg]);

  const owners = useMemo(
    () => (live ? leagueOwnerMap(league, pool) : undefined),
    [league, live, pool],
  );

  // League mode: real rostered pool ids price the actual wire. Guest mode
  // omits them and the scarcity meter assumes a typical draft order.
  const rosteredIds = useMemo(
    () => (live && owners ? new Set(owners.keys()) : undefined),
    [live, owners],
  );

  const filtered = useMemo(
    () =>
      pos === 'ALL' ? rows : rows.filter(r => r.player.pos === pos),
    [rows, pos],
  );

  // Value-change deltas vs the baseline chart snapshot. The snapshots are
  // priced on the standard 10-team full-PPR scale, so the delta is shown in
  // both modes; the Value column itself stays league-shaped in league mode.
  const deltaInfo = useMemo(() => tradeValueDeltas(SNAPSHOTS), []);

  const valueByPoolId = useMemo(
    () => new Map(rows.map(r => [r.player.id, r.value] as const)),
    [rows],
  );

  // Auction-dollar translation of the chart (backlog item 83): league mode
  // distributes the league's real total draft spend across chart values;
  // guest mode degrades to the standard $200 × 10 budget. Hidden in live
  // snake leagues, where auction dollars are meaningless.
  const auctionBudget = useMemo(
    () => (live ? leagueAuctionSpend(league) : GUEST_AUCTION_BUDGET),
    [league, live],
  );
  const auctionByPoolId = useMemo(
    () => (auctionBudget != null ? auctionDollars(rows, auctionBudget) : null),
    [rows, auctionBudget],
  );
  const validIds = useMemo(() => new Set(rows.map(r => r.player.id)), [rows]);
  const [sideA, setSideA] = useState<string[]>(() => loadStoredIds(SIDE_A_KEY, validIds));
  const [sideB, setSideB] = useState<string[]>(() => loadStoredIds(SIDE_B_KEY, validIds));

  const addToSide = (side: 'a' | 'b', id: string) => {
    if (side === 'a') {
      setSideA(prev => {
        const next = prev.includes(id) ? prev : [...prev, id];
        storeIds(SIDE_A_KEY, next);
        return next;
      });
    } else {
      setSideB(prev => {
        const next = prev.includes(id) ? prev : [...prev, id];
        storeIds(SIDE_B_KEY, next);
        return next;
      });
    }
  };
  const removeFromSide = (side: 'a' | 'b', id: string) => {
    if (side === 'a') {
      setSideA(prev => {
        const next = prev.filter(x => x !== id);
        storeIds(SIDE_A_KEY, next);
        return next;
      });
    } else {
      setSideB(prev => {
        const next = prev.filter(x => x !== id);
        storeIds(SIDE_B_KEY, next);
        return next;
      });
    }
  };

  const verdict = useMemo(
    () => packageTotals(valueByPoolId, sideA, sideB),
    [valueByPoolId, sideA, sideB],
  );
  const auctionTotals = useMemo(() => {
    if (!auctionByPoolId) return null;
    const sum = (ids: string[]) =>
      ids.reduce((s, id) => s + (auctionByPoolId.get(id) ?? 0), 0);
    return { a: sum(sideA), b: sum(sideB) };
  }, [auctionByPoolId, sideA, sideB]);
  const dollarLine =
    auctionTotals != null && (sideA.length > 0 || sideB.length > 0)
      ? ` ($${auctionTotals.a} vs $${auctionTotals.b} in auction dollars)`
      : '';
  const verdictText =
    sideA.length === 0 && sideB.length === 0
      ? null
      : verdict.winner === 'fair'
        ? `Fair deal — the sides are within ${PACKAGE_FAIR_BAND} value points (${verdict.sideATotal} vs ${verdict.sideBTotal}).${dollarLine}`
        : verdict.winner === 'a'
          ? `Side A wins by ${verdict.diff} value points (${verdict.sideATotal} vs ${verdict.sideBTotal}).${dollarLine}`
          : `Side B wins by ${verdict.diff} value points (${verdict.sideBTotal} vs ${verdict.sideATotal}).${dollarLine}`;

  const tierLabel = (row: TradeValueRow) => `Tier ${row.tier} ${TRADE_VALUE_TIERS[row.tier]}`;

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Trade Value Chart</h1>
          <p className={styles.subtitle}>
            {live
              ? 'Every startable player on one 0–100 scale, priced on your league\u2019s exact shape.'
              : 'Every startable player on one 0–100 scale, priced on the 10-team full-PPR default shape.'}
          </p>
        </div>

        <div className={styles.filterBar} role="group" aria-label="Filter by position">
          {FILTERS.map(f => (
            <button
              key={f}
              type="button"
              className={`${styles.filterButton} ${pos === f ? styles.active : ''}`}
              aria-pressed={pos === f}
              onClick={() => setPos(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <section aria-label={`Trade value chart${pos === 'ALL' ? '' : `, ${pos}s`}`}>
          <div className={styles.tableWrap} aria-live="polite">
            {filtered.length === 0 ? (
              <p className={styles.status} role="status">
                No trade values for this filter.
              </p>
            ) : (
              <table className={styles.table}>
                <caption className={styles.caption}>
                  Trade value chart{pos === 'ALL' ? ' — all positions' : ` — ${pos}`}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Player</th>
                    <th scope="col">Pos</th>
                    <th scope="col">NFL</th>
                    <th scope="col">Value</th>
                    {auctionByPoolId && (
                      <th
                        scope="col"
                        aria-label={`Auction dollar value, from a $${auctionBudget?.toLocaleString()} total budget`}
                      >
                        Auction $
                      </th>
                    )}
                    {deltaInfo && (
                      <th
                        scope="col"
                        aria-label={`Change since ${longDate(deltaInfo.baselineDate)}`}
                      >
                        Δ since {shortDate(deltaInfo.baselineDate)}
                      </th>
                    )}
                    <th scope="col">Tier</th>
                    <th scope="col">Pos rank</th>
                    <th
                      scope="col"
                      aria-label="Next 3 played weeks, matchup difficulty"
                    >
                      Next 3
                    </th>
                    {live && <th scope="col">Owner</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => {
                    const tag = injuryTag(row.player);
                    return (
                      <tr key={row.player.id}>
                        <td>{i + 1}</td>
                        <td>
                          {row.player.name}
                          {tag && <span className={styles.injuryTag}> {tag}</span>}
                        </td>
                        <td>
                          <PosBadge pos={row.player.pos} />
                        </td>
                        <td>{row.player.team}</td>
                        <td className={styles.valueCell}>{row.value.toFixed(1)}</td>
                        {auctionByPoolId && (
                          <td
                            title={`${row.player.name}: $${auctionByPoolId.get(row.player.id) ?? 0} of a $${auctionBudget?.toLocaleString()} auction budget`}
                          >
                            ${auctionByPoolId.get(row.player.id) ?? 0}
                          </td>
                        )}
                        {deltaInfo && (
                          <td>
                            <DeltaCell
                              name={row.player.name}
                              delta={deltaInfo.deltaByPoolId.get(row.player.id) ?? null}
                              baselineDate={deltaInfo.baselineDate}
                            />
                          </td>
                        )}
                        <td>
                          <span className={`${styles.tier} ${styles[`tier${row.tier}`]}`} title={tierLabel(row)}>
                            {TRADE_VALUE_TIERS[row.tier]}
                          </span>
                        </td>
                        <td>
                          {row.player.pos}
                          {row.posRank}
                        </td>
                        <td>
                          <UpcomingCell player={row.player} week={chartWeek} />
                        </td>
                        {live && <td>{owners?.get(row.player.id) ?? 'Free agent'}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <TradeValueMovers snapshots={SNAPSHOTS} rows={rows} owners={owners} />

        <PositionalScarcity rows={rows} valueLeague={valueLeague} rosteredIds={rosteredIds} />

        <section className={styles.evaluator} aria-label="Package trade evaluator">
          <h2 className={styles.sectionTitle}>Package Evaluator</h2>
          <p className={styles.sectionNote}>
            Weigh both sides of a deal by summed chart values — the classic
            &ldquo;stud for depth&rdquo; math. Guidance only; roster fit decides
            the trade.
          </p>
          <div className={styles.sides}>
            <SideBuilder
              idPrefix="trade-values-a"
              title="Side A"
              pool={pool}
              ids={sideA}
              valueByPoolId={valueByPoolId}
              onAdd={id => addToSide('a', id)}
              onRemove={id => removeFromSide('a', id)}
            />
            <SideBuilder
              idPrefix="trade-values-b"
              title="Side B"
              pool={pool}
              ids={sideB}
              valueByPoolId={valueByPoolId}
              onAdd={id => addToSide('b', id)}
              onRemove={id => removeFromSide('b', id)}
            />
          </div>
          <div className={styles.verdictWrap} aria-live="polite">
            {verdictText ? (
              <p className={styles.verdict} role="status">
                {verdictText}
              </p>
            ) : (
              <p className={styles.status}>Add players to both sides to weigh the deal.</p>
            )}
          </div>
        </section>

        <p className={styles.footnote}>
          Method: value over replacement from TraderApe&rsquo;s projected season
          points, replacement level set by the league&rsquo;s roster shape and
          team count, normalized so the top player is 100. Tiers: Elite
          (60+), Core (35+), Starter (15+), Depth (below 15). Deals within{' '}
          {PACKAGE_FAIR_BAND} points are a fair swap. Values compare only
          within one league shape — reprice after trades change the pool.
          {deltaInfo && (
            <>
              {' '}Δ compares the player&rsquo;s value on the standard 10-team
              full-PPR scale to the {longDate(deltaInfo.baselineDate)}{' '}
              baseline; the column appears once two chart snapshots exist.
            </>
          )}
          {auctionByPoolId && (
            <>
              {' '}Auction $ distributes{' '}
              {live
                ? `your league\u2019s actual draft spend ($${auctionBudget?.toLocaleString()} total)`
                : 'a standard $200 \u00d7 10 budget ($2,000 total)'}{' '}
              across chart values proportionally, so the Package Evaluator
              weighs deals in auction dollars too.
            </>
          )}
          {' '}Next 3 shows each player&rsquo;s next three played weeks as
          matchup-difficulty chips (favorable/tough/neutral) on the same
          season-to-date averages as the weekly matchup ratings — a
          difficulty map, not a forecast — so deadline deals price the
          schedule ahead, not just the value today.
        </p>
      </div>
    </div>
  );
}

