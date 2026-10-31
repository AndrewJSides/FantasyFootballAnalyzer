import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { League } from '@/types';
import { playoffRace } from '@/utils/playoffOdds';
import { findTradeCandidates } from '@/utils/tradeFinder';
import {
  deadlineStances,
  deadlineDeals,
  type DeadlineTier,
  type DeadlineStanceWord,
} from '@/utils/tradeDeadline';
import { tradeLink } from '@/utils/tradeLinks';
import { PosBadge } from '@/components';
import styles from './TradeDeadline.module.css';

interface TradeDeadlineProps {
  league: League;
}

const TIER_LABEL: Record<DeadlineTier, string> = {
  contender: 'Contender',
  bubble: 'Bubble',
  pretender: 'Pretender',
};

const STANCE_LABEL: Record<DeadlineStanceWord, string> = {
  buy: 'BUY',
  hold: 'HOLD',
  sell: 'SELL',
};

// Trade Deadline Hub: who should be buying, holding, and selling as the
// deadline approaches — stances from the Playoff Race's modeled playoff
// odds — plus deadline-framed deals: the Trade Finder's win-win swaps
// restricted to contender↔pretender pairs, with the win-now side and the
// future-value side named. Guidance only: nothing here moves rosters.
export function TradeDeadline({ league }: TradeDeadlineProps) {
  const location = useLocation();
  const race = useMemo(() => playoffRace(league), [league]);
  const stances = useMemo(() => deadlineStances(league, race), [league, race]);
  const candidates = useMemo(() => findTradeCandidates(league), [league]);
  const deals = useMemo(() => deadlineDeals(candidates, stances), [candidates, stances]);

  // The race needs a future schedule; old snapshots and league loads
  // without one get nothing rather than a misinformation card.
  if (race.length === 0) return null;

  return (
    <section className={styles.panel} aria-label="Trade deadline hub">
      <h2 className={styles.heading}>Trade Deadline Hub</h2>
      <p className={styles.intro}>
        Stances come from the Playoff Race&apos;s modeled playoff odds — the
        model&apos;s verdict, not league-official. Contenders should buy
        win-now upgrades, pretenders should sell veterans for future value,
        bubble teams stand pat unless a deal clearly upgrades the starters.
      </p>

      <table className={styles.table} aria-label="Trade deadline stances by team">
        <thead>
          <tr>
            <th scope="col">Team</th>
            <th scope="col" className={styles.num}>Playoff odds</th>
            <th scope="col">Tier</th>
            <th scope="col">Stance</th>
            <th scope="col">Posture</th>
          </tr>
        </thead>
        <tbody>
          {stances.map(s => (
            <tr key={s.team.id}>
              <th scope="row" className={styles.team}>{s.team.name}</th>
              <td
                className={styles.num}
                aria-label={`${s.team.name} modeled playoff probability ${s.playoffProb}%`}
              >
                {s.playoffProb}%
              </td>
              <td>
                <span className={`${styles.tier} ${styles[`tier-${s.tier}`]}`}>
                  {TIER_LABEL[s.tier]}
                </span>
              </td>
              <td>
                <span className={`${styles.stance} ${styles[`stance-${s.stance}`]}`}>
                  {STANCE_LABEL[s.stance]}
                </span>
              </td>
              <td className={styles.posture}>{s.rationale}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {deals.length > 0 && (
        <>
          <h3 className={styles.subheading}>Deadline deals</h3>
          <p className={styles.intro} aria-live="polite">
            {deals.length} win-win swap{deals.length === 1 ? '' : 's'} between a
            contender and a pretender — the deadline&apos;s natural buyers and
            sellers.
          </p>
          <ul className={styles.deals} aria-label="Deadline deals">
            {deals.map((d, i) => (
              <li key={`${d.contender.id}-${d.pretender.id}-${i}`} className={styles.deal}>
                <article
                  aria-label={`${d.contender.name} and ${d.pretender.name} deadline trade`}
                >
                  <h4 className={styles.pairing}>
                    {d.contender.name}{' '}
                    <span className={styles.swap} aria-hidden="true">⇄</span>{' '}
                    {d.pretender.name}
                  </h4>
                  <p className={styles.framing}>{d.framing}</p>
                  <div className={styles.sides}>
                    <div className={styles.side}>
                      <h5 className={styles.sideTitle}>
                        {d.contender.name} gives
                      </h5>
                      <ul aria-label={`${d.contender.name} gives`}>
                        {d.pretenderReceives.map(p => (
                          <li key={p.id} className={styles.player}>
                            <PosBadge pos={p.pos} />
                            <span className={styles.playerName}>{p.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className={styles.side}>
                      <h5 className={styles.sideTitle}>
                        {d.pretender.name} gives
                      </h5>
                      <ul aria-label={`${d.pretender.name} gives`}>
                        {d.contenderReceives.map(p => (
                          <li key={p.id} className={styles.player}>
                            <PosBadge pos={p.pos} />
                            <span className={styles.playerName}>{p.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <ul className={styles.reasons} aria-label="Why this trade works">
                    {d.candidate.reasons.map((r, ri) => (
                      <li key={ri}>{r}</li>
                    ))}
                  </ul>
                  <Link
                    className={styles.analyze}
                    to={tradeLink(d.candidate, location.search, true)}
                    aria-label={`Analyze ${d.contender.name} and ${d.pretender.name} trade in the Trade Analyzer`}
                  >
                    Analyze this trade →
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className={styles.footnote}>
        Method: tiers from the Playoff Race&apos;s 10,000-season Monte Carlo
        (contender ≥50%, pretender &lt;15% modeled playoff odds); deals are
        the Trade Finder&apos;s win-win swaps — within 25% on VOR with no
        starter harmed — filtered to contender↔pretender pairs and framed
        with the win-now and future-value sides named.
      </p>
    </section>
  );
}
