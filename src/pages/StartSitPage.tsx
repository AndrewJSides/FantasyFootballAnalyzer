import { useEffect, useMemo, useState } from 'react';
import type { League, Player } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { DataAsOf } from '@/components/DataAsOf';
import { NflTeamLabel, PosBadge } from '@/components';
import { POOL } from '@/data/draftPool';
import { fetchWeeklyPprPoints, type WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import { DEFAULT_ROSTER_SLOTS } from '@/utils/draftDefaults';
import {
  normalizeLineupPos,
  optimalLineup,
  slotEligiblePositions,
  type OptimalLineupPlayer,
} from '@/utils/optimalLineup';
import {
  projectWeeklyPoints,
  projectionReason,
  type WeeklyProjection,
} from '@/utils/weeklyProjection';
import {
  currentWeekEstimate,
  getMatchupRating,
  leagueAvgAllowed,
  matchupDataWeeks,
  matchupLabel,
  matchupShort,
  type MatchupRating,
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

interface ScoredPlayer extends OptimalLineupPlayer {
  player: Player;
  nflTeam: string;
  ppg: number | null;
  last3: number | null;
  projection: WeeklyProjection | null;
  bye: number | null;
  onBye: boolean;
  matchup: MatchupRating | null;
}

interface RosterScoreInputs {
  roster: Player[];
  weeklyPoints?: Record<string, Record<string, number>>;
  gamesBySleeperId?: Record<string, number[]>;
  gamesSeason?: number;
  season?: number;
  currentWeek?: number;
}

// Shared scoring core: league mode feeds league-loaded weekly points, guest
// mode feeds Sleeper weekly PPR fetched at runtime. Rank on the projection
// where one exists; fall back to the season average (or zero with no data at
// all) so a roster still gets a lineup instead of an empty one.
function scoreRosterPlayers(inputs: RosterScoreInputs): ScoredPlayer[] {
  const poolIndex = indexPool(POOL);
  const { roster, weeklyPoints, gamesBySleeperId, gamesSeason, season, currentWeek } = inputs;
  return roster.map(rosterPlayer => {
    // Weekly points are keyed by platform player id; try both id spaces
    // (Sleeper ids live in one, ESPN/Yahoo in the other).
    const weekly =
      weeklyPoints?.[rosterPlayer.platformId] ?? weeklyPoints?.[rosterPlayer.id];
    const weeks = weekly
      ? Object.entries(weekly)
          .map(([w, pts]) => ({ week: Number(w), pts }))
          .filter(e => Number.isFinite(e.week))
          .sort((a, b) => a.week - b.week)
      : [];
    const completed =
      currentWeek !== undefined ? weeks.filter(e => e.week < currentWeek) : weeks;
    const usable = completed.length > 0 ? completed : weeks;
    // Games played, where the loader supplies it (Sleeper ids): the count
    // of completed weeks the player actually played. Otherwise the weekly
    // entry count stands in — a 0-point week still counts as played when
    // the platform reports it, and the weekly fallback only undercounts
    // players whose platform omits scoreless weeks.
    const gpWeeks =
      gamesSeason === season && gamesBySleeperId
        ? (gamesBySleeperId[rosterPlayer.platformId] ??
          gamesBySleeperId[rosterPlayer.id])
        : undefined;
    const gpCompleted = gpWeeks
      ? currentWeek !== undefined
        ? gpWeeks.filter(w => w < currentWeek).length
        : gpWeeks.length
      : null;
    const games = gpCompleted ?? (usable.length > 0 ? usable.length : null);
    const total =
      rosterPlayer.seasonPoints ?? (usable.length > 0 ? usable.reduce((s, e) => s + e.pts, 0) : null);
    const ppg = games !== null && games > 0 && total !== null ? round1(total / games) : null;
    const last3Entries = usable.slice(-3);
    const last3 =
      last3Entries.length > 0
        ? round1(last3Entries.reduce((s, e) => s + e.pts, 0) / last3Entries.length)
        : null;
    // Matchup context for the numeric projection blend: the opponent's
    // allowed-vs-position and the league-wide average, so the model nudges
    // the projection up for soft matchups and down for tough ones. Same
    // rating object also feeds the Matchup column, so the number and the
    // display never disagree.
    const matchup = getMatchupRating(rosterPlayer.team, rosterPlayer.position, currentWeek);
    const leagueAvg = leagueAvgAllowed(rosterPlayer.position);
    const matchupContext =
      matchup !== null && leagueAvg !== null
        ? { avgAllowed: matchup.avgAllowed, leagueAverage: leagueAvg }
        : null;
    const projection = projectWeeklyPoints(completed, gpCompleted, matchupContext);
    const bye = resolvePoolPlayer(rosterPlayer, poolIndex)?.bye ?? null;
    return {
      id: rosterPlayer.id,
      name: rosterPlayer.name,
      position: rosterPlayer.position,
      score: projection?.projection ?? ppg ?? 0,
      player: rosterPlayer,
      nflTeam: rosterPlayer.team,
      ppg,
      last3,
      projection,
      bye,
      onBye: bye !== null && currentWeek !== undefined && bye === currentWeek,
      matchup,
    };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

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

  // Bye-week players score zero this week, so they never start no matter
  // their average — they stay in the bench list with the reason attached.
  const lineup = useMemo(
    () => optimalLineup(scored.filter(s => !s.onBye), slots),
    [scored, slots],
  );
  const benched: ScoredPlayer[] = useMemo(() => {
    const bench = lineup.bench as ScoredPlayer[];
    const byeBench = scored.filter(s => s.onBye);
    return [...bench, ...byeBench].sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0));
  }, [lineup, scored]);
  const byePlayers = scored.filter(s => s.onBye);
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
    const sScore = s.projection?.projection ?? s.ppg;
    if (!displaced || sScore === null || sScore === undefined)
      return 'No starting slot at this position.';
    // Compare on the same basis: projected vs projected, else season average
    // vs season average, so the gap is never a mixed-unit number.
    const displacedScore = s.projection
      ? displaced.score
      : (displaced.ppg ?? displaced.score);
    const unit = s.projection ? 'projected pts' : 'pts/game';
    return `${round1(displacedScore - sScore)} ${unit} behind the ${starterById.get(displaced.id)} starter.`;
  };

  const starterReason = (s: ScoredPlayer, slot: string): string => {
    const base = slotReason(slot);
    if (s.projection) return `${base}. ${projectionReason(s.projection, s.matchup?.opponent)}`;
    return `${base}${trendLabel(s.ppg, s.last3)}.`;
  };

  const slotReason = (slot: string): string => {
    switch (slot) {
      case 'FLEX':
        return 'Highest average among remaining RB/WR/TE';
      case 'SUPERFLEX':
        return 'Highest average among remaining QB/RB/WR/TE';
      default:
        return `Highest average at ${slot}`;
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
            ? `${displayName}: optimal lineup projects ${lineup.totalScore} points.`
            : ''}
        </div>

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
              Optimal starters · {lineup.totalScore} projected points combined
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
              {isGuest
                ? ' Weekly stats from Sleeper\u2019s public data (full PPR).'
                : ''}{' '}
              This does not yet see injuries or news, so check those before lock.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
