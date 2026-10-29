// Weekly recap story (backlog item 9): the week's narrative in one scroll.
// Biggest over/underperformers vs the TraderApe weekly projection, the
// week-defining game, weekly + season luck extremes (reusing the Luck
// engine), and the best/worst draft picks to date. A week selector swaps the
// story in place (announced via aria-live); sections hide gracefully when
// their data is absent on the loaded platform.
import { useEffect, useMemo, useState } from 'react';
import type { League } from '@/types';
import { weeklyRecap, type RecapOverUnder, type WeeklyLuckSpot, type RecapDraftPick } from '@/utils/weeklyRecap';
import { DataAsOf } from '@/components/DataAsOf';
import { SITE_TITLE } from '../utils/siteTitle';
import styles from './RecapPage.module.css';

interface RecapPageProps {
  league: League;
}

function fmt(n: number): string {
  return n.toFixed(1);
}

function OverUnderCard({ call }: { call: RecapOverUnder }) {
  const up = call.diff > 0;
  return (
    <div className={styles.callCard}>
      <h3>{call.name}</h3>
      <div className={styles.callMeta}>
        {call.position} · {call.teamName || 'free agent'}
      </div>
      <div className={styles.callNumbers}>
        <span className={up ? styles.up : styles.down}>
          {up ? '+' : ''}{fmt(call.diff)}
        </span>{' '}
        ({fmt(call.actual)} vs {fmt(call.projected)} proj.)
      </div>
      <div className={styles.callNote}>
        {up ? 'blew past' : 'fell short of'} TraderApe's projection ({call.weeksUsed} weeks of form).
      </div>
    </div>
  );
}

function LuckCard({ spot, kind }: { spot: WeeklyLuckSpot; kind: 'escape' | 'beat' }) {
  return (
    <div className={styles.callCard}>
      <h3>{spot.teamName}</h3>
      <div className={styles.callMeta}>
        {kind === 'escape' ? 'Luckiest win' : 'Cruelest beat'}
      </div>
      <div className={styles.callNumbers}>
        {fmt(spot.weekPoints)} vs {fmt(spot.opponentPoints)} {spot.opponentName}
      </div>
      <div className={styles.callNote}>
        {kind === 'escape'
          ? `Escaped with the week's lowest winning score (won by ${fmt(spot.margin)}).`
          : `Lost with the week's highest losing score (lost by ${fmt(spot.margin)}).`}
      </div>
    </div>
  );
}

function DraftPickCard({ pick, kind }: { pick: RecapDraftPick; kind: 'best' | 'worst' }) {
  return (
    <div className={styles.callCard}>
      <h3>{pick.name}</h3>
      <div className={styles.callMeta}>
        {pick.position} · {pick.teamName} · Round {pick.round} (pick {pick.pickNumber})
      </div>
      <div className={styles.callNumbers}>
        {pick.position} rank #{pick.positionRank} vs expected #{pick.expectedRank}{' '}
        <span className={kind === 'best' ? styles.up : styles.down}>
          ({pick.valueOverExpected >= 0 ? '+' : ''}{pick.valueOverExpected})
        </span>
      </div>
      <div className={styles.callNote}>
        {kind === 'best'
          ? 'The draft steal so far.'
          : 'The draft-day reach that still stings.'}
      </div>
    </div>
  );
}

