import { useEffect, useMemo, useState } from 'react';
import type { League, Player } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { DataAsOf } from '@/components/DataAsOf';
import { NflTeamLabel, PosBadge } from '@/components';
import { POOL } from '@/data/draftPool';
import { fetchWeeklyPprPoints, type WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { DEFAULT_ROSTER_SLOTS } from '@/utils/draftDefaults';
import { round1, scoreRosterPlayers, type ScoredPlayer } from '@/utils/rosterScoring';
import {
  LINEUP_MODES,
  modeScore,
  modeScoreUnit,
  modeSlotVerb,
  modeTotalUnit,
  suggestedModeFromWinProb,
  type LineupMode,
} from '@/utils/lineupMode';
import { previewWeeklyMatchups } from '@/utils/matchupPreview';
import {
  normalizeLineupPos,
  optimalLineup,
  slotEligiblePositions,
} from '@/utils/optimalLineup';
import { projectionReason } from '@/utils/weeklyProjection';
import {
  currentWeekEstimate,
  matchupDataWeeks,
  matchupLabel,
  matchupShort,
} from '@/utils/matchupRating';
import styles from './StartSitPage.module.css';

interface StartSitPageProps {
  league: League;
}

// Start/Sit optimizer (backlog item 1): the optimal starting lineup ranked by
// projected points for the coming week — recency-weighted last-4 form
// blended with the season baseline and nudged by matchup difficulty
// (opponent's points allowed vs position), so one big week can't over-swing
// it. Players on bye in the current week are benched regardless of
// projection: they score zero that week. The Matchup column shows the week's
// opponent and how the defense grades vs the player's position (from
// completed weeks); the same rating feeds the numeric blend, so the number
// and the display never disagree.
//
// Guest mode: visitors with no connected league get the same optimizer on a
// manually entered roster. Weekly PPR points come from Sleeper's free public
// stats (no auth) instead of league-loaded weekly points; everything else —
// projection model, matchup ratings, bye benching — runs identically.


function trendLabel(ppg: number | null, last3: number | null): string {
  if (ppg === null || last3 === null) return '';
  if (last3 >= ppg + 2) return ' · trending up';
  if (last3 <= ppg - 2) return ' · cooling off';
  return '';
}

// Guest roster persistence: sessionStorage, matching the guest-settings
// convention — a guest is a single-session notion that clears with the tab.
// Only pool ids with a Sleeper id (i.e. weekly data available) are kept.
const GUEST_ROSTER_KEY = 'guest-start-sit-roster';

function loadGuestRosterIds(): string[] {
  try {
    const raw = sessionStorage.getItem(GUEST_ROSTER_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw) as unknown;
    if (!Array.isArray(ids)) return [];
    const valid = new Set(POOL.players.filter(p => p.sleeperId).map(p => p.id));
    return ids.filter((id): id is string => typeof id === 'string' && valid.has(id));
  } catch {
    return [];
  }
}

// Guest player search: match against the bundled pool by name, like the
// trade analyzer's manual mode. Exact prefix hits rank before looser infix
// hits so typing "ja" offers Ja'Marr Chase before mid-name matches. Only
// players with a Sleeper id are offered: without one there is no weekly
// data to score them on.
function searchPool(query: string, exclude: Set<string>, limit = 8): PoolPlayer[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const prefix: PoolPlayer[] = [];
  const infix: PoolPlayer[] = [];
  for (const p of POOL.players) {
    if (!p.sleeperId || exclude.has(p.id)) continue;
    const name = p.name.toLowerCase();
    if (name.startsWith(q)) {
      if (prefix.length < limit) prefix.push(p);
    } else if (name.includes(q)) {
      if (infix.length < limit) infix.push(p);
    }
    if (prefix.length >= limit && infix.length >= limit) break;
  }
  return [...prefix, ...infix].slice(0, limit);
}

export function StartSitPage({ league }: StartSitPageProps) {
  // Tab title matches the other league pages; leaving restores the Teams
  // title (the page this links from most often).
  useEffect(() => {
    document.title = 'Start/Sit Optimizer · TraderApe';
    return () => {
      document.title = 'Teams · TraderApe';
    };
  }, []);

  const isGuest = league.isGuest === true;
  // A guest has no league.currentWeek; estimate it from the matchup data's
  // completed weeks (same estimate the matchup chips use everywhere).
  const guestWeek = useMemo(() => currentWeekEstimate(), []);
  const currentWeek = isGuest ? guestWeek : league.currentWeek;
  const slots = league.rosterSlots ?? DEFAULT_ROSTER_SLOTS;

  const [teamId, setTeamId] = useState<string | undefined>(() => {
    const mine = league.teams.find(t => t.isMyTeam);
    return (mine ?? league.teams[0])?.id;
  });
  const team = league.teams.find(t => t.id === teamId) ?? league.teams[0];

  // --- Guest roster builder -------------------------------------------------
  const [guestRosterIds, setGuestRosterIds] = useState<string[]>(loadGuestRosterIds);
  useEffect(() => {
    try {
      sessionStorage.setItem(GUEST_ROSTER_KEY, JSON.stringify(guestRosterIds));
    } catch {
      // Private-mode / quota / disabled storage: in-memory state still works.
    }
  }, [guestRosterIds]);
  const guestRoster: PoolPlayer[] = useMemo(() => {
    const byId = new Map(POOL.players.map(p => [p.id, p]));
    return guestRosterIds
      .map(id => byId.get(id))
      .filter((p): p is PoolPlayer => p !== undefined);
  }, [guestRosterIds]);
  const [query, setQuery] = useState('');
  const excludeIds = useMemo(() => new Set(guestRosterIds), [guestRosterIds]);
  const searchResults = useMemo(
    () => searchPool(query, excludeIds),
    [query, excludeIds],
  );
  const addGuestPlayer = (p: PoolPlayer) => {
    setGuestRosterIds(ids => (ids.includes(p.id) ? ids : [...ids, p.id]));
    setQuery('');
  };
  const removeGuestPlayer = (id: string) =>
    setGuestRosterIds(ids => ids.filter(x => x !== id));

  // --- Guest weekly data: Sleeper public stats, free, no auth ---------------
  const [guestWeekly, setGuestWeekly] = useState<WeeklyPprPoints | null>(null);
  const [guestWeeklyState, setGuestWeeklyState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  useEffect(() => {
    if (!isGuest) return;
    let cancelled = false;
    setGuestWeeklyState('loading');
    // A guest league's season is the pool season; score completed weeks only.
    fetchWeeklyPprPoints(league.season, guestWeek - 1)
      .then(r => {
        if (cancelled) return;
        if (!r || r.weeks.length === 0) {
          setGuestWeeklyState('error');
        } else {
          setGuestWeekly(r);
          setGuestWeeklyState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setGuestWeeklyState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [isGuest, league.season, guestWeek]);
  const retryGuestWeekly = () => {
    setGuestWeeklyState('loading');
    fetchWeeklyPprPoints(league.season, guestWeek - 1)
      .then(r => {
        if (!r || r.weeks.length === 0) {
          setGuestWeeklyState('error');
        } else {
          setGuestWeekly(r);
          setGuestWeeklyState('ready');
        }
      })
      .catch(() => setGuestWeeklyState('error'));
  };

  // --- Score the active roster ----------------------------------------------
  const roster: Player[] = useMemo(
    () =>
      isGuest
        ? guestRoster.map(p => ({
            id: p.id,
            platformId: p.sleeperId ?? p.id,
            name: p.name,
            position: p.pos,
            team: p.team,
          }))
        : (team?.roster ?? []),
    [isGuest, guestRoster, team],
  );
  const weeklyPoints = isGuest ? guestWeekly?.pointsBySleeperId : league.playerWeeklyPoints;

  const scored = useMemo<ScoredPlayer[]>(
    () =>
      scoreRosterPlayers({
        roster,
        weeklyPoints,
        gamesBySleeperId: isGuest
          ? guestWeekly?.gamesBySleeperId
          : league.gamesPlayed?.bySleeperId,
        gamesSeason: isGuest ? guestWeekly?.season : league.gamesPlayed?.season,
        season: league.season,
        currentWeek,
      }),
    [roster, weeklyPoints, isGuest, guestWeekly, league.gamesPlayed, league.season, currentWeek],
  );

  // --- Lineup mode: floor/ceiling re-ranking (backlog item 25) ----------------
  // The optimizer's greedy slot pass ranks on ScoredPlayer.score, so each mode
  // re-scores the roster on its own basis (projection / P75 upside / P25
  // floor) before the lineup is built. Switching modes swaps the lineup in
  // place, like the team picker.
  const [mode, setMode] = useState<LineupMode>('balanced');
  const [modePinned, setModePinned] = useState(false);

  // Auto-suggest the mode from this week's win probability (item 25
  // remainder): chase ceiling under 40%, protect floor over 60%, balanced
  // in between. Reuses the same Monte Carlo matchup preview as the Matchup
  // page, so the two pages never disagree. A manual radio choice pins the
  // mode for the session; until then the suggestion re-applies when the
  // team (and therefore the matchup) changes.
  const previews = useMemo(() => previewWeeklyMatchups(league), [league]);
  const teamById = useMemo(
    () => new Map(league.teams.map(t => [t.id, t])),
    [league.teams],
  );
  const myPreview = useMemo(
    () =>
      previews.find(p => p.teamAId === team?.id || p.teamBId === team?.id) ??
      null,
    [previews, team],
  );
  const myWinProb = useMemo(() => {
    if (!myPreview || !team) return null;
    return myPreview.teamAId === team.id
      ? myPreview.winProbA
      : 100 - myPreview.winProbA;
  }, [myPreview, team]);
  const suggestedMode = useMemo(
    () => suggestedModeFromWinProb(myWinProb),
    [myWinProb],
  );
  useEffect(() => {
    if (!modePinned) setMode(suggestedMode);
  }, [suggestedMode, modePinned]);
  const oppName =
    myPreview && team
      ? teamById.get(
          myPreview.teamAId === team.id ? myPreview.teamBId : myPreview.teamAId,
        )?.name ?? 'your opponent'
      : 'your opponent';
  const pickMode = (m: LineupMode) => {
    setModePinned(true);
    setMode(m);
  };
  const modeScored = useMemo<ScoredPlayer[]>(
    () => scored.map(s => ({ ...s, score: modeScore(s, mode) })),
    [scored, mode],
  );

  // Bye-week players score zero this week, so they never start no matter
  // their average — they stay in the bench list with the reason attached.
  const lineup = useMemo(
    () => optimalLineup(modeScored.filter(s => !s.onBye), slots),
    [modeScored, slots],
  );
  const benched: ScoredPlayer[] = useMemo(() => {
    const bench = lineup.bench as ScoredPlayer[];
    const byeBench = modeScored.filter(s => s.onBye);
    return [...bench, ...byeBench].sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0));
  }, [lineup, modeScored]);
  const byePlayers = modeScored.filter(s => s.onBye);
  const starterById = new Map(
    lineup.starters
      .filter(s => s.player)
      .map(s => [s.player!.id, s.slot] as const),
  );

  const benchReason = (s: ScoredPlayer): string => {
    if (s.onBye) return `On bye in week ${currentWeek} — sits regardless of projection.`;
    const pos = normalizeLineupPos(s.position);
    // The lowest starter this player could have displaced, if any.
    const displaced = lineup.starters
      .filter(a => a.player && slotEligiblePositions(a.slot).includes(pos))
      .map(a => a.player as ScoredPlayer)
      .sort((a, b) => a.score - b.score)[0];
    const sScore = modeScore(s, mode);
    if (!displaced || !Number.isFinite(sScore))
      return 'No starting slot at this position.';
    // Compare on the mode's own basis (projection / P75 upside / P25 floor),
    // never a mixed-unit number.
    const unit = modeScoreUnit(mode, s.projection !== null);
    const modeNote =
      mode === 'balanced'
        ? ''
        : mode === 'ceiling'
          ? ' P75 upside — the underdog play.'
          : ' P25 floor — the favorite\u2019s play.';
    return `${round1(displaced.score - sScore)} ${unit} behind the ${starterById.get(displaced.id)} starter.${modeNote}`;
  };

  const starterReason = (s: ScoredPlayer, slot: string): string => {
    const base = slotReason(slot);
    const projection = s.projection;
    if (mode === 'balanced' || !projection) {
      return projection
        ? `${base}. ${projectionReason(projection, s.matchup?.opponent)}`
        : `${base}${trendLabel(s.ppg, s.last3)}.`;
    }
    // Ceiling/floor modes: name the mode-adjusted number the ranking ran on,
    // then the underlying projection reason for checkability.
    const which = mode === 'ceiling' ? 'Chase ceiling' : 'Protect floor';
    const pct = mode === 'ceiling' ? 'P75 upside' : 'P25 floor';
    return `${which}: starts on ${pct} ${modeScore(s, mode)} (${projectionReason(projection, s.matchup?.opponent)})`;
  };

  const slotReason = (slot: string): string => {
    const verb = modeSlotVerb(mode);
    switch (slot) {
      case 'FLEX':
        return `Highest ${verb} among remaining RB/WR/TE`;
      case 'SUPERFLEX':
        return `Highest ${verb} among remaining QB/RB/WR/TE`;
      default:
        return `Highest ${verb} at ${slot}`;
    }
  };

  const displayName = isGuest ? 'Your roster' : team?.name;
  const guestDataPending = isGuest && guestWeeklyState !== 'ready';

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Start/Sit Optimizer</h1>
          <DataAsOf syncedAt={league.pinSyncedAt} />
          <p className={styles.subtitle}>
            {isGuest
              ? `No league connected — build your roster below and get an optimal lineup for week ${guestWeek}, ranked by projected points.`
              : currentWeek !== undefined
                ? `Optimal lineup for week ${currentWeek}, ranked by projected points — recent form blended with season average.`
                : 'Optimal lineup from this roster, ranked by projected points — recent form blended with season average.'}{' '}
            Matchup ratings use the opponent&apos;s points allowed vs position from
            completed weeks {matchupDataWeeks()[0]}–{matchupDataWeeks()[1]}.
          </p>
        </div>

        {isGuest ? (
          <div className={styles.rosterBuilder}>
            <label htmlFor="guest-player-search" className={styles.searchLabel}>
              Add players to your roster
            </label>
            <input
              id="guest-player-search"
              type="search"
              className={styles.searchInput}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type a player name…"
              autoComplete="off"
              aria-describedby="guest-search-hint"
            />
            <p id="guest-search-hint" className={styles.searchHint}>
              Search the player pool — weekly stats come from Sleeper&apos;s
              public data, no account needed.
            </p>
            {searchResults.length > 0 && (
              <ul className={styles.searchResults} aria-label="Matching players">
                {searchResults.map(p => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={styles.searchResult}
                      onClick={() => addGuestPlayer(p)}
                      aria-label={`Add ${p.name} to your roster`}
                    >
                      {p.name} <PosBadge pos={p.pos} /> <NflTeamLabel team={p.team} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {guestRoster.length > 0 && (
              <>
                <h2 className={styles.rosterTitle}>
                  Your roster · {guestRoster.length} player{guestRoster.length === 1 ? '' : 's'}
                </h2>
                <ul className={styles.rosterList} aria-label="Your roster">
                  {guestRoster.map(p => (
                    <li key={p.id} className={styles.rosterItem}>
                      <span>
                        {p.name} <PosBadge pos={p.pos} /> <NflTeamLabel team={p.team} />
                      </span>
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => removeGuestPlayer(p.id)}
                        aria-label={`Remove ${p.name} from your roster`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <label className={styles.teamPicker}>
            Team
            <select
              aria-label="Team to optimize"
              value={team?.id ?? ''}
              onChange={e => setTeamId(e.target.value)}
            >
              {league.teams.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {/* Picking a team (or editing the guest roster) swaps the lineup in
            place with no navigation, so announce the new total (matches the
            Waivers/Trade Analyzer in-place swap pattern). Always mounted. */}
        <div aria-live="polite" className="visually-hidden">
          {displayName && !guestDataPending
            ? `${displayName}: ${LINEUP_MODES.find(m => m.id === mode)?.label} lineup combines for ${lineup.totalScore} ${modeTotalUnit(mode)}.`
            : ''}
        </div>

        {/* Lineup mode: balanced / chase ceiling / protect floor. Switching
            re-ranks the lineup in place; the radio labels carry accessible
            names and the hints explain when each mode is the right call. */}
        {!guestDataPending && (
          <fieldset className={styles.modeGroup}>
            <legend className={styles.modeLegend}>Lineup mode</legend>
            <div className={styles.modeOptions}>
              {LINEUP_MODES.map(m => (
                <label key={m.id} className={styles.modeOption} title={m.hint}>
                  <input
                    type="radio"
                    name="lineup-mode"
                    value={m.id}
                    checked={mode === m.id}
                    onChange={() => pickMode(m.id)}
                    aria-describedby="lineup-mode-hint"
                  />
                  {m.label}
                </label>
              ))}
            </div>
            <p id="lineup-mode-hint" className={styles.modeHint}>
              A favorite wants steady floors; an underdog needs ceiling.
              {mode !== 'balanced'
                ? ` Now ranking on ${mode === 'ceiling' ? 'P75 upside' : 'P25 floor'} from each player\u2019s own week-to-week volatility.`
                : ''}
            </p>
            {!isGuest && myPreview && myWinProb !== null && (
              <p className={styles.modeSuggest} aria-live="polite">
                Suggested: {LINEUP_MODES.find(m => m.id === suggestedMode)?.label}
                {' '}— {round1(myWinProb)}% {myWinProb >= 50 ? 'favorite' : 'underdog'} vs{' '}
                {oppName} this week.
                {modePinned ? ' Your pick overrides the suggestion.' : ''}
              </p>
            )}
          </fieldset>
        )}

        {isGuest && guestWeeklyState === 'loading' && (
          <div className={styles.empty} role="status">
            <h2>Loading weekly stats…</h2>
            <p>Pulling this season&apos;s per-week points from Sleeper&apos;s public data.</p>
          </div>
        )}

        {isGuest && guestWeeklyState === 'error' && (
          <div className={styles.empty} role="alert">
            <h2>Weekly stats didn&apos;t load</h2>
            <p>
              Sleeper&apos;s public stats didn&apos;t respond. Check your
              connection and try again — your roster is saved.
            </p>
            <button type="button" className={styles.retryButton} onClick={retryGuestWeekly}>
              Try again
            </button>
          </div>
        )}

        {!guestDataPending && (isGuest ? roster.length === 0 : !team || !team.roster || team.roster.length === 0) ? (
          <div className={styles.empty}>
            <h2>{isGuest ? 'No players yet' : 'No roster for this team'}</h2>
            <p>
              {isGuest
                ? 'Search above to add the players on your fantasy team.'
                : 'Sync the league from the Owner Console and this page will fill in.'}
            </p>
          </div>
        ) : !guestDataPending && (
          <>
            {byePlayers.length > 0 && (
              <p className={styles.byeWarning} role="status">
                On bye{currentWeek !== undefined ? ` in week ${currentWeek}` : ''} — benched
                automatically: {byePlayers.map(s => s.name).join(', ')}.
              </p>
            )}
            <h2 className={styles.sectionTitle}>
              Optimal starters · {lineup.totalScore} {modeTotalUnit(mode)} combined
            </h2>
            <table className={styles.table} aria-label={`Optimal starters for ${displayName ?? 'this roster'}`}>
              <thead>
                <tr>
                  <th scope="col">Slot</th>
                  <th scope="col">Player</th>
                  <th scope="col">Proj.</th>
                  <th scope="col">Pts/game</th>
                  <th scope="col">Last 3</th>
                  <th scope="col">Matchup</th>
                  <th scope="col">Why they start</th>
                </tr>
              </thead>
              <tbody>
                {lineup.starters.map((a, i) => {
                  const s = a.player as ScoredPlayer | null;
                  return (
                    <tr key={`${a.slot}-${i}`}>
                      <th scope="row">{a.slot}</th>
                      <td>
                        {s ? (
                          <>
                            {s.name} <PosBadge pos={s.position} />{' '}
                            <NflTeamLabel team={s.nflTeam} />
                          </>
                        ) : (
                          <span className={styles.emptySlot}>Empty — no eligible player</span>
                        )}
                      </td>
                      <td>{s?.projection?.projection ?? '—'}</td>
                      <td>{s?.ppg ?? '—'}</td>
                      <td>{s?.last3 ?? '—'}</td>
                      <td>
                        {s?.matchup ? (
                          <span title={matchupLabel(s.matchup, s.position)}>
                            {matchupShort(s.matchup)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {s ? starterReason(s, a.slot) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {benched.length > 0 && (
              <>
                <h2 className={styles.sectionTitle}>Bench</h2>
                <table className={styles.table} aria-label={`Bench for ${displayName ?? 'this roster'}`}>
                  <thead>
                    <tr>
                      <th scope="col">Player</th>
                      <th scope="col">Proj.</th>
                      <th scope="col">Pts/game</th>
                      <th scope="col">Last 3</th>
                      <th scope="col">Matchup</th>
                      <th scope="col">Why they sit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benched.map(s => (
                      <tr key={s.id}>
                        <td>
                          {s.name} <PosBadge pos={s.position} />{' '}
                          <NflTeamLabel team={s.nflTeam} />
                        </td>
                        <td>{s.projection?.projection ?? '—'}</td>
                        <td>{s.ppg ?? '—'}</td>
                        <td>{s.last3 ?? '—'}</td>
                        <td>
                          {s.matchup ? (
                            <span title={matchupLabel(s.matchup, s.position)}>
                              {matchupShort(s.matchup)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{benchReason(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p className={styles.note}>
              Projected from each player&apos;s last-4-week form blended with
              their season average and nudged by matchup difficulty, so one big
              week can&apos;t over-swing it.
              {mode !== 'balanced'
                ? ` ${mode === 'ceiling' ? 'Chase ceiling' : 'Protect floor'} re-ranks the lineup on ${mode === 'ceiling' ? 'P75 upside' : 'P25 floor'} — each player\u2019s projection ${mode === 'ceiling' ? 'plus' : 'minus'} 0.6745 \u00d7 their own week-to-week volatility.`
                : ''}
              {isGuest
                ? ' Weekly stats from Sleeper\u2019s public data (full PPR).'
                : ''}{' '}
              {!isGuest && myPreview
                ? ' The mode auto-suggests from your weekly win probability (chase ceiling below 40%, protect floor above 60%); picking a mode manually overrides it.'
                : ''}{' '}
              This does not yet see injuries or news, so check those before lock.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
