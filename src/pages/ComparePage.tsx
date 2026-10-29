// Head-to-head player comparison (backlog item 6): pick any two players and
// see season points, recent trend, this week's TraderApe projection, matchup,
// rest-of-season outlook, and VOR value side by side. Works in league mode
// (priced on the league's scoring) and guest mode (10-team full-PPR default).
import { useEffect, useMemo, useState } from 'react';
import { PosBadge } from '@/components';
import { fetchWeeklyPprPoints, type WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { POOL } from '@/data/draftPool';
import type { League } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import {
  comparePlayers,
  type CompareContext,
  type CompareResult,
} from '@/utils/playerCompare';
import { currentWeekEstimate, matchupDataWeeks } from '@/utils/matchupRating';
import { vorConfigFor } from '@/utils/projectionValues';
import { DEFAULT_MANUAL_SHAPE, valueLeagueFor } from '@/utils/tradeAnalysis';
import styles from './ComparePage.module.css';

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const COMPARE_A_KEY = 'compare-player-a';
const COMPARE_B_KEY = 'compare-player-b';

function searchPool(query: string, exclude: Set<string>, limit = 8): PoolPlayer[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const prefix: PoolPlayer[] = [];
  const infix: PoolPlayer[] = [];
  for (const p of POOL.players) {
    if (exclude.has(p.id) || !SKILL_POSITIONS.has(p.pos)) continue;
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

function loadStoredId(key: string): string | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const valid = new Set(POOL.players.map(p => p.id));
    return valid.has(raw) ? raw : null;
  } catch {
    return null;
  }
}

function PlayerPicker({
  idPrefix,
  title,
  picked,
  excludeId,
  onPick,
  onClear,
}: {
  idPrefix: string;
  title: string;
  picked: PoolPlayer | null;
  excludeId: string | null;
  onPick: (p: PoolPlayer) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const exclude = useMemo(() => new Set(excludeId ? [excludeId] : []), [excludeId]);
  const results = useMemo(() => searchPool(query, exclude), [query, exclude]);
  const inputId = `${idPrefix}-player-search`;
  const hintId = `${idPrefix}-search-hint`;

  return (
    <section className={styles.picker} aria-label={title}>
      <h2 className={styles.pickerTitle}>{title}</h2>
      {picked ? (
        <div className={styles.pickedRow}>
          <span>
            {picked.name} <PosBadge pos={picked.pos} />{' '}
            <span className={styles.pickedTeam}>{picked.team}</span>
          </span>
          <button type="button" className={styles.removeButton} onClick={onClear} aria-label={`Clear ${title} selection`}>
            Change
          </button>
        </div>
      ) : (
        <>
          <label htmlFor={inputId} className={styles.searchLabel}>
            Search for {title.toLowerCase()}
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
                      onPick(p);
                      setQuery('');
                    }}
                    aria-label={`Compare ${p.name}, ${p.pos}, ${p.team}`}
                  >
                    {p.name} <PosBadge pos={p.pos} />{' '}
                    <span className={styles.resultTeam}>{p.team}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

type WeeklyState = 'loading' | 'ready' | 'error';

export function ComparePage({ league }: { league: League }) {
  const [idA, setIdA] = useState<string | null>(() => loadStoredId(COMPARE_A_KEY));
  const [idB, setIdB] = useState<string | null>(() => loadStoredId(COMPARE_B_KEY));
  const [weekly, setWeekly] = useState<WeeklyPprPoints | undefined>(undefined);
  const [weeklyState, setWeeklyState] = useState<WeeklyState>('loading');

  useEffect(() => {
    try {
      if (idA) sessionStorage.setItem(COMPARE_A_KEY, idA);
      else sessionStorage.removeItem(COMPARE_A_KEY);
    } catch { /* private mode: in-memory state still works */ }
  }, [idA]);
  useEffect(() => {
    try {
      if (idB) sessionStorage.setItem(COMPARE_B_KEY, idB);
      else sessionStorage.removeItem(COMPARE_B_KEY);
    } catch { /* private mode: in-memory state still works */ }
  }, [idB]);

  const week = league.currentWeek ?? currentWeekEstimate();
  // Score completed weeks only; the in-progress week's partial stats would
  // halve a player's pace (same convention as Start/Sit).
  const loadWeekly = () => {
    setWeeklyState('loading');
    fetchWeeklyPprPoints(league.season, week - 1)
      .then(r => {
        if (!r || r.weeks.length === 0) setWeeklyState('error');
        else {
          setWeekly(r);
          setWeeklyState('ready');
        }
      })
      .catch(() => setWeeklyState('error'));
  };
  // Keyed on season/week only: loadWeekly re-runs whenever they change.
  useEffect(loadWeekly, [league.season, week]);

  const byId = useMemo(() => new Map(POOL.players.map(p => [p.id, p])), []);
  const playerA = idA ? byId.get(idA) ?? null : null;
  const playerB = idB ? byId.get(idB) ?? null : null;

  const result: CompareResult | null = useMemo(() => {
    if (!playerA || !playerB || weeklyState !== 'ready') return null;
    const valueLeague = valueLeagueFor(league);
    const ctx: CompareContext = {
      currentWeek: week,
      scoring: league.scoringType,
      slots: league.rosterSlots ?? DEFAULT_MANUAL_SHAPE,
      teamCount: league.totalTeams || 10,
      season: league.season,
      valueLeague,
      vorCfg: vorConfigFor({ tePremium: (league.tePremiumPerReception ?? 0) > 0 }),
    };
    return comparePlayers(playerA, playerB, weekly, ctx);
  }, [playerA, playerB, weekly, weeklyState, league, week]);

  const [dataStart, dataEnd] = matchupDataWeeks();

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Compare Players</h1>
          <p className={styles.subtitle}>
            Pick any two players — season numbers, this week's projection, matchup,
            rest-of-season outlook, and trade value, side by side.
          </p>
        </div>

        <div className={styles.pickers}>
          <PlayerPicker
            idPrefix="compare-a"
            title="Player A"
            picked={playerA}
            excludeId={idB}
            onPick={p => setIdA(p.id)}
            onClear={() => setIdA(null)}
          />
          <PlayerPicker
            idPrefix="compare-b"
            title="Player B"
            picked={playerB}
            excludeId={idA}
            onPick={p => setIdB(p.id)}
            onClear={() => setIdB(null)}
          />
        </div>

        {weeklyState === 'loading' && (
          <p className={styles.status} role="status">
            Loading weekly stats…
          </p>
        )}
        {weeklyState === 'error' && (
          <p className={styles.status} role="alert">
            Couldn't load weekly stats.{' '}
            <button type="button" className={styles.retryButton} onClick={loadWeekly}>
              Retry
            </button>
          </p>
        )}

        {result && (
          <section aria-label="Comparison results">
            <p className={styles.verdict} aria-live="polite">
              {result.verdict}
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className={styles.caption}>
                  Head-to-head comparison: {result.metricsA.player.name} vs{' '}
                  {result.metricsB.player.name}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className={styles.srOnly}>Metric</span>
                    </th>
                    <th scope="col">
                      {result.metricsA.player.name}{' '}
                      <PosBadge pos={result.metricsA.player.pos} />
                    </th>
                    <th scope="col">
                      {result.metricsB.player.name}{' '}
                      <PosBadge pos={result.metricsB.player.pos} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map(r => (
                    <tr key={r.key}>
                      <th scope="row">{r.label}</th>
                      <td
                        className={r.winner === 'A' ? styles.winner : undefined}
                        aria-label={r.winner === 'A' && r.margin ? `${r.a}. ${r.margin}` : r.a ?? undefined}
                      >
                        {r.a ?? '—'}
                        {r.winner === 'A' && <span className={styles.leadTag} aria-hidden="true"> ✓</span>}
                      </td>
                      <td
                        className={r.winner === 'B' ? styles.winner : undefined}
                        aria-label={r.winner === 'B' && r.margin ? `${r.b}. ${r.margin}` : r.b ?? undefined}
                      >
                        {r.b ?? '—'}
                        {r.winner === 'B' && <span className={styles.leadTag} aria-hidden="true"> ✓</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.footnote}>
              Week {week} projections come from TraderApe's model (recency-weighted
              form, matchup blend, regression to baseline). Matchup ratings are
              priced on the opponent's fantasy points allowed per position over
              weeks {dataStart}–{dataEnd}; the rest-of-season outlook blends the
              player's pace with his season projection. VOR values are priced
              on {league.totalTeams || 10}-team {league.scoringType} scoring.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
