// Dynasty Rankings page (backlog item 177): the top 100 skill players by
// TraderApe's own dynasty value — bundled pool full-PPR season projection
// priced through a per-position age curve — with the owning team named in
// league mode. The board is the long-term counterpart to the redraft
// Weekly Rankings: a 28-year-old RB and a 23-year-old RB with the same
// projection are equals in redraft and very different here.
//
// The value is TraderApe's own model (src/utils/dynastyValue.ts) over its
// own data. It deliberately does NOT use the pool's bundled dynastyRank
// field, which is joined from a FantasyPros dynasty snapshot at
// pool-build time.

import { useMemo, useState } from 'react';
import type { League, Player } from '@/types';
import { POOL } from '@/data/draftPool';
import { PLAYER_AGES } from '@/data/playerAges';
import type { DraftPoolFile } from '@/types/draft';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import {
  buildDynastyRankings,
  DYNASTY_POSITIONS,
  type DynastyPosition,
  type DynastyRow,
} from '@/utils/dynastyValue';
import { PosBadge } from '@/components/PosBadge';
import { NflTeamLabel } from '@/components/NflTeamLabel';
import styles from './DynastyRankingsPage.module.css';

interface DynastyRankingsPageProps {
  league: League;
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
  /** Ages override (tests); defaults to the generated age file. */
  ages?: Record<string, number>;
}

type Filter = 'ALL' | DynastyPosition;

const FILTERS: Filter[] = ['ALL', ...DYNASTY_POSITIONS];
const POSITION_LIMIT = 50;

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return '—';
}

function rowAriaLabel(row: DynastyRow): string {
  const age = row.age === null ? 'age unknown' : `age ${row.age}`;
  return (
    `${row.player.name} (${row.player.pos}, ${row.player.team ?? 'FA'}), ${age}: ` +
    `${row.seasonProj.toFixed(1)} projected full-PPR points, ` +
    `${row.value.toFixed(1)} dynasty value, dynasty rank ${row.dynastyRank}, ` +
    `redraft rank ${row.redraftRank}`
  );
}

export function DynastyRankingsPage({
  league,
  pool = POOL,
  ages = PLAYER_AGES.ages,
}: DynastyRankingsPageProps) {
  const [filter, setFilter] = useState<Filter>('ALL');

  // League mode: name the owning team per pool player. Guest mode: no
  // rosters — the board shows owner-free.
  const teamByPoolId = useMemo(() => {
    if (!league || league.isGuest) return undefined;
    const index = indexPool(pool);
    const map = new Map<string, string>();
    for (const team of league.teams) {
      for (const p of team.roster ?? []) {
        const resolved = resolvePoolPlayer(p as Player, index);
        if (!resolved) continue;
        map.set(resolved.id, team.name);
      }
    }
    return map;
  }, [league, pool]);

  const rows = useMemo(
    () =>
      buildDynastyRankings({
        poolPlayers: pool.players,
        agesBySleeperId: ages,
        teamByPoolId,
        ...(filter === 'ALL'
          ? {}
          : { positions: [filter], limit: POSITION_LIMIT }),
      }),
    [pool, ages, teamByPoolId, filter],
  );

  const isLeague = !!league && !league.isGuest;
  const caption =
    filter === 'ALL'
      ? 'Top 100 skill players by dynasty value'
      : `Top ${POSITION_LIMIT} ${filter}s by dynasty value`;
  const redraftScope = filter === 'ALL' ? 'overall' : 'position';

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Dynasty Rankings</h1>
      <p className={styles.lede}>
        Long-term value: this season&apos;s full-PPR projection priced
        through an age curve, so a young player with years of peak ahead
        ranks above an older player with the same projection. The
        keeper/dynasty read next to the redraft board — use it for
        trades involving future picks and for deciding who is worth
        holding through a rebuild.
      </p>

      <div className={styles.chips} role="group" aria-label="Position">
        {FILTERS.map(f => (
          <button
            key={f}
            type="button"
            className={f === filter ? styles.chipOn : styles.chip}
            aria-pressed={f === filter}
            onClick={() => setFilter(f)}
          >
            {f === 'ALL' ? 'All' : f}
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {rows.length === 0 ? (
          <p className={styles.note}>
            No dynasty values to show for this filter yet.
          </p>
        ) : (
          <div className={styles.tableWrapper}>
            <table
              className={styles.table}
              aria-label={`Dynasty rankings, ${filter === 'ALL' ? 'all positions' : filter}`}
            >
              <caption className={styles.caption}>{caption}</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Rank</span>
                  </th>
                  <th scope="col">Player</th>
                  <th scope="col">Pos</th>
                  <th scope="col">NFL</th>
                  <th scope="col">Age</th>
                  <th scope="col">
                    <abbr title="Bundled pool full-PPR season projection">
                      Proj
                    </abbr>
                  </th>
                  <th scope="col">
                    <abbr title="Dynasty value: season projection × the per-position age factor">
                      Dynasty Val
                    </abbr>
                  </th>
                  <th scope="col">
                    <abbr
                      title={`Redraft ${redraftScope} rank from the bundled pool`}
                    >
                      Redraft
                    </abbr>
                  </th>
                  <th scope="col">
                    <abbr title="Dynasty rank minus redraft rank, in spots: positive means dynasty values him higher than redraft does">
                      Δ
                    </abbr>
                  </th>
                  {isLeague && <th scope="col">Owner</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.player.id}>
                    <td>{row.dynastyRank}</td>
                    <th scope="row" aria-label={rowAriaLabel(row)}>
                      {row.player.name}
                    </th>
                    <td>
                      <PosBadge pos={row.player.pos} />
                    </td>
                    <td>
                      <NflTeamLabel team={row.player.team ?? 'FA'} />
                    </td>
                    <td>{row.age ?? '—'}</td>
                    <td>{row.seasonProj.toFixed(1)}</td>
                    <td>{row.value.toFixed(1)}</td>
                    <td>{row.redraftRank > 0 ? row.redraftRank : '—'}</td>
                    <td>{formatDelta(row.rankDelta)}</td>
                    {isLeague && <td>{row.rosteredBy ?? 'Free agent'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className={styles.footnote}>
        Method: dynasty value = the bundled pool&apos;s full-PPR season
        projection × a per-position age factor. The factor holds a player
        at full value through his peak window (RB to 25, WR/TE to 27, QB
        to 30), ramps the youngest players up to it, then declines him
        linearly toward a floor as he ages out — RB falls fastest, QB
        slowest. Ages are as of Sep 1, 2026, from Sleeper&apos;s free
        public player data; a player with no known age prices at his raw
        projection and shows — for age. Δ compares the dynasty rank
        against the redraft {redraftScope} rank: + means dynasty values
        him higher than redraft does. TraderApe&apos;s own model — not
        another site&apos;s dynasty ranks.
      </p>
    </div>
  );
}