export function RecapPage({ league }: RecapPageProps) {
  useEffect(() => {
    document.title = 'Weekly Recap · TraderApe';
    return () => {
      document.title = SITE_TITLE;
    };
  }, []);

  const latestWeek = useMemo(() => weeklyRecap(league)?.week, [league]);
  const [week, setWeek] = useState<number | null>(null);
  const activeWeek = week ?? latestWeek ?? 0;

  const recap = useMemo(
    () => (activeWeek > 0 ? weeklyRecap(league, activeWeek) : null),
    [league, activeWeek],
  );

  return (
    <div className={styles.recapPage}>
      <div className="container">
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Weekly Recap</h1>
            <p className={styles.subtitle}>{league.name}</p>
            <DataAsOf syncedAt={league.pinSyncedAt} />
          </div>
        </div>

        {!recap && <p className={styles.empty}>No completed weeks yet — the first recap lands after Week 1.</p>}

        {recap && (
          <>
            <div className={styles.weekRow}>
              <label htmlFor="recap-week" className={styles.weekLabel}>
                Week
              </label>
              <select
                id="recap-week"
                className={styles.weekSelect}
                value={recap.week}
                onChange={e => setWeek(Number(e.target.value))}
              >
                {recap.availableWeeks.map(w => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
              </select>
            </div>

            {/* Week swap is in-place content, so announce it. */}
            <div aria-live="polite">
              <div className={styles.headline}>
                <h2 className={styles.headlineTitle}>Week {recap.week}: {recap.headline}</h2>
                {recap.headlineDetail && (
                  <div className={styles.headlineDetail}>{recap.headlineDetail}</div>
                )}
              </div>

              <section className={styles.section} aria-labelledby="recap-games">
                <h2 id="recap-games" className={styles.sectionTitle}>The games</h2>
                <table className={styles.gameTable}>
                  <caption>Week {recap.week} final scores</caption>
                  <thead>
                    <tr>
                      <th scope="col">Matchup</th>
                      <th scope="col">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recap.games.map((g, i) => (
                      <tr key={i}>
                        <td>
                          <span className={g.team1Pts > g.team2Pts ? styles.winner : undefined}>
                            {g.team1Name}
                          </span>{' '}
                          vs{' '}
                          <span className={g.team2Pts > g.team1Pts ? styles.winner : undefined}>
                            {g.team2Name}
                          </span>
                          {g.tie && ' (tie)'}
                        </td>
                        <td>
                          {fmt(g.team1Pts)} – {fmt(g.team2Pts)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className={styles.section} aria-labelledby="recap-overunder">
                <h2 id="recap-overunder" className={styles.sectionTitle}>
                  Against TraderApe's projection
                </h2>
                {!recap.hasWeeklyPoints ? (
                  <p className={styles.graceNote}>
                    Weekly player stats aren't in this snapshot, so there's nothing to grade
                    against the projection this week.
                  </p>
                ) : recap.overperformers.length === 0 && recap.underperformers.length === 0 ? (
                  <p className={styles.graceNote}>
                    Nobody beat or missed the projection by 5+ points — a well-behaved week.
                  </p>
                ) : (
                  <div className={styles.cardGrid}>
                    {recap.overperformers.map(c => (
                      <OverUnderCard key={c.name} call={c} />
                    ))}
                    {recap.underperformers.map(c => (
                      <OverUnderCard key={c.name} call={c} />
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.section} aria-labelledby="recap-luck">
                <h2 id="recap-luck" className={styles.sectionTitle}>Luck</h2>
                <div className={styles.cardGrid}>
                  {recap.luckyEscape && <LuckCard spot={recap.luckyEscape} kind="escape" />}
                  {recap.cruelBeat && <LuckCard spot={recap.cruelBeat} kind="beat" />}
                  {recap.luckiestSeason && (
                    <div className={styles.callCard}>
                      <h3>{recap.luckiestSeason.teamName}</h3>
                      <div className={styles.callMeta}>Luckiest team this season</div>
                      <div className={styles.callNumbers}>
                        luck score <span className={styles.up}>+{recap.luckiestSeason.luckScore.toFixed(1)}</span>
                      </div>
                      <div className={styles.callNote}>
                        {recap.luckiestSeason.actualWins}-{recap.luckiestSeason.actualLosses} vs{' '}
                        {recap.luckiestSeason.expectedWins.toFixed(1)} expected wins.
                      </div>
                    </div>
                  )}
                  {recap.unluckiestSeason && (
                    <div className={styles.callCard}>
                      <h3>{recap.unluckiestSeason.teamName}</h3>
                      <div className={styles.callMeta}>Unluckiest team this season</div>
                      <div className={styles.callNumbers}>
                        luck score <span className={styles.down}>{recap.unluckiestSeason.luckScore.toFixed(1)}</span>
                      </div>
                      <div className={styles.callNote}>
                        {recap.unluckiestSeason.actualWins}-{recap.unluckiestSeason.actualLosses} vs{' '}
                        {recap.unluckiestSeason.expectedWins.toFixed(1)} expected wins.
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {recap.hasDraftData && (recap.bestPick || recap.worstPick) && (
                <section className={styles.section} aria-labelledby="recap-draft">
                  <h2 id="recap-draft" className={styles.sectionTitle}>Draft picks to date</h2>
                  <div className={styles.cardGrid}>
                    {recap.bestPick && <DraftPickCard pick={recap.bestPick} kind="best" />}
                    {recap.worstPick && <DraftPickCard pick={recap.worstPick} kind="worst" />}
                  </div>
                </section>
              )}

              <p className={styles.footnote}>
                Projections are TraderApe's own weekly model (recency-weighted form plus
                season baseline, no matchup blend); a call needs 2+ prior weeks of data.
                Luck reuses the Luck engine (actual minus expected wins). Draft picks are
                priced on points scored so far vs. the rank their slot normally returns.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
