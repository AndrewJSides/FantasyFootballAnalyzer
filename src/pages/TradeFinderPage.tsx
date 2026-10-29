import { useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { League } from '@/types';
import { DataAsOf } from '@/components/DataAsOf';
import { PosBadge } from '@/components';
import { findTradeCandidates, type TradeCandidate } from '@/utils/tradeFinder';
import { SITE_TITLE } from '@/utils/siteTitle';
import styles from './TradeFinderPage.module.css';

interface TradeFinderPageProps {
  league: League;
}

// Trade finder (backlog item 3): proposes concrete win-win swaps between
// league teams. It scans every team pair for depth-for-need 1-for-1 trades —
// Team A is weak at a position where Team B is deep and vice versa — then
// grades each with the same VOR value model and roster-impact takes as the
// Trade Analyzer. Only swaps that are fair on paper (within 25% on VOR)
// AND leave both starting lineups intact are proposed. Each card deep-links
// into the Trade Analyzer with the pairing pre-filled for a full breakdown.

const round1 = (n: number) => Math.round(n * 10) / 10;

function tradeLink(candidate: TradeCandidate, search: string): string {
  const payload = {
    a: candidate.aGives.map(p => p.name),
    b: candidate.bGives.map(p => p.name),
    ta: candidate.teamA.id,
    tb: candidate.teamB.id,
  };
  return `/trade-analyzer${search}#trade=${encodeURIComponent(JSON.stringify(payload))}`;
}

export function TradeFinderPage({ league }: TradeFinderPageProps) {
  useEffect(() => {
    document.title = 'Trade Finder · TraderApe';
    return () => {
      document.title = SITE_TITLE;
    };
  }, []);
  const location = useLocation();

  const candidates = useMemo(() => findTradeCandidates(league), [league]);

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Trade Finder</h1>
          <DataAsOf syncedAt={league.pinSyncedAt} />
          <p className={styles.subtitle}>
            Win-win swaps between {league.totalTeams || league.teams.length} teams
          </p>
        </div>

        <p className={styles.intro} aria-live="polite">
          {candidates.length === 0
            ? 'No win-win swaps right now — no team pair lines up with complementary needs and depth.'
            : `${candidates.length} proposed swap${candidates.length === 1 ? '' : 's'}: each side gives from a position it can spare and receives at a position it needs.`}
        </p>

        {candidates.length > 0 && (
          <ul className={styles.cards} aria-label="Proposed trades">
            {candidates.map((c, i) => (
              <li key={`${c.teamA.id}-${c.teamB.id}-${i}`} className={styles.card}>
                <article aria-label={`${c.teamA.name} and ${c.teamB.name} proposed trade`}>
                  <h2 className={styles.pairing}>
                    {c.teamA.name} <span className={styles.swap} aria-hidden="true">⇄</span>{' '}
                    {c.teamB.name}
                  </h2>

                  <div className={styles.sides}>
                    <div className={styles.side}>
                      <h3 className={styles.sideTitle}>
                        {c.teamA.name} gives
                      </h3>
                      <ul aria-label={`${c.teamA.name} gives`}>
                        {c.aGives.map(p => (
                          <li key={p.id} className={styles.player}>
                            <PosBadge pos={p.pos} />
                            <span className={styles.playerName}>{p.name}</span>
                            <span className={styles.vor}>
                              {round1(c.analysis.sideA.find(v => v.player.id === p.id)?.vor ?? 0)} VOR
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className={styles.side}>
                      <h3 className={styles.sideTitle}>
                        {c.teamB.name} gives
                      </h3>
                      <ul aria-label={`${c.teamB.name} gives`}>
                        {c.bGives.map(p => (
                          <li key={p.id} className={styles.player}>
                            <PosBadge pos={p.pos} />
                            <span className={styles.playerName}>{p.name}</span>
                            <span className={styles.vor}>
                              {round1(c.analysis.sideB.find(v => v.player.id === p.id)?.vor ?? 0)} VOR
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <ul className={styles.reasons} aria-label="Why this trade works">
                    {c.reasons.map((r, ri) => (
                      <li key={ri}>{r}</li>
                    ))}
                  </ul>

                  <Link
                    className={styles.analyze}
                    to={tradeLink(c, location.search)}
                    aria-label={`Analyze ${c.teamA.name} and ${c.teamB.name} trade in the Trade Analyzer`}
                  >
                    Analyze this trade →
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        )}

        <p className={styles.footnote}>
          Method: value from projected-points VOR for your league's shape; a
          swap is proposed only when the sides are within 25% on VOR and
          neither team's starting lineup gets worse. Needs and surplus are
          priced against the league median at each position.
        </p>
      </div>
    </div>
  );
}
