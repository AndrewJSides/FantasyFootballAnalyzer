import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { League, Player } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { DataAsOf } from '@/components/DataAsOf';
import { NflTeamLabel, PosBadge } from '@/components';
import { POOL } from '@/data/draftPool';
import { fetchWeeklyPprPoints, type WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import { DEFAULT_ROSTER_SLOTS } from '@/utils/draftDefaults';
import { indexPool, resolvePoolPlayer } from '@/utils/consensusGrade';
import { gameKickoff } from '@/utils/gameTimes';
import { lateSwapAlerts } from '@/utils/lateSwap';
import { WeatherWatch } from '@/components/WeatherWatch';
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
import { consistencySummary } from '@/utils/consistency';
import { planLineupWeeks, type PlannedWeek } from '@/utils/lineupPlanner';
import {
  holeStreamerPicks,
  EMPTY_STREAMER_EXCLUSIONS,
  type HoleStreamerPick,
  type StreamerExclusions,
} from '@/utils/byeWeekStreamers';
import {
  rosteredDefenseTeams,
  rosteredKickerTeams,
  rosteredSkillPlayerIds,
} from '@/utils/streamerPlanner';
import {
  currentWeekEstimate,
  matchupDataWeeks,
  matchupLabel,
  matchupShort,
} from '@/utils/matchupRating';
import { upcomingMatchupChips } from '@/utils/upcomingMatchups';
import { safeRiskyPicks } from '@/utils/safeRisky';
import { buildGameDayChecklist } from '@/utils/gameDayChecklist';
import { GameDayChecklist } from '@/components/GameDayChecklist';
import { teamRosterAlerts } from '@/utils/rosterAlerts';
import styles from './StartSitPage.module.css';

interface StartSitPageProps {
  league: League;
}

// Start/Sit optimizer (backlog item 1): the optimal starting lineup ranked by
// projected points for the coming week — recency-weighted last-4 form
// blended with the season baseline, so one big week can't over-swing
// it. (The numeric matchup blend was turned off Nov 1, 2026: the backtest
// measured it worse than no term at every pricing.) Players on bye in the
// current week are benched regardless of projection: they score zero that
// week. The Matchup column shows the week's opponent and how the defense
// grades vs the player's position (from completed weeks) — display only,
// not part of the projection.
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

  // Projected range (backlog item 62): each starter's P25–P75 weekly band
  // from their own played weeks (the consistency engine's percentiles), so
  // a steady projection and a volatile one read differently at a glance.
  // Dash when fewer than 3 played weeks — the percentiles are noise before
  // that, same bar as the consistency util itself.
  const rangeInfo = (
    s: ScoredPlayer,
  ): { label: string; title: string | undefined } => {
    const weekly =
      weeklyPoints?.[s.player.platformId] ?? weeklyPoints?.[s.player.id];
    const c = consistencySummary(weekly, s.position);
    if (!c) return { label: '—', title: undefined };
    return {
      label: `${round1(c.floor)}–${round1(c.ceiling)}`,
      title: `Typical range: P25–P75 of ${c.games} played weeks`,
    };
  };

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

  // Bye-week and injured-out players score zero this week, so they never
  // start no matter their average — they stay in the bench list with the
  // reason attached. Questionable/Doubtful stay eligible as game-time
  // decisions; Late-swap watch covers those.
  const lineup = useMemo(
    () => optimalLineup(modeScored.filter(s => !s.onBye && !s.injuredOut), slots),
    [modeScored, slots],
  );
  const benched: ScoredPlayer[] = useMemo(() => {
    const bench = lineup.bench as ScoredPlayer[];
    const unavailable = modeScored.filter(s => s.onBye || s.injuredOut);
    return [...bench, ...unavailable].sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0));
  }, [lineup, modeScored]);
  const byePlayers = modeScored.filter(s => s.onBye);

  // Safe & Risky Starts of the Week (backlog item 68): rank this week's
  // optimal starters by bankability — steady history + kind matchup is
  // safe, volatile history + tough matchup is risky. Same players as the
  // table below, so a mode switch re-ranks this panel in place too.
  const safeRisky = useMemo(
    () =>
      safeRiskyPicks(
        lineup.starters
          .map(a => a.player)
          .filter((p): p is ScoredPlayer => p !== null),
        weeklyPoints,
      ),
    [lineup, weeklyPoints],
  );
  const starterById = new Map(
    lineup.starters
      .filter(s => s.player)
      .map(s => [s.player!.id, s.slot] as const),
  );

  const benchReason = (s: ScoredPlayer): string => {
    if (s.injuredOut)
      return `${s.injuryLabel ?? 'Out'} — sits regardless of projection.`;
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


  // --- Plan ahead: multi-week lineup planner (backlog item 29) ---------------
  // Optimal lineups for every remaining regular-season week (this week
  // through the week before the fantasy playoffs), priced on the same
  // projection engine as the single-week optimizer. Each week is
  // priced by re-running the scoring core with currentWeek set to that week,
  // so the matchup display and bye benching key off the target week while the
  // form series stays today's form. Injury-out benching follows the Roster
  // Alerts rule (Out this week only, season-ending every remaining week).
  // Balanced projection only — lineup modes apply to this week's call, not
  // the plan.
  const planEndWeek = useMemo(() => {
    const end = league.playoffStartWeek ? league.playoffStartWeek - 1 : 14;
    return Math.min(Math.max(end, currentWeek ?? 0), 18);
  }, [league.playoffStartWeek, currentWeek]);
  const lineupPlan = useMemo<PlannedWeek[]>(
    () =>
      currentWeek === undefined
        ? []
        : planLineupWeeks({
            roster,
            weeklyPoints,
            gamesBySleeperId: isGuest
              ? guestWeekly?.gamesBySleeperId
              : league.gamesPlayed?.bySleeperId,
            gamesSeason: isGuest ? guestWeekly?.season : league.gamesPlayed?.season,
            season: league.season,
            fromWeek: currentWeek,
            toWeek: planEndWeek,
            slots,
          }),
    [
      roster,
      weeklyPoints,
      isGuest,
      guestWeekly,
      league.gamesPlayed,
      league.season,
      currentWeek,
      planEndWeek,
      slots,
    ],
  );
  const planWatch = (w: PlannedWeek): string => {
    const parts: string[] = [];
    if (w.onBye.length > 0) parts.push(`Bye: ${w.onBye.join(', ')}`);
    const outInjured = w.holes.filter(h => h.cause === 'injury');
    if (outInjured.length > 0)
      parts.push(
        `Out: ${outInjured.map(h => (h.injuryLabel ? `${h.name} (${h.injuryLabel})` : h.name)).join(', ')}`,
      );
    const tough = w.starters.filter(s => s.matchupLabel === 'tough');
    if (tough.length > 0)
      parts.push(`Tough: ${tough.map(s => `${s.name} (vs ${s.opponent})`).join(', ')}`);
    return parts.length > 0 ? parts.join(' · ') : '—';
  };
  // --- Lineup-hole streamer picks (backlog items 61 + 67 remainder) -------
  // For each planned week, name the best available streamer at each
  // streamable position (D/ST, K, QB, TE) where a rostered starter is on
  // bye or ruled out by injury — the same opponent-generosity engines as
  // the Waivers page's streamer sections, priced per week like the
  // Streamer Planner.
  // Availability is league-wide (same as the Waivers page); guest mode
  // has no rostered exclusion.
  const streamerExclusions = useMemo<StreamerExclusions>(
    () =>
      isGuest
        ? EMPTY_STREAMER_EXCLUSIONS
        : {
            rosteredDefenses: rosteredDefenseTeams(league),
            rosteredKickerTeams: rosteredKickerTeams(league),
            rosteredSkillIds: rosteredSkillPlayerIds(league),
          },
    [isGuest, league],
  );
  const planStreamerPicks = useMemo(
    () =>
      new Map<number, HoleStreamerPick[]>(
        lineupPlan.map(
          (w): [number, HoleStreamerPick[]] => [
            w.week,
            holeStreamerPicks(w.week, w.holes, streamerExclusions),
          ],
        ),
      ),
    [lineupPlan, streamerExclusions],
  );
  const streamerPickCell = (w: PlannedWeek): string => {
    const picks = planStreamerPicks.get(w.week) ?? [];
    if (picks.length === 0) return '—';
    return picks
      .map(p => `${p.position}: ${p.pickName} (vs ${p.opponent} · ${p.label})`)
      .join(' · ');
  };
  const streamerPickAria = (w: PlannedWeek): string | undefined => {
    const picks = planStreamerPicks.get(w.week) ?? [];
    if (picks.length === 0) return undefined;
    return (
      `Week ${w.week} streamer picks: ` +
      picks
        .map(p => {
          const absence =
            p.cause === 'injury'
              ? `is out${p.injuryLabel ? ` (${p.injuryLabel})` : ''}`
              : 'is on bye';
          return (
            `stream ${p.pickName} at ${p.position} while ${p.holeName} ${absence} — ` +
            `versus ${p.opponent}, ${p.label} matchup`
          );
        })
        .join('; ')
    );
  };

  // --- Upcoming matchups (backlog item 66): each starter's next 3 played
  // weeks as matchup chips, priced on the same season-to-date averages as
  // the Matchup column — a difficulty map, not a forecast. Answers "can I
  // sit him for one bad week and come back after" in the decision row.
  const upcomingChips = (s: ScoredPlayer): ReactNode => {
    if (currentWeek === undefined) return '—';
    const chips = upcomingMatchupChips(s.nflTeam, s.position, currentWeek);
    if (chips.length === 0) return '—';
    return (
      <span className={styles.upcoming}>
        {chips.map(c =>
          c.rating ? (
            <span
              key={c.week}
              className={
                c.rating.label === 'favorable'
                  ? styles.muFav
                  : c.rating.label === 'tough'
                    ? styles.muTough
                    : styles.muNeutral
              }
              title={matchupLabel(c.rating, s.position)}
              aria-label={`Week ${c.week}: ${matchupLabel(c.rating, s.position)}`}
            >
              W{c.week} {c.opponent}
            </span>
          ) : null,
        )}
      </span>
    );
  };

  // --- Late-swap watch: kickoff times + game-time-decision alerts ---------
  // A starter locks at HIS kickoff, so a Questionable starter can only be
  // rescued by a same-slot-eligible bench player who plays later. Injury
  // designations resolve from the bundled pool (refreshed twice daily),
  // same as the Rankings injury tags.
  const poolIndex = useMemo(() => indexPool(POOL), []);
  const kickoffChip = (s: ScoredPlayer): ReactNode => {
    const k = gameKickoff(s.nflTeam, currentWeek);
    return k ? (
      <span title={`${s.nflTeam} kicks off ${k.label}`}>{k.slot}</span>
    ) : (
      '—'
    );
  };
  const swapAlerts = useMemo(() => {
    if (guestDataPending || currentWeek === undefined) return [];
    const toWatch = (s: ScoredPlayer, slot?: string) => ({
      name: s.name,
      position: s.position,
      nflTeam: s.nflTeam,
      slot,
      injuryStatus: resolvePoolPlayer(s.player, poolIndex)?.injuryStatus ?? null,
    });
    return lateSwapAlerts({
      starters: lineup.starters
        .filter(a => a.player)
        .map(a => toWatch(a.player as ScoredPlayer, a.slot)),
      bench: benched.map(s => toWatch(s)),
      week: currentWeek,
    });
  }, [lineup, benched, currentWeek, guestDataPending, poolIndex]);

  // --- Game-day checklist (backlog item 70) ---------------------------------
  // The Sunday-morning "what do I need to do before kickoff" list, built
  // from this page's own computed data: the late-swap alerts (game-time
  // decisions + insurance), the Out starters the optimizer benched, the
  // kickoff lock order, and the current week's no-cover holes with their
  // waiver fillers from the roster-alert scan (league mode only — the
  // scan needs the league's rosters for the filler filter).
  const checklist = useMemo(() => {
    if (guestDataPending || currentWeek === undefined) return [];
    return buildGameDayChecklist({
      week: currentWeek,
      starters: lineup.starters
        .filter(a => a.player)
        .map(a => {
          const p = a.player as ScoredPlayer;
          return { name: p.name, slot: a.slot, position: p.position, nflTeam: p.nflTeam };
        }),
      injuredOutBenched: benched
        .filter(s => s.injuredOut)
        .map(s => ({ name: s.name, label: s.injuryLabel ?? 'Out' })),
      swapAlerts,
      holes:
        !isGuest && team
          ? teamRosterAlerts(league, team)
              .filter(a => a.week === currentWeek && a.severity === 'hole')
              .map(a => ({
                slots: a.slots,
                cause: a.cause,
                fillers: a.fillers.map(f => f.name),
              }))
          : [],
    });
  }, [guestDataPending, currentWeek, lineup, benched, swapAlerts, isGuest, team, league]);
  const checklistKey =
    currentWeek === undefined ? '' : `gameday-checklist:${league.season}:w${currentWeek}`;

  // --- Weather watch: kickoff-hour weather flags (backlog item 51) --------
  // The optimizer's starters, so flagged games can name who's affected.
  const weatherStarters = useMemo(
    () =>
      lineup.starters
        .filter(a => a.player)
        .map(a => {
          const p = a.player as ScoredPlayer;
          return { name: p.name, nflTeam: p.nflTeam };
        }),
    [lineup],
  );

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
            completed weeks {matchupDataWeeks()[0]}–{matchupDataWeeks()[1]}; the
            Upcoming column shows each starter&apos;s next 3 played weeks as
            matchup chips on the same basis — a difficulty map, not a forecast.
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
            {checklist.length > 0 && (
              <GameDayChecklist items={checklist} storageKey={checklistKey} />
            )}
            {byePlayers.length > 0 && (
              <p className={styles.byeWarning} role="status">
                On bye{currentWeek !== undefined ? ` in week ${currentWeek}` : ''} — benched
                automatically: {byePlayers.map(s => s.name).join(', ')}.
              </p>
            )}
            {(safeRisky.safe.length > 0 || safeRisky.risky.length > 0) && (
              <section aria-labelledby="safe-risky-heading" aria-live="polite">
                <h2 id="safe-risky-heading" className={styles.sectionTitle}>
                  Safe & risky starts
                </h2>
                <div className={styles.safeRiskyGrid}>
                  {safeRisky.safe.length > 0 && (
                    <div>
                      <h3 className={styles.safeRiskyLabel}>Safest starts</h3>
                      <ul className={styles.watchList} aria-label="Safest starts this week">
                        {safeRisky.safe.map(pick => (
                          <li
                            key={pick.player.player.id}
                            className={`${styles.watchItem} ${styles.safeRiskySafe}`}
                          >
                            <strong>{pick.player.name}</strong>{' '}
                            <PosBadge pos={pick.player.position} />{' '}
                            <NflTeamLabel team={pick.player.nflTeam} /> — proj.{' '}
                            {pick.player.projection?.projection ?? '—'}
                            <div className={styles.safeRiskyReason}>{pick.reason}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {safeRisky.risky.length > 0 && (
                    <div>
                      <h3 className={styles.safeRiskyLabel}>Riskiest starts</h3>
                      <ul className={styles.watchList} aria-label="Riskiest starts this week">
                        {safeRisky.risky.map(pick => (
                          <li
                            key={pick.player.player.id}
                            className={`${styles.watchItem} ${styles.risk}`}
                          >
                            <strong>{pick.player.name}</strong>{' '}
                            <PosBadge pos={pick.player.position} />{' '}
                            <NflTeamLabel team={pick.player.nflTeam} /> — proj.{' '}
                            {pick.player.projection?.projection ?? '—'}
                            <div className={styles.safeRiskyReason}>{pick.reason}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
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
                  <th scope="col">Range</th>
                  <th scope="col">Pts/game</th>
                  <th scope="col">Last 3</th>
                  <th scope="col">Matchup</th>
                  <th scope="col">Upcoming</th>
                  <th scope="col">Kickoff</th>
                  <th scope="col">Why they start</th>
                </tr>
              </thead>
              <tbody>
                {lineup.starters.map((a, i) => {
                  const s = a.player as ScoredPlayer | null;
                  const range = s ? rangeInfo(s) : null;
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
                      <td>
                        {range ? (
                          <span title={range.title ?? undefined}>{range.label}</span>
                        ) : (
                          '—'
                        )}
                      </td>
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
                      <td>{s ? upcomingChips(s) : '—'}</td>
                      <td>{s ? kickoffChip(s) : '—'}</td>
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
                      <th scope="col">Kickoff</th>
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
                        <td>{kickoffChip(s)}</td>
                        <td>{benchReason(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {swapAlerts.length > 0 && (
              <>
                <h2 className={styles.sectionTitle}>Late-swap watch</h2>
                <ul className={styles.watchList} aria-label="Late-swap watch">
                  {swapAlerts.map((a, i) => (
                    <li
                      key={i}
                      className={`${styles.watchItem} ${a.kind === 'risk' ? styles.risk : styles.insurance}`}
                    >
                      <strong>{a.headline}.</strong> {a.detail}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <WeatherWatch week={currentWeek} starters={weatherStarters} />
            <p className={styles.note}>
              Projected from each player&apos;s last-4-week form blended with
              their season average, so one big
              week can&apos;t over-swing it. Range is each starter&apos;s
              P25–P75 scoring band from their own played weeks (3+ needed) —
              a steady 14 and a volatile 14 are very different start calls.
              Safe &amp; risky ranks the optimal starters on the same data:
              steady history plus a kind matchup is safe, volatile history
              plus a tough matchup is risky.
              {mode !== 'balanced'
                ? ` ${mode === 'ceiling' ? 'Chase ceiling' : 'Protect floor'} re-ranks the lineup on ${mode === 'ceiling' ? 'P75 upside' : 'P25 floor'} — each player\u2019s projection ${mode === 'ceiling' ? 'plus' : 'minus'} 0.6745 \u00d7 their own week-to-week volatility.`
                : ''}
              {isGuest
                ? ' Weekly stats from Sleeper\u2019s public data (full PPR).'
                : ''}{' '}
              {!isGuest && myPreview
                ? ' The mode auto-suggests from your weekly win probability (chase ceiling below 40%, protect floor above 60%); picking a mode manually overrides it.'
                : ''}{' '}
              This does not yet see news, so check that before lock. Injury
              designations feed the Late-swap watch from the bundled pool
              (refreshed twice daily) — not live inactives. The Game-day
              checklist consolidates the page&apos;s actionable pieces —
              game-time decisions, kickoff lock order, benched Out starters,
              and no-cover holes with waiver fillers — into one check-off
              list; checked items persist for the week.
            </p>

            {lineupPlan.length > 1 && (
              <>
                <h2 className={styles.sectionTitle}>
                  Plan ahead · weeks {currentWeek}–{planEndWeek}
                </h2>
                <table
                  className={styles.table}
                  aria-label={`Optimal lineups for weeks ${currentWeek} through ${planEndWeek}`}
                >
                  <thead>
                    <tr>
                      <th scope="col">Week</th>
                      <th scope="col">Proj. pts</th>
                      <th scope="col">Optimal starters</th>
                      <th scope="col">Watch</th>
                      <th scope="col">Streamer pick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineupPlan.map(w => (
                      <tr key={w.week}>
                        <th scope="row">
                          {w.week}
                          {w.week === currentWeek ? ' (this week)' : ''}
                        </th>
                        <td>{w.projectedTotal}</td>
                        <td>
                          {w.starters.map(s => `${s.position} ${s.name}`).join(' · ')}
                        </td>
                        <td>{planWatch(w)}</td>
                        <td aria-label={streamerPickAria(w)}>{streamerPickCell(w)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className={styles.note}>
                  Each week is priced on today&apos;s form plus that week&apos;s
                  matchup — the model does not decay form over time, so treat
                  far weeks as directional. Bye-week players sit automatically,
                  as do players ruled Out (this week only — a designation may
                  lift) or on season-ending IR (every remaining week).
                  Streamer picks name the week&apos;s best available D/ST, K,
                  QB, or TE when a rostered starter is on bye or ruled out at
                  that position, priced on opponent generosity like the Waivers
                  page&apos;s streamer sections. Priced on the balanced
                  projection; lineup modes apply to this week&apos;s call only.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
