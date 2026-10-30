// Matchup game plan (backlog item 24a): the weekly matchup preview as a
// dedicated view. A matchup picker (defaulting to my matchup) shows the
// projected score, Monte Carlo win probability, score distributions, and
// swing players; a focus-team game plan then lays out the optimal projected
// lineup and flags the start/sit close calls (bench players within
// TOSS_UP_THRESHOLD of a starter) — the game-plan concept from the
// competitor research, priced on TraderApe's own projection engine.
// Guidance only: nothing here changes any lineup. The matchup table on the
// Teams page folded into this view; league mode only (no schedule, no
// previews).

import { useMemo, useState } from 'react';
import type { League } from '@/types';
import { previewWeeklyMatchups, type MatchupPreview } from '@/utils/matchupPreview';
import { buildGamePlan, TOSS_UP_THRESHOLD, type SwapFlag } from '@/utils/gamePlan';
import { completedMatchups } from '@/utils/completedMatchups';
import { buildHeadToHead, seriesHeadline } from '@/utils/headToHead';
import ScoreDistBars from '@/components/ScoreDistBars';
import { DataAsOf } from '@/components/DataAsOf';
import { SITE_TITLE } from '../utils/siteTitle';
import styles from './MatchupPage.module.css';

interface MatchupPageProps {
  league: League;
}

function SwapCall({ flag }: { flag: SwapFlag }) {
  return (
    <li className={`${styles.flag} ${flag.kind === 'upgrade' ? styles.flagUpgrade : ''}`}>
      <div className={styles.flagTitle}>
        {flag.slot}: consider {flag.challengerName} over {flag.starterName}{' '}
        ({flag.challengerScore.toFixed(1)} vs {flag.starterScore.toFixed(1)} proj.)
      </div>
      <div className={styles.flagNote}>{flag.note}</div>
    </li>
  );
}

