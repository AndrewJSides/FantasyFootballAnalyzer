import { useMemo, useState } from 'react';
import type { League } from '@/types';
import { POOL } from '@/data/draftPool';
import { teamProfiles } from '@/utils/tradeFinder';
import { addDropSuggestions, MAX_SUGGESTIONS } from '@/utils/addDropSuggest';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './AddDropMoves.module.css';

interface AddDropMovesProps {
  league: League;
}

// Add/Drop moves: pair each selected team's most cuttable bench player with
// the best available waiver target that beats him by a clear VOR margin.
// Cuttable = below projected starter demand at the position (each FLEX
// counts as one more slot for RB/WR/TE), so a suggested drop never touches
// the projected starters. Guidance only — no roster moves happen here.
export function AddDropMoves({ league }: AddDropMovesProps) {
  const myTeam = league.teams.find(t => t.isMyTeam) ?? league.teams[0];
  const [teamId, setTeamId] = useState<string>(myTeam?.id ?? '');
  const team = league.teams.find(t => t.id === teamId) ?? myTeam;

  const profiles = useMemo(() => teamProfiles(league, POOL), [league]);
  const moves = useMemo(() => {
    if (!team) return [];
    const profile = profiles.find(p => p.team.id === team.id);
    return addDropSuggestions(league, team, profile, POOL, MAX_SUGGESTIONS);
  }, [league, team, profiles]);

  const hasRoster = (team?.roster?.length ?? 0) > 0;

  return (
    <section className={styles.panel} aria-label="Add/Drop moves">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>Add/Drop Moves</h2>
        <div className={styles.teamPick}>
          <label htmlFor="addDropTeam" className={styles.teamLabel}>
            Moves for
          </label>
          <select
            id="addDropTeam"
            className="input"
            value={team?.id ?? ''}
            onChange={e => setTeamId(e.target.value)}
            title="Suggest add/drop moves for this team's bench and the waiver wire"
          >
            {league.teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* The team select and the move list swap in place with no
          navigation; announce the re-priced list politely. */}
      <div aria-live="polite">
        {!hasRoster ? (
          <p className={styles.note}>
            No roster data for {team?.name ?? 'this team'} — re-sync from
            /admin to see add/drop moves.
          </p>
        ) : moves.length > 0 ? (
          <table className={styles.moves} aria-label={`Suggested add/drop moves for ${team?.name}`}>
            <thead>
              <tr>
                <th scope="col">Add</th>
                <th scope="col">Drop</th>
                <th scope="col">Net VOR</th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {moves.map(move => (
                <tr key={`${move.add.id}-${move.drop.id}`}>
                  <td>
                    <span className={styles.playerName}>{move.add.name}</span>
                    <span className={styles.playerMeta}>
                      <PosBadge pos={move.add.pos} />{' '}
                      <NflTeamLabel team={move.add.team} />
                    </span>
                  </td>
                  <td>
                    <span className={styles.playerName}>{move.drop.name}</span>
                    <span className={styles.playerMeta}>
                      <PosBadge pos={move.drop.pos} />{' '}
                      <NflTeamLabel team={move.drop.team} />
                    </span>
                  </td>
                  <td
                    className={styles.gain}
                    aria-label={`Net value over replacement gain of ${move.gain} for adding ${move.add.name} and dropping ${move.drop.name}`}
                  >
                    +{move.gain}
                  </td>
                  <td>
                    <ul
                      className={styles.reasons}
                      aria-label={`Why add ${move.add.name} and drop ${move.drop.name}`}
                    >
                      {move.reasons.map((reason, i) => (
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
            Nothing on the waiver wire beats {team?.name}&rsquo;s bench by
            enough to matter — no add/drop moves worth making.
          </p>
        )}
      </div>

      <p className={styles.footnote}>
        Guidance only — no roster moves happen here. A drop is only ever a
        bench player below projected starter demand (a FLEX slot counts as
        one more starter for RB/WR/TE), and values are VOR from the
        bundled full-PPR projections against this league&rsquo;s
        replacement levels.
      </p>
    </section>
  );
}
