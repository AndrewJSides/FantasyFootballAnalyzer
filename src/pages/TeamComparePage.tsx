// Team head-to-head comparison (backlog item 73): pick any two fantasy
// teams and compare them side by side on TraderApe's own metrics — record,
// points, power rating, luck, all-play, team grades, playoff odds, series
// history, and remaining schedule. League mode only (no teams without a
// synced league).

import { useEffect, useMemo, useState } from 'react';
import type { League } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { buildTeamComparison, type CompareCell } from '@/utils/teamCompare';
import { playoffRace } from '@/utils/playoffOdds';
import { DataAsOf } from '@/components/DataAsOf';
import { SITE_TITLE } from '../utils/siteTitle';
import styles from './TeamComparePage.module.css';

interface TeamComparePageProps {
  league: League;
  /** Test override: a synthetic pool replaces the bundled one. */
  pool?: DraftPoolFile;
}

function EdgeMark({ edge }: { edge: CompareCell['edge'] }) {
  if (edge === 'none' || edge === 'tie') return null;
  return (
    <span className={styles.edgeMark} aria-hidden="true">
      {edge === 'a' ? '◀' : '▶'}
    </span>
  );
}

export function TeamComparePage({ league, pool: poolOverride }: TeamComparePageProps) {
  const pool = poolOverride ?? POOL;
  const teams = league.teams;
  const myTeam = teams.find(t => t.isMyTeam);
  const defaultA = myTeam?.id ?? teams[0]?.id ?? '';
  // Default B to my team's next opponent when the sync fetched a future
  // schedule, else the first team that isn't A.
  const nextOpponent = useMemo(() => {
    if (!myTeam) return null;
    const entry = playoffRace(league).find(e => e.teamId === myTeam.id);
    return entry?.remaining[0]?.opponentId ?? null;
  }, [league, myTeam]);
  const defaultB =
    (nextOpponent && nextOpponent !== defaultA
      ? nextOpponent
      : teams.find(t => t.id !== defaultA)?.id) ?? '';

  const [aId, setAId] = useState(defaultA);
  const [bId, setBId] = useState(defaultB);

  const comparison = useMemo(
    () => (aId && bId ? buildTeamComparison(league, pool, aId, bId) : null),
    [league, pool, aId, bId],
  );

  useEffect(() => {
    document.title = 'Team Compare · TraderApe';
    return () => {
      document.title = SITE_TITLE;
    };
  }, []);

  if (teams.length < 2) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Team Compare</h1>
        <p>This league needs at least two teams to compare.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Team Compare</h1>
        <p className={styles.subtitle}>
          {comparison ? comparison.edgeSummary : 'Pick two different teams'}
        </p>
      </div>

      <div className={styles.pickRow}>
        <label className={styles.pickLabel}>
          Team A
          <select
            className={styles.pickSelect}
            value={aId}
            onChange={e => setAId(e.target.value)}
          >
            {teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.pickLabel}>
          Team B
          <select
            className={styles.pickSelect}
            value={bId}
            onChange={e => setBId(e.target.value)}
          >
            {teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div aria-live="polite">
        {!comparison ? (
          <p className={styles.notice}>
            Pick two different teams to see the side-by-side comparison.
          </p>
        ) : (
          <table
            className={styles.compareTable}
            aria-label={`Team comparison, ${comparison.aName} vs ${comparison.bName}`}
          >
            <thead>
              <tr>
                <th scope="col">
                  <span className={styles.visuallyHidden}>Metric</span>
                </th>
                <th scope="col" className={styles.teamHead}>
                  {comparison.aName}
                </th>
                <th scope="col" className={styles.teamHead}>
                  {comparison.bName}
                </th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map(row => (
                <tr key={row.label}>
                  <th scope="row" className={styles.rowLabel}>
                    {row.label}
                  </th>
                  <td
                    className={`${styles.cell} ${row.edge === 'a' ? styles.winner : ''}`}
                    title={row.aTitle}
                    aria-label={
                      row.aTitle
                        ? `${row.label}, ${comparison.aName}: ${row.a}. ${row.aTitle}`
                        : `${row.label}, ${comparison.aName}: ${row.a}`
                    }
                  >
                    <EdgeMark edge={row.edge === 'a' ? 'a' : 'none'} />
                    {row.a}
                  </td>
                  <td
                    className={`${styles.cell} ${row.edge === 'b' ? styles.winner : ''}`}
                    title={row.bTitle}
                    aria-label={
                      row.bTitle
                        ? `${row.label}, ${comparison.bName}: ${row.b}. ${row.bTitle}`
                        : `${row.label}, ${comparison.bName}: ${row.b}`
                    }
                  >
                    {row.b}
                    <EdgeMark edge={row.edge === 'b' ? 'b' : 'none'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <DataAsOf syncedAt={league.pinSyncedAt} />
      <p className={styles.method}>
        Every metric is TraderApe&apos;s own: record and points from the
        owner&apos;s latest sync, power rating from the same shrunk-rating
        model the Playoff Race sims run on, luck from actual vs expected
        wins, all-play from completed-week matchups, team grades from the
        season-outlook engine, and playoff odds from the 10,000-sim Monte
        Carlo (the model&apos;s verdict, not league-official). Guidance
        only: nothing here changes any lineup.
      </p>
    </div>
  );
}

export default TeamComparePage;
