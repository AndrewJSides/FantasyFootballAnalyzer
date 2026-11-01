import { useMemo, useState } from 'react';
import type { League } from '@/types';
import { POOL } from '@/data/draftPool';
import {
  dropOrHoldVerdicts,
  MAX_DROP_ROWS,
  type DropVerdict,
} from '@/utils/dropOrHold';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './DropCandidates.module.css';

interface DropCandidatesProps {
  league: League;
}

const VERDICT_LABEL: Record<DropVerdict, string> = {
  drop: 'Safe to drop',
  regret: 'Droppable, with regret',
  hold: 'Hold for now',
};

// Drop or Hold: price the whole bench for cuttability before waivers run.
// The Add/Drop Moves panel pairs a drop with a pickup; this answers the
// standalone "can I cut anyone" question with per-player verdicts.
export function DropCandidates({ league }: DropCandidatesProps) {
  const myTeam = league.teams.find(t => t.isMyTeam) ?? league.teams[0];
  const [teamId, setTeamId] = useState<string>(myTeam?.id ?? '');
  const team = league.teams.find(t => t.id === teamId) ?? myTeam;

  const rows = useMemo(() => {
    if (!team) return [];
    return dropOrHoldVerdicts(league, team, POOL);
  }, [league, team]);

  const hasRoster = (team?.roster?.length ?? 0) > 0;
  const droppable = rows.filter(r => r.verdict !== 'hold');

  return (
    <section className={styles.panel} aria-label="Drop or hold">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Drop or Hold</h2>
        <div className={styles.teamPick}>
          <label htmlFor="dropOrHoldTeam" className={styles.teamLabel}>
            Verdicts for
          </label>
          <select
            id="dropOrHoldTeam"
            className="input"
            value={team?.id ?? ''}
            onChange={e => setTeamId(e.target.value)}
            title="Show drop-or-hold verdicts for this team's roster"
          >
            {league.teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* The team select and the verdict list swap in place with no
          navigation; announce the re-priced list politely. */}
      <div aria-live="polite">
        {!hasRoster ? (
          <p className={styles.note}>
            No roster data for {team?.name ?? 'this team'} — re-sync from
            /admin to see drop-or-hold verdicts.
          </p>
        ) : droppable.length > 0 ? (
          <table
            className={styles.verdicts}
            aria-label={`Drop or hold verdicts for ${team?.name}`}
          >
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Verdict</th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.player.id}>
                  <td>
                    <span className={styles.playerName}>{row.player.name}</span>
                    <span className={styles.playerMeta}>
                      <PosBadge pos={row.player.pos} />{' '}
                      <NflTeamLabel team={row.player.team} />
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.verdict} ${styles[row.verdict]}`}
                      aria-label={`${VERDICT_LABEL[row.verdict]}: ${row.player.name}`}
                    >
                      {VERDICT_LABEL[row.verdict]}
                    </span>
                  </td>
                  <td>
                    <ul
                      className={styles.reasons}
                      aria-label={`Why ${row.player.name} is ${VERDICT_LABEL[row.verdict].toLowerCase()}`}
                    >
                      {row.reasons.map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.note}>
            Nobody on {team?.name}&rsquo;s bench grades as droppable — hold
            everyone.
          </p>
        )}
      </div>

      <p className={styles.footnote}>
        Guidance only — no roster moves happen here. Verdicts come from this
        league&rsquo;s replacement levels (VOR from the bundled full-PPR
        projections), your positional depth chart, injury designations, and
        whether the bye already passed. Top {MAX_DROP_ROWS} shown, most
        cuttable first.
      </p>
    </section>
  );
}
