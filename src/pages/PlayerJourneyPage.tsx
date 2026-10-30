import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { League, Player, DraftPick } from '@/types';
import { NflTeamLabel, PosBadge } from '@/components';
import { DataAsOf } from '@/components/DataAsOf';
import { WeeklyPointsChart } from '@/components/WeeklyPointsChart';
import { nflTeamInfo } from '@/data/nflTeams';
import {
  buildMatchupCalendar,
  currentWeekEstimate,
  getMatchupRating,
  matchupDataWeeks,
  matchupLabel,
  matchupShort,
} from '@/utils/matchupRating';
import { AWARD_ICONS } from '@/utils/awardIcons';
import { consistencySummary } from '@/utils/consistency';
import styles from './PlayerJourneyPage.module.css';

interface PlayerJourneyPageProps {
  league: League;
}

interface PlayerJourneyEvent {
  type: 'drafted' | 'traded_to' | 'traded_from' | 'waiver_add' | 'waiver_drop' | 'fa_add' | 'fa_drop';
  timestamp: number;
  week?: number;
  teamId: string;
  teamName: string;
  details?: string;
}

interface PlayerWithJourney {
  player: Player;
  events: PlayerJourneyEvent[];
  draftPick?: DraftPick;
  currentTeam?: { id: string; name: string };
  totalSeasonPoints?: number;
}

// Yahoo placeholder names look like "Player 449.p.12345" — strip those out.
// The previous regex (/^Player\s+-?\d+$/) also matched a real player with the
// unusual name "Player 12" so we now require the dotted Yahoo key shape.
const YAHOO_PLACEHOLDER_NAME = /^Player\s+\d+\.[a-z]\.\d+$/i;

const PAGE_SIZE = 100;