function MatchupDetail({ league, preview }: { league: League; preview: MatchupPreview }) {
  const teamById = useMemo(() => new Map(league.teams.map(t => [t.id, t])), [league.teams]);
  const aName = teamById.get(preview.teamAId)?.name ?? '?';
  const bName = teamById.get(preview.teamBId)?.name ?? '?';
  const favA = preview.winProbA >= 50;
  const favName = favA ? aName : bName;
  const favProb = favA ? preview.winProbA : 100 - preview.winProbA;

  // Focus team defaults to mine when it's in this matchup, else team A.
  // The parent keys this component by matchup, so the state is fresh on
  // every matchup switch.
  const defaultFocus = useMemo(() => {
    const mine = league.teams.find(t => t.isMyTeam);
    if (mine && (mine.id === preview.teamAId || mine.id === preview.teamBId)) return mine.id;
    return preview.teamAId;
  }, [league.teams, preview]);
  const [focusId, setFocusId] = useState<string>(defaultFocus);

  const focusTeam = teamById.get(focusId);
  const plan = useMemo(
    () => (focusTeam ? buildGamePlan(focusTeam, league) : null),
    [focusTeam, league],
  );
  const focusName = teamById.get(focusId)?.name ?? '?';

  // This season's series record between the two teams, from completed
  // weeks only (the current week's partial scores don't count yet).
  const series = useMemo(
    () => buildHeadToHead(preview.teamAId, preview.teamBId, completedMatchups(league)),
    [league, preview.teamAId, preview.teamBId],
  );
  const seriesAria = useMemo(() => {
    if (series.games === 0) return null;
    const parts = [`This season's series: ${seriesHeadline(series, aName, bName)}`];
    if (series.lastMeeting) {
      const w =
        series.lastMeetingWinner === 'a'
          ? aName
          : series.lastMeetingWinner === 'b'
            ? bName
            : 'a tie';
      parts.push(
        `last meeting week ${series.lastMeeting.week}, ${aName} ${series.lastMeeting.aScore.toFixed(1)} to ${bName} ${series.lastMeeting.bScore.toFixed(1)}, ${w} won`,
      );
    }
    if (series.streakSide && series.streak >= 2) {
      parts.push(`${series.streakSide === 'a' ? aName : bName} has won ${series.streak} straight`);
    }
    return parts.join('; ');
  }, [series, aName, bName]);

  return (
    <div aria-live="polite">
      <div className={styles.gameCard}>
        <h2 className={styles.gameTitle}>
          Week {preview.week}: {aName} vs {bName}
        </h2>
        <div className={styles.scoreLine}>
          Projected score: {aName} {preview.projA.toFixed(1)} – {bName}{' '}
          {preview.projB.toFixed(1)}
        </div>
        <div className={styles.probRow}>
          <div className={styles.probTrack} aria-hidden="true">
            <div className={styles.probFill} style={{ width: `${preview.winProbA}%` }} />
          </div>
          <span
            className={styles.probLabel}
            title={`${aName} ${preview.winProbA.toFixed(1)}% · ${bName} ${(100 - preview.winProbA).toFixed(1)}%`}
          >
            {favName} {favProb.toFixed(1)}%
          </span>
        </div>
        <ScoreDistBars
          rows={[
            { label: aName, dist: preview.distA },
            { label: bName, dist: preview.distB },
          ]}
        />
        {preview.swingPlayers.length > 0 && (
          <>
            <h3 className={styles.sectionTitle} style={{ marginTop: '1rem' }}>
              Swing players
            </h3>
            <ul className={styles.swingList}>
              {preview.swingPlayers.map(s => (
                <li
                  key={`${s.teamId}-${s.name}`}
                  title={`${s.name} (${teamById.get(s.teamId)?.name ?? s.teamId}) — ±${s.std.toFixed(1)} pts week to week, ~${s.swingShare.toFixed(1)}% of this matchup's swing`}
                >
                  {s.name} ({teamById.get(s.teamId)?.name ?? '?'}) — ±
                  {s.std.toFixed(1)} pts
                </li>
              ))}
            </ul>
          </>
        )}
        {series.games > 0 && seriesAria && (
          <>
            <h3 className={styles.sectionTitle} style={{ marginTop: '1rem' }}>
              Series history
            </h3>
            <p className={styles.scoreLine} title={seriesAria} aria-label={seriesAria}>
              {seriesHeadline(series, aName, bName)}
              {series.lastMeeting && (
                <>
                  {' · '}Last meeting W{series.lastMeeting.week}: {aName}{' '}
                  {series.lastMeeting.aScore.toFixed(1)} – {bName}{' '}
                  {series.lastMeeting.bScore.toFixed(1)}
                  {series.lastMeetingWinner !== 'tie' && (
                    <> ({series.lastMeetingWinner === 'a' ? aName : bName} won)</>
                  )}
                </>
              )}
              {series.streakSide && series.streak >= 2 && (
                <> · {(series.streakSide === 'a' ? aName : bName)} has won {series.streak} straight</>
              )}
            </p>
          </>
        )}
      </div>

      <div className={styles.gameCard}>
        <h2 className={styles.sectionTitle}>Game plan: {focusName}</h2>
        <div className={styles.picker} role="group" aria-label="Focus team">
          {[preview.teamAId, preview.teamBId].map(id => (
            <button
              key={id}
              type="button"
              className={styles.pickButton}
              aria-pressed={focusId === id}
              onClick={() => setFocusId(id)}
            >
              {teamById.get(id)?.name ?? id}
            </button>
          ))}
        </div>
        {plan && (
          <>
            <table className={styles.lineupTable} aria-label={`Projected optimal lineup for ${focusName}`}>
              <thead>
                <tr>
                  <th scope="col">Slot</th>
                  <th scope="col">Player</th>
                  <th scope="col">Proj.</th>
                </tr>
              </thead>
              <tbody>
                {plan.slots.map((s, i) => (
                  <tr key={`${s.slot}-${i}`}>
                    <td className={styles.slotCell}>{s.slot}</td>
                    <td>{s.player ? s.player.name : <span aria-label="empty slot">—</span>}</td>
                    <td>{s.player ? s.player.score.toFixed(1) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className={styles.sectionTitle}>Start/sit close calls</h3>
            {plan.swapFlags.length > 0 ? (
              <ul className={styles.flagList} aria-label="Close start-sit calls">
                {plan.swapFlags.map(f => (
                  <SwapCall key={`${f.slot}-${f.starterName}-${f.challengerName}`} flag={f} />
                ))}
              </ul>
            ) : (
              <p className={styles.allClear}>
                No swaps worth a look — every starter outprojects his bench
                cover by {TOSS_UP_THRESHOLD}+ points.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function MatchupPage({ league }: MatchupPageProps) {
  const previews = useMemo(() => previewWeeklyMatchups(league), [league]);
  const teamById = useMemo(() => new Map(league.teams.map(t => [t.id, t])), [league.teams]);

  const defaultIndex = useMemo(() => {
    const mine = league.teams.find(t => t.isMyTeam);
    if (mine) {
      const idx = previews.findIndex(
        p => p.teamAId === mine.id || p.teamBId === mine.id,
      );
      if (idx >= 0) return idx;
    }
    return 0;
  }, [league.teams, previews]);
  const [selIndex, setSelIndex] = useState(defaultIndex);
  const preview = previews.length > 0 ? previews[Math.min(selIndex, previews.length - 1)] : null;

  return (
    <div className={styles.matchupPage}>
      <div className={styles.header}>
        <h1 className={styles.title}>Matchup</h1>
        <p className={styles.subtitle}>
          {SITE_TITLE} · Week {league.currentWeek ?? '—'} game plan
        </p>
        <DataAsOf syncedAt={league.pinSyncedAt} />
      </div>

      {previews.length === 0 ? (
        <p className={styles.empty}>
          No matchups to preview this week. The matchup schedule comes from
          the owner&apos;s latest sync — re-sync and it will show up here.
        </p>
      ) : (
        <>
          <div className={styles.picker} role="group" aria-label="This week's matchups">
            {previews.map((p, i) => {
              const a = teamById.get(p.teamAId)?.name ?? '?';
              const b = teamById.get(p.teamBId)?.name ?? '?';
              return (
                <button
                  key={`${p.week}-${p.teamAId}-${p.teamBId}`}
                  type="button"
                  className={styles.pickButton}
                  aria-pressed={i === selIndex}
                  onClick={() => setSelIndex(i)}
                >
                  {a} vs {b}
                </button>
              );
            })}
          </div>
          {preview && <MatchupDetail key={`${preview.week}-${preview.teamAId}-${preview.teamBId}`} league={league} preview={preview} />}
        </>
      )}

      <p className={styles.method}>
        Projected scores come from TraderApe&apos;s weekly projection model
        (recency-weighted form blended with the season baseline, nudged by
        this week&apos;s matchup difficulty — the same engine as Start/Sit),
        priced on completed weeks only. Win probabilities are Monte Carlo:
        10,000 simulated weeks, each starter&apos;s score drawn from his
        projection ± his own week-to-week volatility. Swing players carry the
        most of the matchup&apos;s variance. Start/sit flags name bench
        players within {TOSS_UP_THRESHOLD} points of a starter&apos;s
        projection — close calls worth a second look, not orders. Guidance
        only: nothing here changes any lineup. Schedule from the owner&apos;s
        latest sync. Series history counts this season&apos;s completed weeks only.
      </p>
    </div>
  );
}
