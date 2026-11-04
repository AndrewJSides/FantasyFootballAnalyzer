import { useEffect, useMemo, useState } from 'react';
import type { League } from '@/types';
import type { DraftPoolFile } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';
import { currentWeekEstimate } from '@/utils/matchupRating';
import { teamProfiles } from '@/utils/tradeFinder';
import {
  ASSUMED_FAAB_BUDGET,
  availableTargets,
  faabNorms,
  faabSpentBy,
  suggestBid,
} from '@/utils/faabGuidance';
import { PosBadge } from './PosBadge';
import { NflTeamLabel } from './NflTeamLabel';
import styles from './FaabGuidance.module.css';

interface FaabGuidanceProps {
  league: League;
  /** Bundled pool override (tests); defaults to the real pool. */
  pool?: DraftPoolFile;
}

// FAAB bid guidance: what should a waiver claim cost? Prices the most
// valuable available players (bundled pool, nobody's roster) against this
// league's own spending norms, the target's value, and the selected team's
// positional need. Guidance only — nothing is bid or spent here.
export function FaabGuidance({ league, pool = POOL }: FaabGuidanceProps) {
  const myTeam = league.teams.find(t => t.isMyTeam) ?? league.teams[0];
  const [teamId, setTeamId] = useState<string>(myTeam?.id ?? '');
  const team = league.teams.find(t => t.id === teamId) ?? myTeam;

  const norms = useMemo(() => faabNorms(league, pool), [league, pool]);
  const profiles = useMemo(() => teamProfiles(league, pool), [league, pool]);
  const targets = useMemo(() => availableTargets(league, pool, 8), [league, pool]);

  // Item-135 Sleeper projection: one no-auth request shared across the
  // target rows; silent degrade to dashes on failure — the list never
  // waits on it, and bid ranges price on league norms regardless.
  const [week] = useState(() => currentWeekEstimate());
  const season = league.season ?? pool.season;
  const [sleeperProjections, setSleeperProjections] = useState<
    Record<string, number> | undefined
  >(undefined);
  const [sleeperReady, setSleeperReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchSleeperWeekProjections(season, week)
      .then(data => {
        if (!cancelled) {
          setSleeperProjections(data);
          setSleeperReady(true);
        }
      })
      .catch(() => {
        // Silent degrade: dashes, the bid ranges still render.
      });
    return () => {
      cancelled = true;
    };
  }, [season, week]);

  const suggestions = useMemo(() => {
    if (!team || !norms) return [];
    return targets.map(target => ({
      target,
      suggestion: suggestBid(target, team, profiles, norms),
    }));
  }, [targets, team, profiles, norms]);

  const spent = team ? faabSpentBy(team) : 0;

  if (!norms) {
    return (
      <section className={styles.panel} aria-label="FAAB bid guidance">
        <h2 className={styles.heading}>FAAB Bid Guidance</h2>
        <p className={styles.note}>
          No FAAB bids recorded in this league's synced transactions yet, so
          there's no going rate to price against. Guidance appears once waiver
          claims with bids sync.
        </p>
      </section>
    );
  }

  const posOrder = ['QB', 'RB', 'WR', 'TE'] as const;
  const posNorms = posOrder
    .map(pos => ({ pos, norm: norms.byPosition[pos] }))
    .filter(entry => entry.norm !== undefined);

  return (
    <section className={styles.panel} aria-label="FAAB bid guidance">
      <div className={styles.headRow}>
        <h2 className={styles.heading}>FAAB Bid Guidance</h2>
        <div className={styles.teamPick}>
          <label htmlFor="faabTeam" className={styles.teamLabel}>
            Pricing for
          </label>
          <select
            id="faabTeam"
            className="input"
            value={team?.id ?? ''}
            onChange={e => setTeamId(e.target.value)}
            title="Price bid ranges for this team's positional need and remaining budget"
          >
            {league.teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* League norms: the going rate this league actually pays. */}
      <div className={styles.norms} aria-label="League FAAB norms">
        <div className={styles.norm}>
          <span className={styles.normLabel}>Median winning bid</span>
          <span className={styles.normValue}>${norms.medianBid}</span>
        </div>
        <div className={styles.norm}>
          <span className={styles.normLabel}>Claims with bids</span>
          <span className={styles.normValue}>{norms.claimCount}</span>
        </div>
        <div className={styles.norm}>
          <span className={styles.normLabel}>Biggest bid</span>
          <span className={styles.normValue}>${norms.maxBid}</span>
        </div>
        {posNorms.map(({ pos, norm }) => (
          <div className={styles.norm} key={pos}>
            <span className={styles.normLabel}>{pos} median</span>
            <span
              className={styles.normValue}
              title={`${norm!.count} ${pos} claim${norm!.count === 1 ? '' : 's'} with bids`}
            >
              ${norm!.median}
            </span>
          </div>
        ))}
        {team && (
          <div className={styles.norm}>
            <span className={styles.normLabel}>{team.name} spent</span>
            <span
              className={styles.normValue}
              title={`~$${Math.max(0, ASSUMED_FAAB_BUDGET - spent)} remaining of an assumed $${ASSUMED_FAAB_BUDGET} season budget`}
            >
              ${spent}
            </span>
          </div>
        )}
      </div>

      {/* The team select and the target list swap in place with no
          navigation; announce the re-priced list politely. */}
      <div aria-live="polite">
        {suggestions.length > 0 ? (
          <ul className={styles.targets} aria-label="Top available targets with suggested bid ranges">
            {suggestions.map(({ target, suggestion }) => (
              <li key={target.id} className={styles.target}>
                <div className={styles.targetMain}>
                  <span className={styles.targetName}>{target.name}</span>
                  <span className={styles.targetMeta}>
                    <PosBadge pos={target.pos} /> <NflTeamLabel team={target.team} />
                    <span
                      className={styles.proj}
                      title="Bundled-pool full-PPR season projection (preseason)"
                    >
                      {target.projPtsPpr} proj
                    </span>
                    {(() => {
                      const sid = target.sleeperId;
                      const value =
                        sleeperReady && sid ? sleeperProjections?.[sid] : undefined;
                      if (value === undefined) {
                        return (
                          <span
                            className={styles.proj}
                            aria-label={
                              sleeperReady
                                ? 'No Sleeper projection for this player'
                                : 'Sleeper projection not loaded'
                            }
                          >
                            — Sleeper
                          </span>
                        );
                      }
                      const label = `Sleeper projection ${value.toFixed(1)} for week ${week}`;
                      return (
                        <span className={styles.proj} title={label} aria-label={label}>
                          {value.toFixed(1)} Sleeper
                        </span>
                      );
                    })()}
                  </span>
                </div>
                <div className={styles.bid}>
                  <span
                    className={styles.range}
                    aria-label={`Suggested bid $${suggestion.low} to $${suggestion.high} for ${target.name}`}
                  >
                    ${suggestion.low}–${suggestion.high}
                  </span>
                  <ul className={styles.reasons} aria-label={`Why $${suggestion.low} to $${suggestion.high}`}>
                    {suggestion.reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.note}>
            No available targets found in the player pool.
          </p>
        )}
      </div>

      <p className={styles.footnote}>
        Guidance only — nothing is bid or spent here. Player values are
        preseason pool projections; remaining budget assumes a
        ${ASSUMED_FAAB_BUDGET} season budget. The Sleeper figure is
        Sleeper&apos;s own week {week} projection where published; a dash
        means no Sleeper line for that player.
      </p>
    </section>
  );
}
