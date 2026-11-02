import { useMemo, useState } from 'react';
import type { League } from '@/types';
import { DataAsOf } from '@/components/DataAsOf';
import { PosBadge } from '@/components/PosBadge';
import {
  buildLeagueWire,
  filterWire,
  wireMoveLabel,
  wireTeams,
  type WireRow,
} from '@/utils/leagueWire';
import styles from './WirePage.module.css';

// League Wire: every add/drop move across the league, newest first, from the
// synced per-team transactions (waiver claims + free-agent pickups).
// Trades live on the Trades page.

const DATE_FMT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', DATE_FMT);
}

function PlayerList({ players }: { players: WireRow['adds'] }) {
  return (
    <>
      {players.map((p, i) => (
        <span key={`${p.id}-${i}`} className={styles.player}>
          <PosBadge pos={p.position} />
          {p.name}
          <span className={styles.playerTeam}>{p.team}</span>
        </span>
      ))}
    </>
  );
}

export function WirePage({ league }: { league: League }) {
  const rows = useMemo(() => buildLeagueWire(league), [league]);
  const teams = useMemo(() => wireTeams(rows), [rows]);
  const [teamId, setTeamId] = useState('');
  const [moveType, setMoveType] = useState<'' | 'waiver' | 'free_agent'>('');
  const filtered = useMemo(
    () => filterWire(rows, { teamId, type: moveType }),
    [rows, teamId, moveType],
  );

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>League Wire</h1>
          <DataAsOf syncedAt={league.pinSyncedAt} />
          <p className={styles.subtitle}>
            Every waiver claim and free-agent move across the league
          </p>
        </div>

        {rows.length === 0 ? (
          <div className={styles.empty}>
            <h2>No transactions yet</h2>
            <p>
              Add/drop moves appear here once the league's transactions sync.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.filters}>
              <div className={styles.filter}>
                <label htmlFor="wireTeam" className={styles.filterLabel}>
                  Team
                </label>
                <select
                  id="wireTeam"
                  className="input"
                  value={teamId}
                  onChange={e => setTeamId(e.target.value)}
                >
                  <option value="">All teams</option>
                  {teams.map(t => (
                    <option key={t.teamId} value={t.teamId}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.filter}>
                <label htmlFor="wireType" className={styles.filterLabel}>
                  Move type
                </label>
                <select
                  id="wireType"
                  className="input"
                  value={moveType}
                  onChange={e => setMoveType(e.target.value as '' | 'waiver' | 'free_agent')}
                >
                  <option value="">All moves</option>
                  <option value="waiver">Waiver claims</option>
                  <option value="free_agent">Free-agent pickups</option>
                </select>
              </div>
            </div>

            <p aria-live="polite" className={styles.count}>
              {filtered.length === 1 ? '1 move' : `${filtered.length} moves`}
            </p>

            {filtered.length === 0 ? (
              <div className={styles.empty}>
                <h2>No moves match</h2>
                <p>Widen the filters to see the rest of the wire.</p>
              </div>
            ) : (
              <ul aria-label="League transactions, newest first" className={styles.list}>
                {filtered.map(row => (
                  <li key={row.id} className={styles.item}>
                    <div className={styles.meta}>
                      <span className={styles.team}>{row.teamName}</span>
                      <span className={styles.when}>
                        Week {row.week} · {formatDate(row.timestamp)}
                      </span>
                    </div>
                    <div className={styles.moves}>
                      {row.adds.length > 0 && (
                        <div className={styles.move}>
                          <span className={styles.action}>
                            {wireMoveLabel(row)}
                            {row.type === 'waiver' &&
                              typeof row.waiverBudgetSpent === 'number' &&
                              row.waiverBudgetSpent > 0 &&
                              ` for $${row.waiverBudgetSpent}`}
                          </span>
                          <PlayerList players={row.adds} />
                        </div>
                      )}
                      {row.drops.length > 0 && (
                        <div className={styles.move}>
                          <span className={styles.action}>dropped</span>
                          <PlayerList players={row.drops} />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
