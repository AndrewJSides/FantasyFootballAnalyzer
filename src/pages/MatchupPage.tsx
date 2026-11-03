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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { League } from '@/types';
import { previewWeeklyMatchups, scoreTeamLineup, type MatchupPreview } from '@/utils/matchupPreview';
import { buildGamePlan, TOSS_UP_THRESHOLD, type SwapFlag } from '@/utils/gamePlan';
import { priceSwapImpacts, type SwapImpact } from '@/utils/swapImpact';
import { completedMatchups } from '@/utils/completedMatchups';
import { buildHeadToHead, seriesHeadline } from '@/utils/headToHead';
import { buildPositionBattles, EVEN_BAND, type PositionBattle } from '@/utils/positionBattles';
import { winNowTrades } from '@/utils/winNowTrades';
import { buildAttackPlan, attackStarterLabel } from '@/utils/attackPlan';
import { tradeLink } from '@/utils/tradeLinks';
import ScoreDistBars from '@/components/ScoreDistBars';
import { DataAsOf } from '@/components/DataAsOf';
import { SITE_TITLE } from '../utils/siteTitle';
import { timeAgo } from '@/utils/relativeTime';
import { fetchWeekPprStats, fetchWeeklyPprPoints, type WeekPprStats, type WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { mapSleeperComponentsToRosterKeys, type RosterComponentMaps } from '@/utils/leagueComponents';
import { liveForPreview, type LiveMatchup, type LiveTeamScore } from '@/utils/liveMatchup';
import styles from './MatchupPage.module.css';

const LIVE_REFRESH_MS = 60_000;

function LiveTeamTable({ team, teamName }: { team: LiveTeamScore; teamName: string }) {
  return (
    <table
      className={styles.lineupTable}
      aria-label={`Live scoring, ${teamName} starters, week`}
    >
      <thead>
        <tr>
          <th scope="col">Player</th>
          <th scope="col">Pos</th>
          <th scope="col">Actual</th>
          <th scope="col">Proj.</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {team.rows.map(r => (
          <tr key={r.key}>
            <th scope="row" className={styles.slotCell}>
              {r.name}
            </th>
            <td>{r.position}</td>
            <td>{r.actual !== null ? r.actual.toFixed(1) : '—'}</td>
            <td>{r.projection.toFixed(1)}</td>
            <td>{r.played ? 'Played' : 'Pending'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Live score line for the picked matchup (backlog item 85): Sleeper's
 *  weekly stats refresh as NFL games play, so starters whose games have
 *  started score their actual points and everyone else counts at
 *  TraderApe's own weekly projection. Renders nothing before any game
 *  starts; auto-refreshes every minute while players are still pending. */
function LiveScores({ league, preview }: { league: League; preview: MatchupPreview }) {
  const [stats, setStats] = useState<WeekPprStats | undefined>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [announcement, setAnnouncement] = useState('Loading live scores.');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetchWeekPprStats(league.season, preview.week);
      if (!s) throw new Error('live stats unavailable');
      setStats(s);
      setUpdatedAt(Date.now());
      setStatus('ready');
      setAnnouncement(`Live scores updated for week ${preview.week}.`);
    } catch {
      setStatus('error');
      setAnnouncement('Could not load live scores.');
    }
  }, [league.season, preview.week]);

  useEffect(() => {
    void load();
  }, [load]);

  const live: LiveMatchup | null = useMemo(
    () => (stats ? liveForPreview(league, preview, stats) : null),
    [league, stats, preview],
  );
  const anyPlayed =
    live !== null && live.a.played + live.b.played > 0;
  const anyPending =
    live !== null &&
    (live.a.played < live.a.starters || live.b.played < live.b.starters);

  useEffect(() => {
    if (!anyPending) return;
    const t = setInterval(() => void load(), LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [anyPending, load]);

  if (status === 'loading' || !live || !anyPlayed) {
    // Pre-kickoff the section hides entirely — the pre-game preview above
    // already covers it.
    if (status === 'error') {
      return (
        <>
          <h3 className={styles.sectionTitle} style={{ marginTop: '1rem' }}>
            Live score
          </h3>
          <p className={styles.allClear}>
            Couldn&apos;t load live scores — Sleeper&apos;s feed may be down.{' '}
            <button type="button" onClick={() => void load()} className={styles.retryButton}>
              Try again
            </button>
          </p>
          <div className="visually-hidden" role="status" aria-live="polite">
            {announcement}
          </div>
        </>
      );
    }
    return null;
  }

  const teamById = new Map(league.teams.map(t => [t.id, t]));
  const aName = teamById.get(live.teamAId)?.name ?? '?';
  const bName = teamById.get(live.teamBId)?.name ?? '?';
  const favA = live.winProbA >= 50;
  const favName = favA ? aName : bName;
  const favProb = favA ? live.winProbA : 100 - live.winProbA;
  const scoreLine = `${aName} ${live.a.actualSoFar.toFixed(1)} – ${bName} ${live.b.actualSoFar.toFixed(1)}, projected finals ${live.a.projectedFinal.toFixed(1)} to ${live.b.projectedFinal.toFixed(1)}. ${favName} ${favProb.toFixed(1)}% to win live.`;

  return (
    <>
      <h3 className={styles.sectionTitle} style={{ marginTop: '1rem' }}>
        Live score{' '}
        {anyPending && <span className={styles.liveBadge}>LIVE</span>}
      </h3>
      <div className={styles.scoreLine} aria-label={scoreLine}>
        {aName} {live.a.actualSoFar.toFixed(1)} – {bName} {live.b.actualSoFar.toFixed(1)}
        <span className={styles.liveProj}>
          {' '}· proj. final {live.a.projectedFinal.toFixed(1)} – {live.b.projectedFinal.toFixed(1)}
        </span>
      </div>
      <div className={styles.probRow}>
        <div className={styles.probTrack} aria-hidden="true">
          <div className={styles.probFill} style={{ width: `${live.winProbA}%` }} />
        </div>
        <span
          className={styles.probLabel}
          title={`${aName} ${live.winProbA.toFixed(1)}% · ${bName} ${(100 - live.winProbA).toFixed(1)}%`}
        >
          {favName} {favProb.toFixed(1)}%
        </span>
      </div>
      <p className={styles.liveNote}>
        Played starters count at their actual points (partial while their game
        is in progress); pending players count at their TraderApe projection.
        ({live.a.played + live.b.played} of {live.a.starters + live.b.starters} starters played)
      </p>
      <h4 className={styles.liveTeamName}>{aName}</h4>
      <LiveTeamTable team={live.a} teamName={aName} />
      <h4 className={styles.liveTeamName}>{bName}</h4>
      <LiveTeamTable team={live.b} teamName={bName} />
      <p className={styles.updated} aria-hidden="true">
        {updatedAt !== null
          ? `Updated ${timeAgo(new Date(updatedAt).toISOString())}${anyPending ? ' · auto-refreshes every minute while players are pending' : ''}`
          : ' '}
      </p>
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
    </>
  );
}

function sidePlayers(side: PositionBattle['a']): string {
  return side.players.map(p => `${p.name} ${p.proj.toFixed(1)}`).join(', ') || '—';
}

function battleEdgeShort(bt: PositionBattle, aName: string, bName: string): string {
  if (bt.edge === 'even') return 'Even';
  const m = Math.abs(bt.margin).toFixed(1);
  return bt.edge === 'a' ? `${aName} +${m}` : `${bName} +${m}`;
}

function battleEdgeLabel(bt: PositionBattle, aName: string, bName: string): string {
  if (bt.edge === 'even')
    return `${bt.group}: even — ${aName} ${bt.a.proj.toFixed(1)}, ${bName} ${bt.b.proj.toFixed(1)} (within ${EVEN_BAND})`;
  const winner = bt.edge === 'a' ? aName : bName;
  return `${bt.group}: ${winner} by ${Math.abs(bt.margin).toFixed(1)} projected points`;
}

interface MatchupPageProps {
  league: League;
}

function SwapCall({ flag, impact }: { flag: SwapFlag; impact?: SwapImpact }) {
  const gainText =
    impact && `${impact.gain >= 0 ? '+' : ''}${impact.gain.toFixed(1)} pts`;
  return (
    <li className={`${styles.flag} ${flag.kind === 'upgrade' ? styles.flagUpgrade : ''}`}>
      <div className={styles.flagTitle}>
        {flag.slot}: consider {flag.challengerName} over {flag.starterName}{' '}
        ({flag.challengerScore.toFixed(1)} vs {flag.starterScore.toFixed(1)} proj.)
      </div>
      <div className={styles.flagNote}>{flag.note}</div>
      {impact && (
        <div
          className={styles.flagImpact}
          title={`Same seeded 2,000-sim Monte Carlo as the baseline, so the delta is the swap's effect, not sim noise.`}
          aria-label={`Making this swap moves the win chance ${gainText}`}
        >
          Win chance {gainText} with this swap
        </div>
      )}
    </li>
  );
}

function MatchupDetail({ league, preview, componentMaps }: { league: League; preview: MatchupPreview; componentMaps?: RosterComponentMaps }) {
  const location = useLocation();
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

  // Swap impact: each close-call flag priced on this week's Monte Carlo
  // win probability, so the flag answers "how much does my win chance move
  // if I make this swap". Re-prices both optimal lineups on the same
  // shared scoring core as the preview above, so the two can't disagree.
  const swapImpacts = useMemo(() => {
    const empty = new Map<string, SwapImpact>();
    if (!plan || plan.swapFlags.length === 0) return empty;
    const opponentId = focusId === preview.teamAId ? preview.teamBId : preview.teamAId;
    const oppTeam = teamById.get(opponentId);
    if (!focusTeam || !oppTeam) return empty;
    const a = scoreTeamLineup(focusTeam, league, { componentMaps });
    const b = scoreTeamLineup(oppTeam, league, { componentMaps });
    if (!a || !b) return empty;
    return new Map(
      priceSwapImpacts(a.starters, b.starters, plan.swapFlags).map(i => [
        `${i.slot}-${i.starterName}-${i.challengerName}`,
        i,
      ]),
    );
  }, [plan, preview, focusId, focusTeam, league, teamById, componentMaps]);

  // This season's series record between the two teams, from completed
  // weeks only (the current week's partial scores don't count yet).
  const series = useMemo(
    () => buildHeadToHead(preview.teamAId, preview.teamBId, completedMatchups(league)),
    [league, preview.teamAId, preview.teamBId],
  );
  // Position-group battles: each optimal lineup's starters grouped by
  // position, compared on summed weekly projections — same pricing as the
  // preview above, so the two can't disagree.
  const battles = useMemo(() => {
    const a = teamById.get(preview.teamAId);
    const b = teamById.get(preview.teamBId);
    return a && b ? buildPositionBattles(a, b, league) : null;
  }, [league, preview, teamById]);
  // Win-now trades: the Trade Finder's 1-for-1 candidates between these
  // two teams, re-priced on this week's Monte Carlo win probability for
  // the focus team. The baseline reuses the same seeded sims, so the
  // delta is the trade's effect, not sim noise.
  const winNow = useMemo(() => {
    const opponentId =
      focusId === preview.teamAId ? preview.teamBId : preview.teamAId;
    return winNowTrades(league, focusId, opponentId);
  }, [league, focusId, preview]);
  // Attack plan: the focus team's optimal starters grouped by position and
  // ranked on the softness of the NFL defenses they face this week — where
  // the week's edge comes from. Re-orients on focus-team switch like the
  // win-now trades above.
  const attack = useMemo(
    () => (focusTeam ? buildAttackPlan(focusTeam, league) : null),
    [focusTeam, league],
  );

  // This season's series record between the two teams, from completed
  // weeks only (the current week's partial scores don't count yet).
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
        <LiveScores league={league} preview={preview} />
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
        {battles && battles.length > 0 && (
          <>
            <h3 className={styles.sectionTitle} style={{ marginTop: '1rem' }}>
              Position battles
            </h3>
            <table
              className={styles.lineupTable}
              aria-label={`Position-group projection comparison, ${aName} vs ${bName}`}
            >
              <thead>
                <tr>
                  <th scope="col">Pos</th>
                  <th scope="col">{aName}</th>
                  <th scope="col">{bName}</th>
                  <th scope="col">Edge</th>
                </tr>
              </thead>
              <tbody>
                {battles.map(bt => (
                  <tr key={bt.group}>
                    <th scope="row" className={styles.slotCell}>
                      {bt.group}
                    </th>
                    <td
                      title={sidePlayers(bt.a)}
                      aria-label={`${aName} ${bt.group}: ${sidePlayers(bt.a)}, ${bt.a.proj.toFixed(1)} projected`}
                    >
                      {bt.a.proj.toFixed(1)}
                    </td>
                    <td
                      title={sidePlayers(bt.b)}
                      aria-label={`${bName} ${bt.group}: ${sidePlayers(bt.b)}, ${bt.b.proj.toFixed(1)} projected`}
                    >
                      {bt.b.proj.toFixed(1)}
                    </td>
                    <td
                      aria-label={battleEdgeLabel(bt, aName, bName)}
                      title={battleEdgeLabel(bt, aName, bName)}
                    >
                      {battleEdgeShort(bt, aName, bName)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {winNow && (
          <>
            <h3 className={styles.sectionTitle} style={{ marginTop: '1rem' }}>
              Win-now trades
            </h3>
            {winNow.trades.length > 0 ? (
              <ul className={styles.flagList} aria-label={`Trades that raise ${focusName}'s win chance this week`}>
                {winNow.trades.map(t => {
                  const gives = t.focusGives.map(p => p.name).join(', ');
                  const gets = t.focusGets.map(p => p.name).join(', ');
                  const detail = `${focusName} win chance ${t.winProbBefore.toFixed(1)}% to ${t.winProbAfter.toFixed(1)}% (up ${t.gain.toFixed(1)}), projected score ${t.projBefore.toFixed(1)} to ${t.projAfter.toFixed(1)}`;
                  return (
                    <li
                      key={`${t.focusGives[0].id}-${t.focusGets[0].id}`}
                      className={styles.flag}
                      title={detail}
                      aria-label={`Give ${gives}, get ${gets}. ${detail}. ${t.candidate.reasons[0] ?? ''}`}
                    >
                      <div className={styles.flagTitle}>
                        Give {gives}, get {gets} — win chance{' '}
                        {t.winProbBefore.toFixed(1)}% → {t.winProbAfter.toFixed(1)}%
                        {' '}(+{t.gain.toFixed(1)})
                      </div>
                      <div className={styles.flagNote}>
                        Projected score {t.projBefore.toFixed(1)} →{' '}
                        {t.projAfter.toFixed(1)}.{' '}
                        <Link to={tradeLink(t.candidate, location.search, true)}>
                          Analyze this trade
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.allClear}>
                No Trade Finder swap raises {focusName}&apos;s win chance this
                week by 2+ points.
              </p>
            )}
          </>
        )}
        {attack && (
          <>
            <h3 className={styles.sectionTitle} style={{ marginTop: '1rem' }}>
              Attack plan
            </h3>
            <p
              className={styles.scoreLine}
              aria-label={`Attack plan for ${focusName}, week ${attack.week}. Best spot: ${attack.best.group}, average opponent rank ${attack.best.avgRank.toFixed(1)}, ${attack.best.verdict}. Toughest: ${attack.toughest.group}, average opponent rank ${attack.toughest.avgRank.toFixed(1)}, ${attack.toughest.verdict}.`}
            >
              Best spot: {attack.best.group}s (avg opp rank{' '}
              {attack.best.avgRank.toFixed(1)} — {attack.best.verdict}).
              Toughest: {attack.toughest.group}s (avg opp rank{' '}
              {attack.toughest.avgRank.toFixed(1)} — {attack.toughest.verdict}).
            </p>
            <table
              className={styles.lineupTable}
              aria-label={`Attack plan: where ${focusName}'s starters face the softest defenses, week ${attack.week}`}
            >
              <thead>
                <tr>
                  <th scope="col">Pos</th>
                  <th scope="col">Starters</th>
                  <th scope="col">Opp. softness</th>
                  <th scope="col">Proj.</th>
                </tr>
              </thead>
              <tbody>
                {attack.groups.map(g => {
                  const detail = g.starters
                    .map(s => attackStarterLabel(s, g.group))
                    .join('; ');
                  const verdictCap =
                    g.verdict.charAt(0).toUpperCase() + g.verdict.slice(1);
                  return (
                    <tr key={g.group}>
                      <th scope="row" className={styles.slotCell}>
                        {g.group}
                      </th>
                      <td title={detail} aria-label={`${g.group} starters: ${detail}`}>
                        {g.starters.map(s => s.name).join(', ')}
                      </td>
                      <td
                        title={`Average opponent rank ${g.avgRank.toFixed(1)} of 32 (1 = softest)`}
                        aria-label={`${verdictCap}, average opponent rank ${g.avgRank.toFixed(1)} of 32`}
                      >
                        {verdictCap} ({g.avgRank.toFixed(1)})
                      </td>
                      <td>{g.proj.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                  <SwapCall
                    key={`${f.slot}-${f.starterName}-${f.challengerName}`}
                    flag={f}
                    impact={swapImpacts.get(`${f.slot}-${f.starterName}-${f.challengerName}`)}
                  />
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
  // --- League TD/usage components: the same free Sleeper fetch + join
  // as Start/Sit (see leagueComponents.ts). League playerWeeklyPoints is
  // points-only, so the Matchup page priced the TD regression and
  // usage-trend terms as 0; the runtime join covers every league roster,
  // and a failed fetch degrades silently to the old behavior. League
  // points stay authoritative — only the components come from Sleeper.
  // At the production defaults both terms are strength 0, so wiring them
  // changes no number today.
  const [leagueComponents, setLeagueComponents] = useState<WeeklyPprPoints | null>(null);
  useEffect(() => {
    const throughWeek = (league.currentWeek ?? 1) - 1;
    if (throughWeek < 1) return;
    let cancelled = false;
    fetchWeeklyPprPoints(league.season, throughWeek)
      .then(r => {
        if (!cancelled && r && r.weeks.length > 0) setLeagueComponents(r);
      })
      .catch(() => {
        // Silent degrade: league points still render, terms stay 0.
      });
    return () => {
      cancelled = true;
    };
  }, [league.season, league.currentWeek]);
  const componentMaps = useMemo(
    () =>
      leagueComponents
        ? mapSleeperComponentsToRosterKeys(
            league.teams.flatMap(t => t.roster ?? []),
            leagueComponents.tdPtsBySleeperId,
            leagueComponents.usageBySleeperId,
          )
        : undefined,
    [leagueComponents, league.teams],
  );

  const previews = useMemo(
    () => previewWeeklyMatchups(league, { componentMaps }),
    [league, componentMaps],
  );
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
          {preview && <MatchupDetail key={`${preview.week}-${preview.teamAId}-${preview.teamBId}`} league={league} preview={preview} componentMaps={componentMaps} />}
        </>
      )}

      <p className={styles.method}>
        Projected scores come from TraderApe&apos;s weekly projection model
        (recency-weighted form blended with the season baseline, nudged by
        this week&apos;s matchup difficulty — the same engine as Start/Sit),
        priced on completed weeks only. Win probabilities are Monte Carlo:
        10,000 simulated weeks, each starter&apos;s score drawn from his
        projection ± his own week-to-week volatility. Swing players carry the
        most of the matchup&apos;s variance. Position battles group each
        optimal lineup&apos;s starters by position and compare summed weekly
        projections (flexed players count in their own position group). Start/sit flags name bench
        players within {TOSS_UP_THRESHOLD} points of a starter&apos;s
        projection — close calls worth a second look, not orders. Each
        close call also shows how the focus team&apos;s win chance moves
        if the swap is made (same seeded 2,000-sim Monte Carlo as the
        baseline, so the delta is the swap&apos;s effect, not sim noise). Win-now
        trades re-price the Trade Finder&apos;s 1-for-1 swaps on this
        week&apos;s Monte Carlo win probability (same seeded sims as the
        baseline), showing only swaps that lift the focus team&apos;s win
        chance by 2+ points. Attack plan groups the focus team&apos;s optimal
        starters by position and ranks the groups on the softness of the NFL
        defenses they face this week (opponent&apos;s fantasy points allowed vs
        the position over completed weeks — a difficulty map, not a forecast).
        Guidance
        only: nothing here changes any lineup. Schedule from the owner&apos;s
        latest sync. Series history counts this season&apos;s completed weeks only.
        Live score (Sleeper&apos;s weekly stats, auto-refreshing while games
        are live) prices starters whose NFL games have started at their
        actual points and everyone else at their TraderApe projection; the
        live win probability reuses the same 30-pt ≈ 91% calibration as the
        pre-game preview.
      </p>
    </div>
  );
}