export function PlayerJourneyPage({ league }: PlayerJourneyPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  // Deep-linkable selection: ?player=<id> survives refresh and can be
  // pasted into the group chat.
  const [selectedPlayerId, setSelectedPlayerIdState] = useState<string | null>(
    () => searchParams.get('player'),
  );
  // Stable identity so effects can list it as a dependency.
  const setSelectedPlayerId = useCallback((id: string | null) => {
    setSelectedPlayerIdState(id);
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (id) params.set('player', id);
      else params.delete('player');
      return params;
    }, { replace: true });
  }, [setSearchParams]);
  const [positionFilter, setPositionFilter] = useState<string>('all');
  // How many of the filtered list to actually render. Restart when the filters
  // change so the user lands at the top of the new result set.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const playersWithJourneys = useMemo(() => {
    const playerMap = new Map<string, PlayerWithJourney>();

    // Helper to get or create player entry
    const getPlayer = (player: Player): PlayerWithJourney => {
      let entry = playerMap.get(player.id);
      if (!entry) {
        entry = {
          player,
          events: [],
          totalSeasonPoints: player.seasonPoints,
        };
        playerMap.set(player.id, entry);
      }
      return entry;
    };

    // 1. Process draft picks
    league.teams.forEach(team => {
      team.draftPicks?.forEach(pick => {
        const entry = getPlayer(pick.player);
        entry.draftPick = pick;
        entry.totalSeasonPoints = pick.seasonPoints || entry.totalSeasonPoints;
        entry.events.push({
          type: 'drafted',
          timestamp: 0, // Draft happens before season
          teamId: team.id,
          teamName: team.name,
          details: `Round ${pick.round}, Pick ${pick.pickNumber}${pick.auctionValue ? ` ($${pick.auctionValue})` : ''}`,
        });
      });
    });

    // 2. Process transactions (waivers/free agents)
    league.teams.forEach(team => {
      team.transactions?.forEach(tx => {
        if (tx.type === 'trade') return; // Handle trades separately

        tx.adds.forEach(player => {
          const entry = getPlayer(player);
          entry.events.push({
            type: tx.type === 'waiver' ? 'waiver_add' : 'fa_add',
            timestamp: tx.timestamp,
            week: tx.week,
            teamId: team.id,
            teamName: team.name,
            details: tx.waiverBudgetSpent ? `$${tx.waiverBudgetSpent} FAAB` : undefined,
          });
        });

        tx.drops.forEach(player => {
          const entry = getPlayer(player);
          entry.events.push({
            type: tx.type === 'waiver' ? 'waiver_drop' : 'fa_drop',
            timestamp: tx.timestamp,
            week: tx.week,
            teamId: team.id,
            teamName: team.name,
          });
        });
      });
    });

    // 3. Process trades. One merged "A → B" event per player per trade:
    // the old separate traded_from/traded_to pair showed the same trade as
    // two timeline entries.
    league.trades?.forEach(trade => {
      trade.teams.forEach(team => {
        team.playersReceived.forEach(player => {
          const sender = trade.teams.find(t =>
            t.teamId !== team.teamId && t.playersSent.some(p => p.id === player.id),
          );
          const entry = getPlayer(player);
          entry.events.push({
            type: 'traded_to',
            timestamp: trade.timestamp,
            week: trade.week,
            teamId: team.teamId,
            teamName: team.teamName,
            details: sender ? `from ${sender.teamName}` : undefined,
          });
        });
      });
    });

    // 4. Add players from current rosters (for those not in transactions)
    league.teams.forEach(team => {
      team.roster?.forEach(player => {
        const entry = getPlayer(player);
        entry.currentTeam = { id: team.id, name: team.name };
        if (player.seasonPoints !== undefined) {
          entry.totalSeasonPoints = player.seasonPoints;
        }
      });
    });

    // 5. Sort events by timestamp for each player
    playerMap.forEach(entry => {
      entry.events.sort((a, b) => a.timestamp - b.timestamp);
    });

    return Array.from(playerMap.values());
  }, [league]);

  // Get unique positions for filter
  const positions = useMemo(() => {
    const posSet = new Set<string>();
    playersWithJourneys.forEach(p => {
      if (p.player.position && p.player.position !== 'Unknown') {
        posSet.add(p.player.position);
      }
    });
    return Array.from(posSet).sort();
  }, [playersWithJourneys]);

  // Filter players based on search and position
  const filteredPlayers = useMemo(() => {
    return playersWithJourneys
      .filter(p => {
        // Filter out Yahoo placeholder names like "Player 449.p.12345".
        // Deliberately NOT the shared isPlaceholderPlayer: see the comment
        // on YAHOO_PLACEHOLDER_NAME (the loose form once hid a real entry).
        if (YAHOO_PLACEHOLDER_NAME.test(p.player.name)) return false;

        // Search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          if (!p.player.name.toLowerCase().includes(query)) return false;
        }

        // Position filter
        if (positionFilter !== 'all' && p.player.position !== positionFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by event count descending, fall back to season points
        if (a.events.length !== b.events.length) {
          return b.events.length - a.events.length;
        }
        const aPoints = a.totalSeasonPoints || 0;
        const bPoints = b.totalSeasonPoints || 0;
        return bPoints - aPoints;
      });
  }, [playersWithJourneys, searchQuery, positionFilter]);

  // Get selected player details
  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerId) return null;
    return playersWithJourneys.find(p => p.player.id === selectedPlayerId) || null;
  }, [selectedPlayerId, playersWithJourneys]);

  // Title the tab with the selected player's name: tabs and history entries
  // for different players stay tellable apart (matches the Trade Analyzer's
  // verdict title). App.tsx's per-page title effect only fires on pathname
  // change, and ?player= never changes the pathname, so this owns the title
  // while a player is selected; clearing the selection or leaving the page
  // restores the page title.
  useEffect(() => {
    if (!selectedPlayer) return;
    document.title = `${selectedPlayer.player.name} · TraderApe`;
    return () => {
      document.title = 'Player Journey · TraderApe';
    };
  }, [selectedPlayer]);

  // Weekly matchup difficulty (backlog item 2): the selected player's week-N
  // opponent and that opponent's points allowed vs the position from
  // completed weeks — the same rating the Rankings, Start/Sit, and Trade
  // Analyzer pages show. Renders a dim dash for bye weeks and K/DST, which
  // the rating doesn't cover.
  const matchupWeek = league.currentWeek ?? currentWeekEstimate();
  const matchupRating = selectedPlayer
    ? getMatchupRating(
        selectedPlayer.player.team,
        selectedPlayer.player.position,
        matchupWeek,
      )
    : null;
  const matchupClass = !matchupRating
    ? styles.matchupDash
    : matchupRating.label === 'favorable'
      ? styles.muFav
      : matchupRating.label === 'tough'
        ? styles.muTough
        : styles.muNeutral;

  // Season matchup calendar (backlog item 31): every remaining week with
  // that week's opponent and the same favorable/tough/neutral rating as the
  // weekly card. A difficulty map, not a forecast — every future week
  // prices the same season-to-date allowed averages. Hidden for K/DST and
  // when no week carries a rating (unknown team).
  const matchupCalendar = selectedPlayer
    ? buildMatchupCalendar(
        selectedPlayer.player.team,
        selectedPlayer.player.position,
        matchupWeek,
      )
    : [];
  const showMatchupCalendar = matchupCalendar.some(e => e.rating !== null);

  // Weekly points series for the value-over-time chart (backlog item 8)
  // and the per-stint scoring below — the same series drives both. Absent
  // when the league snapshot has no weekly points (guest mode, old saves),
  // in which case both sections hide gracefully.
  const weekly = selectedPlayer
    ? league.playerWeeklyPoints?.[selectedPlayer.player.id]
    : undefined;

  // Week-to-week consistency (backlog item 20): floor/ceiling from the
  // player's own played weeks, boom/bust counts against TraderApe's own
  // per-position bars. Needs the same weekly series as the chart, so it
  // hides in the same cases (guest mode, old snapshots) and when fewer
  // than 3 games are played.
  const consistency = useMemo(
    () =>
      selectedPlayer
        ? consistencySummary(weekly, selectedPlayer.player.position)
        : null,
    [weekly, selectedPlayer],
  );

  // Per-stint scoring: the payoff of a journey page. Each ownership stretch
  // (drafted/added week -> dropped/traded week) gets a points-per-week from
  // the platform's weekly player points, when the platform provides them.
  const stints = useMemo(() => {
    if (!selectedPlayer || !weekly) return [];

    // Ownership transitions in week order. Week 0 (draft) counts as week 1.
    const ownerEvents = selectedPlayer.events
      .filter(e => e.type === 'drafted' || e.type.endsWith('_add') || e.type === 'traded_to')
      .map(e => ({ teamName: e.teamName, fromWeek: Math.max(1, e.week ?? 1) }));
    const dropEvents = selectedPlayer.events
      .filter(e => e.type.endsWith('_drop') || e.type === 'traded_from')
      .map(e => ({ week: Math.max(1, e.week ?? 1) }));
    if (ownerEvents.length === 0) return [];

    const lastWeek = Math.max(...Object.keys(weekly).map(Number));
    return ownerEvents.map((own, i) => {
      const nextOwn = ownerEvents[i + 1];
      // The stint ends at the next ownership change, or a drop, or season end.
      const dropAfter = dropEvents.find(
        d => d.week >= own.fromWeek && (!nextOwn || d.week <= nextOwn.fromWeek),
      );
      const toWeek = Math.min(
        nextOwn ? nextOwn.fromWeek - 1 : lastWeek,
        dropAfter ? dropAfter.week : lastWeek,
      );
      let points = 0;
      let games = 0;
      for (let week = own.fromWeek; week <= toWeek; week++) {
        const pts = weekly[week];
        if (pts === undefined) continue;
        points += pts;
        games += 1;
      }
      return {
        teamName: own.teamName,
        fromWeek: own.fromWeek,
        toWeek,
        points,
        games,
        ppg: games > 0 ? points / games : 0,
      };
    }).filter(s => s.toWeek >= s.fromWeek);
  }, [selectedPlayer, weekly]);

  // Clear the right pane when the active filters would hide the current
  // selection. Otherwise the detail view shows a player who's invisible in
  // the list, which is confusing.
  useEffect(() => {
    if (!selectedPlayerId) return;
    const stillVisible = filteredPlayers.some(p => p.player.id === selectedPlayerId);
    if (!stillVisible) setSelectedPlayerId(null);
  }, [filteredPlayers, selectedPlayerId, setSelectedPlayerId]);

  // Whenever the filters change the result set, snap the visible window back
  // to the first page. Otherwise typing a search that returns 5 players would
  // still try to render whatever count the user had expanded to.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, positionFilter]);

  // Sticker art where we have it (the direction lives in the label and the
  // event color, so both trade directions share the handshake); typographic
  // marks for the rest.
  const getEventIcon = (type: PlayerJourneyEvent['type']) => {
    switch (type) {
      case 'drafted': return <img src={AWARD_ICONS.best_draft} alt="" />;
      case 'traded_to': return <img src={AWARD_ICONS.best_trade} alt="" />;
      case 'traded_from': return <img src={AWARD_ICONS.best_trade} alt="" />;
      case 'waiver_add': return <img src={AWARD_ICONS.best_waiver} alt="" />;
      case 'waiver_drop': return <img src={AWARD_ICONS.worst_waiver} alt="" />;
      case 'fa_add': return '+';
      case 'fa_drop': return '-';
    }
  };

  const getEventLabel = (type: PlayerJourneyEvent['type']) => {
    switch (type) {
      case 'drafted': return 'Drafted by';
      case 'traded_to': return 'Traded to';
      case 'traded_from': return 'Traded from';
      case 'waiver_add': return 'Waiver claim by';
      case 'waiver_drop': return 'Dropped by';
      case 'fa_add': return 'FA pickup by';
      case 'fa_drop': return 'Released by';
    }
  };

  const getEventClass = (type: PlayerJourneyEvent['type']) => {
    switch (type) {
      case 'drafted': return styles.eventDrafted;
      case 'traded_to': return styles.eventTradeIn;
      case 'traded_from': return styles.eventTradeOut;
      case 'waiver_add':
      case 'fa_add': return styles.eventAdd;
      case 'waiver_drop':
      case 'fa_drop': return styles.eventDrop;
    }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Player Journey</h1>
          <p className={styles.subtitle}>
            Track any player's path through {league.name}
          </p>
          <DataAsOf syncedAt={league.pinSyncedAt} />
        </div>

        <div className={styles.controls}>
          <div className={styles.searchBox}>
            <input
              type="search"
              placeholder="Search players..."
              enterKeyHint="search"
              // Player names are proper nouns — keep the browser's own
              // autocomplete dropdown from covering the app's search results.
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
              aria-label="Search players"
              title="Search players"
            />
          </div>
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className={styles.positionFilter}
            aria-label="Filter by position"
            title="Filter by position"
          >
            <option value="all">All Positions</option>
            {positions.map(pos => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>
        </div>

        <div className={styles.content}>
          {/* Player List */}
          <div className={styles.playerList}>
            <div className={styles.listHeader}>
              <span className={styles.listTitle}>
                {filteredPlayers.length} Players
              </span>
            </div>
            {/* The position filter and search swap the player list in
                place with no navigation, so screen readers heard nothing
                change; this announces the updated shown count for the
                active position filter. Visible text unchanged. */}
            <div aria-live="polite" className="visually-hidden">
              {filteredPlayers.length === 0
                ? 'No players found matching your search.'
                : positionFilter === 'all'
                  ? `Showing ${Math.min(visibleCount, filteredPlayers.length)} of ${filteredPlayers.length} players`
                  : `Showing ${Math.min(visibleCount, filteredPlayers.length)} of ${filteredPlayers.length} ${positionFilter} players`}
            </div>
            <div className={styles.listItems}>
              {filteredPlayers.slice(0, visibleCount).map(p => (
                <button
                  key={p.player.id}
                  type="button"
                  className={`${styles.playerItem} ${selectedPlayerId === p.player.id ? styles.selected : ''}`}
                  onClick={() => setSelectedPlayerId(p.player.id)}
                  title={`Show ${p.player.name}'s journey`}
                  aria-label={`Show ${p.player.name}'s journey`}
                >
                  <div className={styles.playerInfo}>
                    <span className={styles.playerName}>{p.player.name}</span>
                    <span className={styles.playerMeta}>
                      <PosBadge pos={p.player.position} /> <NflTeamLabel team={p.player.team} />
                    </span>
                  </div>
                  <div className={styles.playerStats}>
                    {p.totalSeasonPoints !== undefined && (
                      <span className={styles.points}>{p.totalSeasonPoints.toFixed(1)} pts</span>
                    )}
                    {p.events.length > 0 && (
                      <span className={styles.eventCount}>{p.events.length} event{p.events.length === 1 ? '' : 's'}</span>
                    )}
                  </div>
                </button>
              ))}
              {filteredPlayers.length > visibleCount && (
                <button
                  type="button"
                  className={styles.moreResults}
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  // The label says what it is; the title says what happens on
                  // click, matching the player-list buttons' title discipline.
                  title={`Load the next ${Math.min(PAGE_SIZE, filteredPlayers.length - visibleCount)} players in the list`}
                >
                  Show {Math.min(PAGE_SIZE, filteredPlayers.length - visibleCount)} more
                  {' '}({filteredPlayers.length - visibleCount} remaining)
                </button>
              )}
              {filteredPlayers.length === 0 && (
                <div className={styles.noResults}>
                  No players found matching your search.
                </div>
              )}
            </div>
          </div>

          {/* Player Detail */}
          <div className={styles.playerDetail}>
            {/* Selecting a player swaps the journey detail in place
                with no navigation, so screen readers heard nothing
                change; this announces the selected player (name plus
                position and team, and how many journey events follow).
                Visible text unchanged. */}
            {selectedPlayer && (
              <div aria-live="polite" className="visually-hidden">
                {`${selectedPlayer.player.name}, ${selectedPlayer.player.position}, ${selectedPlayer.player.team}: ${selectedPlayer.events.length} journey event${selectedPlayer.events.length === 1 ? '' : 's'}`}
              </div>
            )}
            {selectedPlayer ? (
              <>
                <div
                  className={styles.detailHeader}
                  style={
                    nflTeamInfo(selectedPlayer.player.team)
                      ? { borderLeft: `4px solid ${nflTeamInfo(selectedPlayer.player.team)!.primary}`, paddingLeft: '0.9rem' }
                      : undefined
                  }
                >
                  <div className={styles.detailInfo}>
                    <h2 className={styles.detailName}>{selectedPlayer.player.name}</h2>
                    <span className={styles.detailMeta}>
                      <PosBadge pos={selectedPlayer.player.position} />{' '}
                      <NflTeamLabel team={selectedPlayer.player.team} size="sm" />
                    </span>
                  </div>
                  {selectedPlayer.currentTeam && (
                    <div className={styles.currentTeam}>
                      <span className={styles.currentTeamLabel}>Current Team</span>
                      <span className={styles.currentTeamName}>{selectedPlayer.currentTeam.name}</span>
                    </div>
                  )}
                </div>

                {/* Stats Summary */}
                <div className={styles.statsSummary}>
                  {selectedPlayer.draftPick && (
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>
                        {selectedPlayer.draftPick.auctionValue
                          ? `$${selectedPlayer.draftPick.auctionValue}`
                          : `${selectedPlayer.draftPick.round}.${String(
                              ((selectedPlayer.draftPick.pickNumber - 1) % (league.totalTeams || 12)) + 1,
                            ).padStart(2, '0')}`}
                      </span>
                      <span className={styles.statLabel}>
                        {selectedPlayer.draftPick.auctionValue ? 'Auction Price' : 'Draft Pick'}
                      </span>
                    </div>
                  )}
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>
                      {selectedPlayer.totalSeasonPoints?.toFixed(1) || '-'}
                    </span>
                    <span className={styles.statLabel}>Season Pts</span>
                  </div>
                  {/* Weekly matchup chip: same favorable/tough/neutral rating
                      as the other pages, priced on the league's current week. */}
                  <div className={styles.statCard}>
                    <span className={styles.matchupValue}>
                      {matchupRating ? (
                        <span
                          className={matchupClass}
                          title={matchupLabel(matchupRating, selectedPlayer.player.position)}
                          aria-label={matchupLabel(matchupRating, selectedPlayer.player.position)}
                        >
                          {matchupShort(matchupRating)}
                        </span>
                      ) : (
                        <span
                          className={matchupClass}
                          aria-label="No matchup rating — bye week or position not covered"
                        >
                          -
                        </span>
                      )}
                    </span>
                    <span className={styles.statLabel}>Week {matchupWeek} Matchup</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>{selectedPlayer.events.length}</span>
                    <span className={styles.statLabel}>Transactions</span>
                  </div>
                </div>
                {/* The Matchup card reuses the Start/Sit and Trade Analyzer
                    rating, so it needs the same method line: the opponent's
                    points allowed to the position come from completed weeks,
                    and K/DST/bye weeks have no rating. */}
                <p className={styles.matchupFootnote}>
                  Matchup prices on week {matchupWeek} — the opponent's points
                  allowed to the position from completed weeks{' '}
                  {matchupDataWeeks()[0]}–{matchupDataWeeks()[1]}.
                </p>

                {/* Player value over time (backlog item 8): week-by-week
                    full-PPR points as a bar chart, so rises and falls are
                    visible. Same weekly series the stints table consumes. */}
                {weekly && (
                  <div className={styles.timeline}>
                    <h3 className={styles.timelineTitle}>Points By Week</h3>
                    <WeeklyPointsChart
                      playerName={selectedPlayer.player.name}
                      weekly={weekly}
                    />
                  </div>
                )}

                {/* Week-to-week consistency (backlog item 20): how steady
                    the player is week over week — floor/ceiling from his own
                    played weeks plus boom/bust counts. */}
                {consistency && (
                  <div className={styles.timeline}>
                    <h3 className={styles.timelineTitle}>
                      Week-to-Week Consistency
                    </h3>
                    <div className={styles.statsSummary}>
                      <div
                        className={styles.statCard}
                        aria-label={`Floor: ${consistency.floor.toFixed(1)} points (25th percentile of ${consistency.games} played weeks)`}
                      >
                        <span className={styles.statValue}>
                          {consistency.floor.toFixed(1)}
                        </span>
                        <span className={styles.statLabel}>Floor (P25)</span>
                      </div>
                      <div
                        className={styles.statCard}
                        aria-label={`Median: ${consistency.median.toFixed(1)} points across ${consistency.games} played weeks`}
                      >
                        <span className={styles.statValue}>
                          {consistency.median.toFixed(1)}
                        </span>
                        <span className={styles.statLabel}>Median</span>
                      </div>
                      <div
                        className={styles.statCard}
                        aria-label={`Ceiling: ${consistency.ceiling.toFixed(1)} points (75th percentile of ${consistency.games} played weeks)`}
                      >
                        <span className={styles.statValue}>
                          {consistency.ceiling.toFixed(1)}
                        </span>
                        <span className={styles.statLabel}>Ceiling (P75)</span>
                      </div>
                      <div
                        className={styles.statCard}
                        aria-label={`${consistency.boomWeeks} boom weeks scoring ${consistency.boomBar} or more points`}
                      >
                        <span className={styles.statValue}>
                          {consistency.boomWeeks}
                        </span>
                        <span className={styles.statLabel}>
                          Boom (≥{consistency.boomBar})
                        </span>
                      </div>
                      <div
                        className={styles.statCard}
                        aria-label={`${consistency.bustWeeks} bust weeks scoring ${consistency.bustBar} or fewer points`}
                      >
                        <span className={styles.statValue}>
                          {consistency.bustWeeks}
                        </span>
                        <span className={styles.statLabel}>
                          Bust (≤{consistency.bustBar})
                        </span>
                      </div>
                    </div>
                    {/* Verdict plus method: the swap is in place on player
                        change, so a live announcement is not needed. */}
                    <p className={styles.matchupFootnote}>
                      {selectedPlayer.player.name} is{' '}
                      <strong>{consistency.verdict}</strong> week to week (
                      {consistency.games} games). Boom/bust bars are
                      TraderApe's own per-position cutoffs (QB ≥
                      {consistency.boomBar}/≤{consistency.bustBar}; floor and
                      ceiling are the 25th/75th percentile of his played
                      weeks — bye weeks and DNPs excluded).
                    </p>
                  </div>
                )}

                {/* Season matchup calendar (backlog item 31): week-by-week
                    remaining matchups with the same rating as the weekly
                    card. Renders a "Bye" row for the team's bye week. */}
                {showMatchupCalendar && (
                  <div className={styles.timeline}>
                    <h3 className={styles.timelineTitle}>Matchup Calendar</h3>
                    <table className={styles.calendarTable}>
                      <caption>
                        {selectedPlayer.player.name}&apos;s remaining matchups,
                        weeks {matchupCalendar[0].week}–
                        {matchupCalendar[matchupCalendar.length - 1].week}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Week</th>
                          <th scope="col">Opponent</th>
                          <th scope="col">Matchup</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matchupCalendar.map(entry => (
                          <tr key={entry.week}>
                            <th scope="row">W{entry.week}</th>
                            <td>{entry.opponent ?? 'Bye'}</td>
                            <td>
                              {entry.rating ? (
                                <span
                                  className={
                                    entry.rating.label === 'favorable'
                                      ? styles.muFav
                                      : entry.rating.label === 'tough'
                                        ? styles.muTough
                                        : styles.muNeutral
                                  }
                                  title={matchupLabel(
                                    entry.rating,
                                    selectedPlayer.player.position,
                                  )}
                                  aria-label={matchupLabel(
                                    entry.rating,
                                    selectedPlayer.player.position,
                                  )}
                                >
                                  {matchupShort(entry.rating)}
                                </span>
                              ) : (
                                <span
                                  className={styles.matchupDash}
                                  aria-label="No matchup rating — bye week"
                                >
                                  -
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className={styles.matchupFootnote}>
                      A difficulty map, not a forecast: every future week
                      prices the same season-to-date opponent points allowed
                      to the position (completed weeks{' '}
                      {matchupDataWeeks()[0]}–{matchupDataWeeks()[1]}).
                    </p>
                  </div>
                )}

                {stints.length > 0 && (
                  <div className={styles.timeline}>
                    <h3 className={styles.timelineTitle}>Production By Stint</h3>
                    <div className={styles.stints}>
                      {stints.map((stint, i) => (
                        <div key={i} className={styles.stintRow}>
                          <span className={styles.stintTeam}>{stint.teamName}</span>
                          <span className={styles.stintWeeks}>
                            W{stint.fromWeek}
                            {stint.toWeek !== stint.fromWeek ? `–W${stint.toWeek}` : ''}
                          </span>
                          <span className={styles.stintPpg}>
                            {stint.ppg.toFixed(1)} ppg
                          </span>
                          <span className={styles.stintTotal}>
                            {stint.points.toFixed(1)} pts in {stint.games} wk
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Journey Timeline */}
                <div className={styles.timeline}>
                  <h3 className={styles.timelineTitle}>Journey Timeline</h3>
                  {selectedPlayer.events.length > 0 ? (
                    <div className={styles.events}>
                      {selectedPlayer.events.map((event, index) => (
                        <div
                          key={index}
                          className={`${styles.event} ${getEventClass(event.type)}`}
                        >
                          <span className={styles.eventIcon}>{getEventIcon(event.type)}</span>
                          <div className={styles.eventContent}>
                            <span className={styles.eventLabel}>
                              {getEventLabel(event.type)} <strong>{event.teamName}</strong>
                            </span>
                            {event.details && (
                              <span className={styles.eventDetails}>{event.details}</span>
                            )}
                            {event.week !== undefined && event.week > 0 && (
                              <span className={styles.eventTime}>Week {event.week}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.noEvents}>
                      No transaction history for this player.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className={styles.noSelection}>
                <p>Select a player to view their journey</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
