import type { PositionKey } from '@/utils/tradeAnalysis';
import type { PositionProfile, TeamProfile } from '@/utils/tradeFinder';
import styles from './TeamNeedsMatrix.module.css';

const POSITIONS: PositionKey[] = ['QB', 'RB', 'WR', 'TE'];

const round1 = (n: number) => Math.round(n * 10) / 10;

// Team Needs Matrix (backlog item 118): the whole trade market at a glance.
// One row per team, one column per position; each cell names the team's
// best player at that position with his VOR and a NEED / SURPLUS / Balanced
// verdict straight from the Trade Finder's teamProfiles engine (best below
// the league median = need; startable depth past starter demand = surplus).
// Pure render — no new fetch, no new pricing. League mode only: the median
// math needs a full league's rosters.

function verdicts(prof: PositionProfile): string[] {
  const out: string[] = [];
  if (prof.need) out.push('Need');
  if (prof.surplus) out.push('Surplus');
  if (out.length === 0) out.push('Balanced');
  return out;
}

function verdictClass(verdict: string): string {
  if (verdict === 'Need') return styles.need;
  if (verdict === 'Surplus') return styles.surplus;
  return styles.balanced;
}

export function TeamNeedsMatrix({ profiles }: { profiles: TeamProfile[] }) {
  if (profiles.length === 0) return null;
  // All profiles in one scan share a unit (redraft VOR or dynasty pts).
  // Default to VOR for hand-built profiles that predate the unit field.
  const unit = profiles[0].unit ?? 'VOR';
  return (
    <section className={styles.panel} aria-label="Team needs matrix">
      <h2 className={styles.heading}>Team needs matrix</h2>
      <p className={styles.intro}>
        The whole trade market at a glance — who needs what, and who has
        depth to spare. A team&apos;s best player at each position is shown
        with its {unit}; Need means that best is below the league median,
        Surplus means the team can give up a startable piece and still
        cover its starters.
      </p>
      <table className={styles.table} aria-label="Team needs by position">
        <caption className="visually-hidden">
          Every team&apos;s best player and need or surplus verdict per
          position
        </caption>
        <thead>
          <tr>
            <th scope="col">Team</th>
            {POSITIONS.map(pos => (
              <th key={pos} scope="col">
                {pos}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {profiles.map(({ team, positions }) => (
            <tr key={team.id}>
              <th scope="row" className={styles.team}>
                {team.name}
              </th>
              {POSITIONS.map(pos => {
                const prof = positions[pos];
                const best = prof.depthChart[0];
                const vs = verdicts(prof);
                return (
                  <td
                    key={pos}
                    className={styles.cell}
                    aria-label={`${team.name} at ${pos}: best ${best ? best.name : 'no player'}, ${round1(prof.best)} ${unit}, ${vs.join(' and ')}`}
                  >
                    <span className={styles.player}>
                      {best ? best.name : '—'}
                    </span>{' '}
                    <span className={styles.vor}>
                      {round1(prof.best)} {unit}
                    </span>
                    <span className={styles.chips}>
                      {vs.map(v => (
                        <span key={v} className={verdictClass(v)}>
                          {v}
                        </span>
                      ))}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.footnote}>
        Method: best {unit} per position from TraderApe&apos;s
        {unit === 'dynasty pts'
          ? ' dynasty model (season projection × age curve)'
          : ' projected-points VOR model'}
        ; Need is priced against the league median best at that position,
        Surplus against starter demand plus one. Guidance only — nothing
        here moves a roster.
      </p>
    </section>
  );
}
