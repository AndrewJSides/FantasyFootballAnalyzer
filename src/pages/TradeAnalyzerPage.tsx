import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { League, Player, Team } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { POOL_SEASON } from '@/data/draftPoolMeta';
import { fetchSleeperWeekProjections } from '@/api/sleeperWeeklyProjections';
import { PosBadge } from '@/components/PosBadge';
import { DataAsOf } from '@/components/DataAsOf';
import { SITE_TITLE } from '../utils/siteTitle';
import {
  analyzeTrade,
  resolveTradeSide,
  valueLeagueFor,
  type FullTradeAnalysis,
  type ValuedPick,
} from '@/utils/tradeAnalysis';
import { pickLabel, type TradePick } from '@/utils/pickValueCurve';
import {
  fixBlurb,
  suggestFairnessFixes,
  type FairnessFix,
} from '@/utils/tradeFairness';
import {
  currentWeekEstimate,
  getMatchupRating,
  matchupDataWeeks,
  matchupLabel,
  matchupShort,
} from '@/utils/matchupRating';
import styles from './TradeAnalyzerPage.module.css';

interface TradeAnalyzerPageProps {
  league: League | null;
}

type Entry = Player | PoolPlayer;

// Draft picks in the Trade Analyzer (backlog item 175): a future pick's
// exact slot is unknown until the season ends, so the adder only asks for
// season + round and the engine prices the mid-round slot. Seasons run
// three drafts out; rounds stop at 10 — a later pick's expected VOR is
// already ~0, so offering it would be noise, not a choice.
const PICK_SEASONS = [POOL_SEASON + 1, POOL_SEASON + 2, POOL_SEASON + 3];
const PICK_ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function samePick(a: TradePick, b: TradePick): boolean {
  return a.season === b.season && a.round === b.round;
}

// ---------------------------------------------------------------------------
// Player search (manual mode): match against the bundled pool by name.
// ---------------------------------------------------------------------------

function searchPool(query: string, limit = 8): PoolPlayer[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  // Rank exact prefix hits before looser infix hits so typing "ja" offers
  // Ja'Marr Chase before mid-name matches. The pool is consensus-ranked, so
  // pool order still breaks ties within each bucket.
  const prefix: PoolPlayer[] = [];
  const infix: PoolPlayer[] = [];
  for (const p of POOL.players) {
    const name = p.name.toLowerCase();
    if (name.startsWith(q)) {
      if (prefix.length < limit) prefix.push(p);
    } else if (name.includes(q)) {
      if (infix.length < limit) infix.push(p);
    }
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...infix].slice(0, limit);
}

function entryLabel(e: Entry): string {
  return e.name;
}

function entryPos(e: Entry): string {
  return 'position' in e ? (e as Player).position : (e as PoolPlayer).pos;
}

// Both entry shapes carry the NFL team abbreviation, so the picked list can
// show the same identity line the roster/search buttons do (name · team).
function entryTeam(e: Entry): string {
  return e.team ?? '';
}

// Weekly matchup difficulty chip for a player row (backlog item 2): the
// opponent's points allowed vs the player's position from completed weeks,
// via the same matchupRating module the Start/Sit page uses. Renders
// nothing when the rating is unavailable (bye week, K/DST, unknown week),
// so manual-mode rows degrade gracefully instead of showing a dead chip.
function MatchupChip({ team, pos, week }: { team: string; pos: string; week: number }) {
  const rating = getMatchupRating(team, pos, week);
  if (!rating) return null;
  const cls =
    rating.label === 'favorable'
      ? styles.muFav
      : rating.label === 'tough'
        ? styles.muTough
        : styles.muNeutral;
  return (
    <span className={cls} title={matchupLabel(rating, pos)}>
      {matchupShort(rating)}
    </span>
  );
}

// Two entries are the same player when their ids match, or when their names
// match — league roster ids and consensus-pool ids come from different
// schemes, so the id check alone can't catch cross-source duplicates.
function sameEntry(a: Entry, b: Entry): boolean {
  if (a.id === b.id) return true;
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Shareable trade links: sides are encoded as player names in the URL hash,
// e.g. /trade-analyzer#trade=%7B%22a%22%3A%5B%22Saquon+Barkley%22%5D...%7D
// Names resolve against the bundled consensus pool, so links work in manual
// mode with no league connected. Unknown names are skipped on load.
// When a league is loaded the sender's team picks ride along as optional
// ta/tb team ids, so the link reopens the same pairing the sender analyzed.
// Old links without ta/tb still decode — the Side A preselect covers them.
// ---------------------------------------------------------------------------

const TRADE_HASH_PREFIX = '#trade=';

// A pick in the hash is a compact {s: season, r: round} pair, e.g.
// "pa":[{"s":2027,"r":1}] — player names stay the readable part of the
// payload, picks stay small. Old links without pa/pb still decode.
interface TradeHashPick {
  s: number;
  r: number;
}

// The raw hash payload (what encode writes). The decoded form below swaps
// the pick pairs for resolved TradePicks, so the page never has to convert
// {s, r} back to {season, round} at every use site.
interface TradeHashPayload {
  a: string[];
  b: string[];
  ta?: string;
  tb?: string;
  pa?: TradeHashPick[];
  pb?: TradeHashPick[];
}

interface TradeHashSides {
  a: string[];
  b: string[];
  ta?: string;
  tb?: string;
  pa: TradePick[];
  pb: TradePick[];
}

function encodeTradeHash(
  sideA: Entry[],
  sideB: Entry[],
  teamAId = '',
  teamBId = '',
  picksA: TradePick[] = [],
  picksB: TradePick[] = [],
): string {
  const payload: TradeHashPayload = {
    a: sideA.map(entryLabel),
    b: sideB.map(entryLabel),
    // Team ids only exist with a loaded league; leaving them out in manual
    // mode keeps the hash short and identical to the pre-team-pick format.
    ...(teamAId ? { ta: teamAId } : {}),
    ...(teamBId ? { tb: teamBId } : {}),
    // Picks only exist when the user added one; leaving them out keeps the
    // hash identical to the pre-pick format.
    ...(picksA.length > 0 ? { pa: picksA.map(p => ({ s: p.season, r: p.round })) } : {}),
    ...(picksB.length > 0 ? { pb: picksB.map(p => ({ s: p.season, r: p.round })) } : {}),
  };
  return `${TRADE_HASH_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

function decodeTradeHash(hash: string): TradeHashSides | null {
  if (!hash.startsWith(TRADE_HASH_PREFIX)) return null;
  try {
    const parsed: unknown = JSON.parse(
      decodeURIComponent(hash.slice(TRADE_HASH_PREFIX.length)),
    );
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as TradeHashPayload).a) &&
      Array.isArray((parsed as TradeHashPayload).b)
    ) {
      const names = (arr: unknown[]): string[] =>
        arr.filter((n): n is string => typeof n === 'string');
      const id = (v: unknown): string | undefined =>
        typeof v === 'string' && v ? v : undefined;
      // A hand-made link with a garbage pick (bad season/round, wrong
      // shape) drops that pick, not the whole link — same discipline as
      // unresolvable player names below.
      const picks = (arr: unknown): TradePick[] => {
        if (!Array.isArray(arr)) return [];
        const out: TradePick[] = [];
        for (const p of arr) {
          if (
            p &&
            typeof p === 'object' &&
            Number.isInteger((p as TradeHashPick).s) &&
            Number.isInteger((p as TradeHashPick).r) &&
            (p as TradeHashPick).s >= POOL_SEASON + 1 &&
            (p as TradeHashPick).s <= POOL_SEASON + 5 &&
            (p as TradeHashPick).r >= 1 &&
            (p as TradeHashPick).r <= 16
          ) {
            out.push({ season: (p as TradeHashPick).s, round: (p as TradeHashPick).r });
          }
        }
        return out;
      };
      return {
        a: names((parsed as TradeHashPayload).a),
        b: names((parsed as TradeHashPayload).b),
        ta: id((parsed as TradeHashPayload).ta),
        tb: id((parsed as TradeHashPayload).tb),
        pa: picks((parsed as TradeHashPayload).pa),
        pb: picks((parsed as TradeHashPayload).pb),
      };
    }
  } catch {
    // Malformed hash — ignore and leave the builder empty.
  }
  return null;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Warning shown when a shared #trade= link names players the consensus pool
// can't resolve. Held in state (not folded into the warnings array) so an
// analysis re-run — manual or the shared-link auto-run — doesn't wipe it. It
// clears only when the user edits the builder, at which point the trade is
// no longer the shared one.
function skippedSharedWarning(count: number): string {
  return `${count} player${count === 1 ? '' : 's'} in this shared link ` +
    `couldn't be matched and ${count === 1 ? 'was' : 'were'} left out.`;
}

// Keep the address bar's #trade= hash in sync with the analyzed trade, so a
// plain copy of the URL from the bar shares the same thing the copy button
// does. replaceState keeps the back button clean; the mount-once hash loader
// above never re-fires on these replacements. The search string is preserved
// so a shared-league param (?league= / ?pin=) survives the analysis —
// dropping it would unload the league on the next refresh.
function syncTradeHashToUrl(
  sideA: Entry[],
  sideB: Entry[],
  teamAId = '',
  teamBId = '',
  picksA: TradePick[] = [],
  picksB: TradePick[] = [],
): void {
  if (sideA.length === 0 && sideB.length === 0 && picksA.length === 0 && picksB.length === 0) {
    // Analyzing an empty builder (only reachable from a hand-made empty
    // #trade= link) shouldn't leave a noise hash in the address bar.
    clearTradeHashFromUrl();
    return;
  }
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${encodeTradeHash(sideA, sideB, teamAId, teamBId, picksA, picksB)}`,
  );
}

// A cleared builder must not leave a hash behind that would reload the trade
// on the next refresh. The search string stays so the league context isn't
// lost with the trade.
function clearTradeHashFromUrl(): void {
  if (window.location.hash.startsWith(TRADE_HASH_PREFIX)) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
}

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// Shared-link names resolve against the pool with several fallbacks, since
// roster names, abbreviations, and punctuation vary ("X. Worthy",
// "A.J. Brown" vs "AJ Brown"). Exact matches come first; fuzzier passes only
// run when nothing exact hit, and the pool is consensus-ranked so the first
// fuzzy hit is the best guess.
function matchPoolByName(name: string): PoolPlayer | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const exact = POOL.players.find(p => p.name.toLowerCase() === q);
  if (exact) return exact;
  const nq = normName(q);
  const normExact = POOL.players.find(p => normName(p.name) === nq);
  if (normExact) return normExact;
  const partial = POOL.players.find(p => normName(p.name).includes(nq));
  if (partial) return partial;
  const qTokens = tokens(q);
  if (qTokens.length === 0) return null;
  return (
    POOL.players.find(p => {
      const pTokens = tokens(p.name);
      if (pTokens.length !== qTokens.length) return false;
      return qTokens.every((qt, i) => pTokens[i].startsWith(qt));
    }) ?? null
  );
}

// ---------------------------------------------------------------------------
// Side builder column
// ---------------------------------------------------------------------------

function SideBuilder(props: {
  title: string;
  entries: Entry[];
  // The other side's picks: a player already on the other side can't be added
  // here — trading him against himself grades nothing real. The roster and
  // search rows show the other-side state the same way they show "added".
  otherEntries: Entry[];
  otherSideName: string;
  onRemove: (idx: number) => void;
  teams: Team[];
  teamId: string;
  onTeamChange: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onAddSearch: (p: PoolPlayer) => void;
  leagueLoaded: boolean;
  // The week the matchup chips price against: the league's current week,
  // or the estimate when no league is loaded (manual mode / shared links).
  week: number;
  // Future draft picks on this side (backlog item 175): season + round,
  // priced by the engine at the mid-round slot.
  picks: TradePick[];
  onAddPick: (p: TradePick) => void;
  onRemovePick: (idx: number) => void;
}) {
  const {
    title, entries, otherEntries, otherSideName, onRemove, teams, teamId,
    onTeamChange, searchQuery, onSearchChange, onAddSearch, leagueLoaded, week,
    picks, onAddPick, onRemovePick,
  } = props;
  const [pickSeason, setPickSeason] = useState(PICK_SEASONS[0]);
  const [pickRound, setPickRound] = useState(1);
  const team = teams.find(t => t.id === teamId);
  const results = useMemo(() => searchPool(searchQuery), [searchQuery]);

  // Add-button tooltip mirrors its aria-label: the added/on-other-side state
  // only renders as visible text when the button is enabled, so keep the why
  // attached to the button itself (matches the picked-player Remove button's
  // title-mirrors-aria-label discipline).
  const addLabel = (name: string, added: boolean, onOther: boolean) =>
    added ? `${name} (already added)` : onOther ? `${name} (on ${otherSideName})` : `Add ${name}`;

  const addRosterPlayer = (p: Player) => {
    if (!entries.some(e => sameEntry(e, p))) {
      onAddSearch(p as unknown as PoolPlayer);
    }
  };

  return (
    <section className={styles.side} aria-label={title}>
      <h2 className={styles.sideTitle}>{title}</h2>

      {leagueLoaded && (
        <label className={styles.field}>
          <span className={styles.label}>Team</span>
          <select
            className={styles.select}
            value={teamId}
            onChange={e => onTeamChange(e.target.value)}
            // The visible label just says "Team" on both sides, so a screen
            // reader hears the same name twice with no clue which side each
            // select belongs to; name it after the side, matching the
            // draft-room 'Me' radios' discipline. The title keeps the same
            // string for tooltips.
            aria-label={`${title}: pick the team giving this side`}
            title={`${title}: pick the team giving this side`}
          >
            <option value="">— pick a team —</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.isMyTeam ? ' (you)' : ''}</option>
            ))}
          </select>
        </label>
      )}

      {/* Picking a team swaps the roster list below in place with no
          navigation, so screen readers heard nothing change beyond the
          select's own value; the visually-hidden aria-live region
          announces the picked team and its roster size. Always mounted:
          the region must exist before the first pick so the preselect
          (and every later pick) announces. Visible text unchanged. */}
      <div aria-live="polite" className="visually-hidden">
        {team ? `${title}: ${team.name}, ${(team.roster ?? []).length} players to add.` : ''}
      </div>

      {team && (
        <div className={styles.rosterList}>
          <span className={styles.label}>Tap a player to add</span>
          {/* The list had no name of its own beyond the "Tap a player to
              add" label, so screen readers heard an anonymous list; the
              name mirrors the label plus the side's roster-takes
              discipline ('<team> (Side A) players to add'). */}
          <ul aria-label={`${team.name} (${title}) players to add`}>
            {(team.roster ?? []).map(p => {
              // Re-tapping an already-added player silently did nothing; now
              // the button shows its added state and won't accept the tap.
              // Same for a player sitting on the other side: he can't be
              // traded against himself, so the row names where he is.
              const added = entries.some(e => sameEntry(e, p));
              const onOtherSide = !added && otherEntries.some(e => sameEntry(e, p));
              const unavailable = added || onOtherSide;
              const addTip = addLabel(p.name, added, onOtherSide);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={styles.rosterBtn}
                    disabled={unavailable}
                    onClick={() => addRosterPlayer(p)}
                    aria-label={addTip}
                    title={addTip}
                  >
                    <PosBadge pos={p.position} />
                    <span className={styles.pName}>{p.name}</span>
                    {added
                      ? <span className={styles.pTeam}>✓ added</span>
                      : onOtherSide
                        ? <span className={styles.pTeam}>on {otherSideName}</span>
                        : <span className={styles.pTeam}>{p.team}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <label className={styles.field}>
        <span className={styles.label}>Or search any player</span>
        <input
          className={styles.input}
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Type a name…"
          // The visible label just says "Or search any player" on both
          // sides, so a screen reader hears the same name twice with no
          // clue which side each search belongs to; name it after the
          // side, matching the team select above.
          aria-label={`${title}: search any player`}
          title={`${title}: search any player`}
          // Player names are proper nouns — stop phone keyboards from
          // "correcting" them (e.g. Hurts -> Hurts' fine, but more often the
          // spacebar replaces the name mid-typing and breaks the search).
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          // Phones: the Enter key already adds the top search hit, so label
          // the keyboard's action key "search" to match what it does.
          enterKeyHint="search"
          // Escape clears the search without touching the picked players. Enter
          // adds the top result — the fast keyboard path when the search has
          // an obvious hit ("puka" -> Puka Nacua) without tapping it. Tapping
          // a result button still clears the search too.
          onKeyDown={e => {
            if (e.key === 'Escape') { onSearchChange(''); return; }
            if (e.key === 'Enter') {
              const top = results[0];
              if (top) {
                if (!entries.some(en => sameEntry(en, top))) onAddSearch(top);
                // Clear either way: the search did its job whether the top
                // hit was just added or was already on this side.
                onSearchChange('');
              }
            }
          }}
        />
      </label>
      {results.length > 0 && (
        // The roster list above is introduced by its visible "Tap a player
        // to add" label, but this list appears with no heading — name it
        // after the side, matching the team select's side-specific naming,
        // so a screen reader hears which side's results these are.
        <ul className={styles.searchResults} aria-label={`${title} search results`}>
          {results.map(p => {
            // Like the roster buttons above, show the added state instead of
            // silently no-op'ing when the search hit is already on this side.
            // Same for hits already on the other side — they can't be traded
            // against themselves.
            const added = entries.some(e => sameEntry(e, p));
            const onOtherSide = !added && otherEntries.some(e => sameEntry(e, p));
            const unavailable = added || onOtherSide;
            const addTip = addLabel(p.name, added, onOtherSide);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={styles.rosterBtn}
                  disabled={unavailable}
                  onClick={() => { onAddSearch(p); onSearchChange(''); }}
                  aria-label={addTip}
                  title={addTip}
                >
                  <PosBadge pos={p.pos} />
                  <span className={styles.pName}>{p.name}</span>
                  {added
                    ? <span className={styles.pTeam}>✓ added</span>
                    : onOtherSide
                      ? <span className={styles.pTeam}>on {otherSideName}</span>
                      : <span className={styles.pTeam}>{p.team} · {p.pos}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {entries.length > 0 && (
        // Like the search-results list above, this list appears with no
        // heading — name it after the side, so a screen reader hears which
        // side's picked players these are.
        <ul className={styles.picked} aria-label={`${title} picked players`}>
          {entries.map((e, i) => (
            <li key={`${entryLabel(e)}-${i}`} className={styles.pick}>
              <PosBadge pos={entryPos(e)} />
              <span className={styles.pName}>{entryLabel(e)}</span>
              <span className={styles.pTeam}>{entryTeam(e)}</span>
              <MatchupChip team={entryTeam(e)} pos={entryPos(e)} week={week} />
              <button
                type="button"
                className={styles.remove}
                onClick={() => onRemove(i)}
                aria-label={`Remove ${entryLabel(e)}`}
                title={`Remove ${entryLabel(e)}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Draft picks on this side (backlog item 175): season + round, priced
          by the engine at the mid-round slot — a traded pick's exact slot is
          unknown until the season ends, so the picker never asks for one.
          Duplicates are disabled like already-added players: the same pick
          twice would double-count one asset. */}
      <div className={styles.pickAdder}>
        <span className={styles.label}>Or add a draft pick</span>
        <div className={styles.pickRow}>
          <label className={styles.field}>
            <span className="visually-hidden">{title}: pick season</span>
            <select
              className={styles.select}
              value={pickSeason}
              onChange={e => setPickSeason(Number(e.target.value))}
              aria-label={`${title}: pick season`}
              title={`${title}: pick season`}
            >
              {PICK_SEASONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className="visually-hidden">{title}: pick round</span>
            <select
              className={styles.select}
              value={pickRound}
              onChange={e => setPickRound(Number(e.target.value))}
              aria-label={`${title}: pick round`}
              title={`${title}: pick round`}
            >
              {PICK_ROUNDS.map(r => (
                <option key={r} value={r}>Round {r}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.rosterBtn}
            disabled={picks.some(p => p.season === pickSeason && p.round === pickRound)}
            onClick={() => onAddPick({ season: pickSeason, round: pickRound })}
            aria-label={
              picks.some(p => p.season === pickSeason && p.round === pickRound)
                ? `${pickSeason} Round ${pickRound} pick (already added)`
                : `Add ${pickSeason} Round ${pickRound} pick to ${title}`
            }
            title={
              picks.some(p => p.season === pickSeason && p.round === pickRound)
                ? `${pickSeason} Round ${pickRound} pick (already added)`
                : `Add ${pickSeason} Round ${pickRound} pick to ${title}`
            }
          >
            <span className={styles.pName}>Add pick</span>
          </button>
        </div>
      </div>

      {picks.length > 0 && (
        <ul className={styles.picked} aria-label={`${title} draft picks`}>
          {picks.map((p, i) => (
            <li key={`${p.season}-${p.round}-${i}`} className={styles.pick}>
              <span className={styles.pName}>{pickLabel(p)}</span>
              <button
                type="button"
                className={styles.remove}
                onClick={() => onRemovePick(i)}
                aria-label={`Remove ${pickLabel(p)}`}
                title={`Remove ${pickLabel(p)}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TradeAnalyzerPage({ league }: TradeAnalyzerPageProps) {
  const leagueLoaded = !!league && !league.isGuest;
  const teams = leagueLoaded ? league.teams : [];
  // The week matchup chips price against: the league's current week when
  // loaded, else the estimate from the completed-weeks range in the bundled
  // matchup data (manual mode / shared links).
  const week = league?.currentWeek ?? currentWeekEstimate();
  // The season the Sleeper projection fetch prices against: the league's
  // season when loaded, else the bundled pool's season (manual mode).
  const season = league?.season ?? POOL_SEASON;

  // Sleeper projection values (backlog item 129): one no-auth request
  // shared across both verdict breakdowns; silent degrade to dashes on
  // failure, exactly like the Top Free Agents board's item-128 column.
  const [sleeperProjections, setSleeperProjections] = useState<
    Record<string, number> | undefined
  >(undefined);
  const [sleeperReady, setSleeperReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchSleeperWeekProjections(season, week)
      .then(data => {
        if (!cancelled) {
          setSleeperProjections(data);
          setSleeperReady(true);
        }
      })
      .catch(() => {
        // Silent degrade: dashes, the verdict still grades on VOR.
      });
    return () => {
      cancelled = true;
    };
  }, [season, week]);

  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [sideA, setSideA] = useState<Entry[]>([]);
  const [sideB, setSideB] = useState<Entry[]>([]);
  // Future draft picks per side (backlog item 175): season + round, priced
  // by the engine at the mid-round slot. They ride the same hash/state
  // discipline as the players — a shared link that drops them would grade
  // a different trade than the sender analyzed.
  const [picksA, setPicksA] = useState<TradePick[]>([]);
  const [picksB, setPicksB] = useState<TradePick[]>([]);
  const [queryA, setQueryA] = useState('');
  const [queryB, setQueryB] = useState('');
  const [result, setResult] = useState<FullTradeAnalysis | null>(null);
  // "Make it fair" counter-offer suggestions (backlog item 53): single-
  // player tweaks that would even the analyzed trade out. Priced at
  // analysis time, cleared everywhere the verdict clears.
  const [fixes, setFixes] = useState<FairnessFix[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Title the tab with the verdict once a trade is analyzed: tabs and
  // history entries for different trades stay tellable apart, and a shared
  // #trade= link's recipient sees the verdict in their tab too. App.tsx's
  // per-page title effect only fires on pathname change, so this owns the
  // title while the analyzer is mounted; leaving the page restores the
  // site title (matches the Admin/Awards/Luck/Waivers discipline).
  useEffect(() => {
    if (!result) return;
    const { label, margin } = verdictCopy(result);
    document.title = margin ? `${label} by ${margin} · TraderApe` : `${label} · TraderApe`;
    return () => {
      document.title = SITE_TITLE;
    };
  }, [result]);
  // Players a shared #trade= link named that the consensus pool couldn't
  // resolve. Survives re-analysis; clears when the user edits the builder.
  const [skippedShared, setSkippedShared] = useState(0);

  // When a synced league (PIN or directly connected) loads, preselect
  // Andrew's own team as Side A so the common "what should I give?" flow
  // starts one tap ahead. Never overrides a team the user already picked.
  const leagueKey = leagueLoaded && league ? `${league.platform}:${league.id}` : '';
  // Tracks the league the builder last rendered for. A genuinely different
  // league arriving mid-session resets the builder (see the effect after
  // the preselect below); the first load ('' -> league) is excluded so a
  // shared #trade= link's sides survive until the league's auto-run.
  const prevLeagueKeyRef = useRef(leagueKey);
  const myTeamId = useMemo(
    () => (leagueLoaded && league ? league.teams.find(t => t.isMyTeam)?.id ?? '' : ''),
    [leagueLoaded, league],
  );
  // The league for which the user hand-picked (or hand-cleared) Side A's
  // team. A manual clear leaves teamAId empty just like "never picked",
  // so without this the effect below would re-preselect behind their back.
  const touchedTeamAForRef = useRef('');
  // A genuinely different league arriving mid-session (e.g. opening a
  // ?league= share link while already on this page) invalidates everything
  // the builder holds: stale team ids would sit behind the "pick a team"
  // placeholder and silently block the isMyTeam preselect above. Reset the
  // whole builder — same discipline as switching a side's team. The first
  // load ('' -> league) is NOT a reset: that's when a shared #trade= link's
  // sides are still arriving, and clearing them here would strand the link.
  // Declared after the preselect effect so the reset lands first in the
  // same commit and the preselect immediately picks the new league's team.
  useEffect(() => {
    if (prevLeagueKeyRef.current === leagueKey || prevLeagueKeyRef.current === '') {
      prevLeagueKeyRef.current = leagueKey;
      return;
    }
    prevLeagueKeyRef.current = leagueKey;
    touchedTeamAForRef.current = '';
    setTeamAId('');
    setTeamBId('');
    setSideA([]);
    setSideB([]);
    setQueryA('');
    setQueryB('');
    setResult(null);
    setFixes([]);
    setWarnings([]);
    setSkippedShared(0);
  }, [leagueKey]);
  useEffect(() => {
    if (!myTeamId || teamAId || touchedTeamAForRef.current === leagueKey) return;
    setTeamAId(myTeamId);
  }, [myTeamId, teamAId, leagueKey]);

  // Populate the builder from a shared #trade= link on first load. Runs once;
  // skips names that don't resolve against the consensus pool. hashSides holds
  // the resolved sides until their analysis has run (see the auto-run effect
  // below): a ref isn't enough because the league may still be loading when
  // the hash is applied, and the analysis must reprice once it arrives.
  const hashAppliedRef = useRef(false);
  const [hashSides, setHashSides] = useState<{
    a: Entry[];
    b: Entry[];
    pa: TradePick[];
    pb: TradePick[];
  } | null>(null);
  // A shared #trade= link's team picks (ta/tb) live in a ref, not hashSides:
  // the auto-run effect consumes hashSides as soon as the sides analyze,
  // which in the no-league-yet case is before the league arrives to resolve
  // the team ids against. The ref survives until the team-apply effect below.
  const sharedTeamsRef = useRef<{ ta?: string; tb?: string } | null>(null);
  useEffect(() => {
    if (hashAppliedRef.current) return;
    hashAppliedRef.current = true;
    const shared = decodeTradeHash(window.location.hash);
    if (!shared) return;
    // Names that don't match the consensus pool used to be dropped silently,
    // so a shared link could quietly lose players. Count the misses and keep
    // the count in state — runAnalysis folds it back into the warnings on
    // every run (manual and auto) instead of wiping it on first render.
    let skipped = 0;
    // One seen-set across both sides: a hand-made link naming the same player
    // on both sides resolves him once (Side A wins the tie), matching the
    // builder's cross-side guard — a trade can't grade a player against
    // himself no matter how the sides were populated.
    const seen = new Set<string>();
    const resolveSide = (names: string[]): Entry[] => {
      const out: Entry[] = [];
      for (const name of names) {
        const p = matchPoolByName(name);
        if (p && !seen.has(p.id)) {
          seen.add(p.id);
          out.push(p);
        } else if (!p) {
          skipped += 1;
        }
      }
      return out;
    };
    const a = resolveSide(shared.a);
    const b = resolveSide(shared.b);
    // Picks ride the same decode discipline as players: validated by
    // decodeTradeHash (bad season/round dropped, not the whole link), and
    // a duplicate pick across sides resolves once, Side A winning the tie.
    const seenPicks = new Set<string>();
    const resolvePicks = (ps: TradePick[] | undefined): TradePick[] => {
      const out: TradePick[] = [];
      for (const p of ps ?? []) {
        const key = `${p.season}-${p.round}`;
        if (!seenPicks.has(key)) {
          seenPicks.add(key);
          out.push(p);
        }
      }
      return out;
    };
    const pa = resolvePicks(shared.pa);
    const pb = resolvePicks(shared.pb);
    if (a.length > 0) setSideA(a);
    if (b.length > 0) setSideB(b);
    if (pa.length > 0) setPicksA(pa);
    if (pb.length > 0) setPicksB(pb);
    if (a.length > 0 || b.length > 0 || pa.length > 0 || pb.length > 0) {
      setHashSides({ a, b, pa, pb });
    }
    // Seed the team-apply ref whenever the link carries team picks — even
    // when every named player failed to resolve against the pool (all names
    // stale), the pairing the sender analyzed still matters.
    if (shared.ta || shared.tb) {
      sharedTeamsRef.current = { ta: shared.ta, tb: shared.tb };
    }
    if (skipped > 0) setSkippedShared(skipped);
  }, []);

  // A shared #trade= link carries the sender's team picks (ta/tb). Once the
  // league loads, resolve them against its teams so the link reopens the
  // same pairing the sender analyzed — Side B especially, which otherwise
  // always opens empty. Ids that don't resolve (different league, hand-made
  // link) are ignored and the isMyTeam preselect covers Side A as before.
  // Raw setters only — changeTeam would clear the sides the link just added.
  // Declared after the preselect effect: in the commit where the league
  // lands, the preselect's myTeamId set queues first and this one wins.
  const sharedTeamsAppliedRef = useRef(false);
  useEffect(() => {
    if (sharedTeamsAppliedRef.current || !leagueLoaded) return;
    sharedTeamsAppliedRef.current = true;
    const shared = sharedTeamsRef.current;
    if (!shared || (!shared.ta && !shared.tb)) return;
    const leagueTeams = league && !league.isGuest ? league.teams : [];
    const resolveTeam = (id?: string) =>
      id && leagueTeams.some(t => t.id === id) ? id : '';
    const ta = resolveTeam(shared.ta);
    const tb = resolveTeam(shared.tb);
    if (ta) {
      setTeamAId(ta);
      // Same discipline as a hand pick: once the link's team is applied, the
      // preselect never re-fires behind the user for this league.
      touchedTeamAForRef.current = leagueKey;
    }
    if (tb) setTeamBId(tb);
  }, [leagueLoaded, leagueKey, league]);

  // Editing a side (add/remove a player) invalidates the verdict on screen:
  // it was priced for the previous entries, so clear the stale result,
  // warnings, and URL hash — same discipline as changeTeam below.
  // otherEntries is the opposite side's picks at render time: a player
  // already there can't be added here, so a trade can never grade him
  // against himself. The roster/search buttons already disable for this;
  // the guard here covers the Enter-key path, which bypasses the buttons.
  const addTo = (
    setter: React.Dispatch<React.SetStateAction<Entry[]>>,
    otherEntries: Entry[],
  ) =>
    (p: PoolPlayer) =>
      setter(prev => {
        if (prev.some(e => sameEntry(e, p))) return prev;
        if (otherEntries.some(e => sameEntry(e, p))) return prev;
        setResult(null);
        setFixes([]);
        setWarnings([]);
        setSkippedShared(0);
        clearCopyStatusTimer();
        setCopyStatus('idle');
        setFailedCopyUrl(null);
        clearTradeHashFromUrl();
        return [...prev, p as Entry];
      });
  const removeFrom = (setter: React.Dispatch<React.SetStateAction<Entry[]>>) =>
    (idx: number) =>
      setter(prev => {
        if (idx < 0 || idx >= prev.length) return prev;
        setResult(null);
        setFixes([]);
        setWarnings([]);
        setSkippedShared(0);
        clearCopyStatusTimer();
        setCopyStatus('idle');
        setFailedCopyUrl(null);
        clearTradeHashFromUrl();
        return prev.filter((_, i) => i !== idx);
      });

  // Pick edits invalidate the verdict exactly like player edits (same
  // stale-result / stale-hash discipline). Duplicates are a no-op — the
  // adder button already disables for them, this covers any other path.
  const addPickTo = (setter: React.Dispatch<React.SetStateAction<TradePick[]>>) =>
    (pick: TradePick) =>
      setter(prev => {
        if (prev.some(p => samePick(p, pick))) return prev;
        setResult(null);
        setFixes([]);
        setWarnings([]);
        setSkippedShared(0);
        clearCopyStatusTimer();
        setCopyStatus('idle');
        setFailedCopyUrl(null);
        clearTradeHashFromUrl();
        return [...prev, pick];
      });
  const removePickFrom = (setter: React.Dispatch<React.SetStateAction<TradePick[]>>) =>
    (idx: number) =>
      setter(prev => {
        if (idx < 0 || idx >= prev.length) return prev;
        setResult(null);
        setFixes([]);
        setWarnings([]);
        setSkippedShared(0);
        clearCopyStatusTimer();
        setCopyStatus('idle');
        setFailedCopyUrl(null);
        clearTradeHashFromUrl();
        return prev.filter((_, i) => i !== idx);
      });

  // Declared above changeTeam: the team-change handler lists it as a
  // useCallback dependency, so it must exist before that definition runs.
  // Stable across renders (only touches the ref), and its unmount cleanup
  // means a stale "Copied" reset never fires after the page unmounts.
  const copyStatusTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copyStatusTimer.current !== null) window.clearTimeout(copyStatusTimer.current);
    },
    [],
  );
  const clearCopyStatusTimer = useCallback(() => {
    if (copyStatusTimer.current !== null) {
      window.clearTimeout(copyStatusTimer.current);
      copyStatusTimer.current = null;
    }
  }, []);

  // Switching a side's team resets that side: entries came from the old team's
  // roster (or were searched in its context) and any analysis on screen is
  // stale for the new pairing. Never clears the other side. The URL hash
  // clears too — same discipline as addTo/removeFrom — so the address bar
  // never points at a trade the builder no longer holds.
  // Wrapped in useCallback so the memoized per-side handlers below can list it
  // as a dependency without re-creating every render: the body only calls
  // stable state setters, the stable clearCopyStatusTimer, and module-level
  // helpers.
  const changeTeam = useCallback(
    (
      teamSetter: React.Dispatch<React.SetStateAction<string>>,
      entriesSetter: React.Dispatch<React.SetStateAction<Entry[]>>,
      querySetter: React.Dispatch<React.SetStateAction<string>>,
    ) =>
      (id: string) => {
        teamSetter(id);
        entriesSetter([]);
        querySetter('');
        setResult(null);
        setFixes([]);
        setWarnings([]);
        setSkippedShared(0);
        clearCopyStatusTimer();
        setCopyStatus('idle');
        setFailedCopyUrl(null);
        clearTradeHashFromUrl();
      },
    [clearCopyStatusTimer],
  );
  const changeTeamA = useMemo(
    () => changeTeam(setTeamAId, setSideA, setQueryA),
    [changeTeam],
  );
  const changeTeamB = useMemo(
    () => changeTeam(setTeamBId, setSideB, setQueryB),
    [changeTeam],
  );

  // Flip the trade around: Side A <-> Side B, including team picks and
  // search boxes. The old verdict was priced for the previous orientation,
  // so it (and its URL hash) clears — same discipline as addTo/removeFrom.
  // Mark Side A's team as user-touched: the swap is a deliberate pick, and
  // without this a later manual clear of Side A would let the isMyTeam
  // preselect re-fire behind the user's back.
  const swapSides = () => {
    touchedTeamAForRef.current = leagueKey;
    setSideA(sideB);
    setSideB(sideA);
    setPicksA(picksB);
    setPicksB(picksA);
    setTeamAId(teamBId);
    setTeamBId(teamAId);
    setQueryA(queryB);
    setQueryB(queryA);
    setResult(null);
    setFixes([]);
    setWarnings([]);
    setSkippedShared(0);
    clearCopyStatusTimer();
    setCopyStatus('idle');
    setFailedCopyUrl(null);
    clearTradeHashFromUrl();
  };

  // Clear means clear: drop the team picks too, matching the league-change
  // reset discipline — a cleared builder with stale teams behind it is only
  // half cleared. Mark Side A's team as user-touched so the isMyTeam
  // preselect doesn't immediately re-add Andrew's team behind the user's
  // back (same discipline as the swap button).
  const clearBuilder = () => {
    touchedTeamAForRef.current = leagueKey;
    setTeamAId('');
    setTeamBId('');
    setSideA([]);
    setSideB([]);
    setPicksA([]);
    setPicksB([]);
    setResult(null);
    setFixes([]);
    setWarnings([]);
    setSkippedShared(0);
    clearCopyStatusTimer();
    setCopyStatus('idle');
    setFailedCopyUrl(null);
    clearTradeHashFromUrl();
    setQueryA('');
    setQueryB('');
  };

  const runAnalysis = (sides?: { a: Entry[]; b: Entry[] }) => {
    const entriesA = sides?.a ?? sideA;
    const entriesB = sides?.b ?? sideB;
    const valueLeague = valueLeagueFor(leagueLoaded ? league : null);
    const ra = resolveTradeSide(entriesA);
    const rb = resolveTradeSide(entriesB);
    const warns: string[] = [];
    // The shared-link "couldn't be matched" notice is state, not a one-shot:
    // every re-run re-emits it so the auto-run on first load can't swallow it.
    if (skippedShared > 0) warns.push(skippedSharedWarning(skippedShared));
    if (ra.unresolved.length > 0 || rb.unresolved.length > 0) {
      warns.push(
        `Couldn't match ${[...ra.unresolved, ...rb.unresolved].join(', ')} to rankings — left out of the math.`,
      );
    }
    const teamA = teams.find(t => t.id === teamAId);
    const teamB = teams.find(t => t.id === teamBId);
    const analysis = analyzeTrade(ra.players, rb.players, {
      valueLeague,
      teamA,
      teamB,
      picksA,
      picksB,
    });
    setResult(analysis);
    // "Make it fair" counter-offers (backlog item 53): priced on the
    // resolved sides at analysis time. Add candidates come from the losing
    // side's team roster in league mode, the bundled pool in manual mode.
    // The pick VOR offsets keep the fixes honest when a pick is on a side:
    // a trade that's even only because of a pick gets no spurious fix.
    setFixes(
      suggestFairnessFixes({
        sideA: ra.players,
        sideB: rb.players,
        valueLeague,
        rosterA: teamA?.roster,
        rosterB: teamB?.roster,
        pickVorA: analysis.picksA.reduce((s, p) => s + p.vor, 0),
        pickVorB: analysis.picksB.reduce((s, p) => s + p.vor, 0),
      }),
    );
    setWarnings(warns);
    syncTradeHashToUrl(entriesA, entriesB, teamAId, teamBId, picksA, picksB);
  };

  // One-tap "make it fair": apply a counter-offer suggestion to the
  // builder and re-run the analysis, so the tap lands on the new verdict
  // (the competitor's "tap a suggestion to add it"). The add/remove
  // helpers clear the stale verdict/hash like any builder edit; the
  // re-analysis prices the adjusted sides.
  const applyFix = (fix: FairnessFix) => {
    if (fix.action === 'add') {
      const adder = fix.side === 'A' ? addTo(setSideA, sideB) : addTo(setSideB, sideA);
      adder(fix.player);
      runAnalysis({
        a: fix.side === 'A' ? [...sideA, fix.player] : sideA,
        b: fix.side === 'B' ? [...sideB, fix.player] : sideB,
      });
      return;
    }
    const entries = fix.side === 'A' ? sideA : sideB;
    const idx = entries.findIndex(e => sameEntry(e, fix.player));
    if (idx < 0) return;
    const remover = fix.side === 'A' ? removeFrom(setSideA) : removeFrom(setSideB);
    remover(idx);
    runAnalysis({
      a: fix.side === 'A' ? sideA.filter((_, i) => i !== idx) : sideA,
      b: fix.side === 'B' ? sideB.filter((_, i) => i !== idx) : sideB,
    });
  };

  // A shared #trade= link should land on the verdict, not a populated but
  // un-analyzed builder. Runs as soon as the hash sides are applied (with
  // manual-mode values if the league hasn't loaded yet), then re-runs once
  // the real league arrives (null -> league) so the verdict reprices for the
  // league's size, scoring, and roster shape. The pending auto-run survives
  // until the league's team pickers have settled, so the league-priced run
  // includes Side A's preselect (and its roster takes). If the user edits the
  // builder before the league arrives, the pending auto-run is stale and is
  // dropped.
  useEffect(() => {
    if (!hashSides) return;
    const stale =
      hashSides.a.length !== sideA.length ||
      hashSides.b.length !== sideB.length ||
      hashSides.a.some((e, i) => !sameEntry(e, sideA[i])) ||
      hashSides.b.some((e, i) => !sameEntry(e, sideB[i])) ||
      hashSides.pa.length !== picksA.length ||
      hashSides.pb.length !== picksB.length ||
      hashSides.pa.some((p, i) => !samePick(p, picksA[i])) ||
      hashSides.pb.some((p, i) => !samePick(p, picksB[i]));
    if (stale) {
      setHashSides(null);
      return;
    }
    runAnalysis(hashSides);
    const teamsSettled = !leagueLoaded || teamAId !== '' || myTeamId === '';
    if (teamsSettled) setHashSides(null);
    setAutoScrollPending(true);
    // runAnalysis is an event handler whose identity changes every render;
    // depending on it would re-analyze on every keystroke. The listed deps
    // are the only ones that should re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueLoaded, league, hashSides, sideA, sideB, picksA, picksB, teamAId, teamBId, myTeamId]);

  // A trade needs two different teams: trading with yourself grades
  // nothing real. The button disables and a note explains.
  const sameTeam = leagueLoaded && teamAId !== '' && teamAId === teamBId;
  const canRun =
    (sideA.length > 0 || sideB.length > 0 || picksA.length > 0 || picksB.length > 0) &&
    !sameTeam;
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  // When the clipboard is unavailable (older browsers, non-secure context,
  // mobile webviews), the button can't copy — but the link still exists.
  // Keep it visible as a selectable field so the user can copy it by hand
  // instead of hitting a dead end. Cleared whenever the builder changes,
  // since the URL encodes the exact sides.
  const [failedCopyUrl, setFailedCopyUrl] = useState<string | null>(null);
  // The "copied"/"failed" label resets after a beat. Track the timer so a
  // second click can't let the first timer erase the fresh status, and so
  const resultsRef = useRef<HTMLDivElement>(null);
  // A shared-link auto-run lands the visitor at the top of a populated
  // builder; once the verdict renders, bring it into view. Scoped to the
  // auto-run — manual "Analyze trade" clicks stay put.
  const [autoScrollPending, setAutoScrollPending] = useState(false);
  useEffect(() => {
    if (autoScrollPending && result) {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setAutoScrollPending(false);
    }
  }, [autoScrollPending, result]);

  const copyTradeLink = async () => {
    // Use the live location (not a hardcoded path) so the copied link keeps
    // the shared-league params (?league= / ?pin=) the trade was priced for.
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${encodeTradeHash(sideA, sideB, teamAId, teamBId, picksA, picksB)}`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // Clipboard API unavailable (older browsers / non-secure context):
      // fall back to the legacy execCommand path. execCommand returns false
      // when the copy silently fails, so only confirm on true success.
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      // iOS Safari's execCommand('copy') only works on a focused, readonly
      // field with an explicit selection range — select() alone fails there.
      ta.readOnly = true;
      document.body.appendChild(ta);
      ta.focus();
      ta.setSelectionRange(0, ta.value.length);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
    }
    clearCopyStatusTimer();
    setCopyStatus(ok ? 'copied' : 'failed');
    setFailedCopyUrl(ok ? null : url);
    copyStatusTimer.current = window.setTimeout(() => setCopyStatus('idle'), 2000);
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <header className={styles.hero}>
          <span className={styles.kicker}>▌ PROSPECTIVE TRADE ANALYZER</span>
          <h1 className={styles.heading}>Trade Analyzer</h1>
          <p className={styles.intro}>
            Grade a trade <em>before</em> you make it. Pick the players — and
            any future draft picks — changing hands and get a
            value-over-replacement verdict
            {leagueLoaded
              ? <> for your league's exact shape — {league.name} — with
                roster-aware takes on how the deal hits each team's positional depth.</>
              : ' against the consensus board.'}
          </p>
          <DataAsOf syncedAt={league?.pinSyncedAt} />
          {!leagueLoaded && (
            <p className={styles.guestNote}>
              No league connected — running in manual mode against the consensus
              board. <Link to="/">Load the league</Link> for team rosters and
              depth analysis.
            </p>
          )}
        </header>

        <div className={styles.builder}>
          <SideBuilder
            title="Side A gives"
            entries={sideA}
            otherEntries={sideB}
            otherSideName="Side B"
            onRemove={removeFrom(setSideA)}
            teams={teams}
            teamId={teamAId}
            onTeamChange={id => { touchedTeamAForRef.current = leagueKey; changeTeamA(id); }}
            searchQuery={queryA}
            onSearchChange={setQueryA}
            onAddSearch={addTo(setSideA, sideB)}
            leagueLoaded={leagueLoaded}
            week={week}
            picks={picksA}
            onAddPick={addPickTo(setPicksA)}
            onRemovePick={removePickFrom(setPicksA)}
          />
          <button
            type="button"
            className={styles.swap}
            onClick={swapSides}
            // Swap exchanges the team picks too, not just the players — so it
            // stays enabled when either side has a team picked (e.g. the Side A
            // preselect) even before any players are added.
            disabled={sideA.length === 0 && sideB.length === 0 && picksA.length === 0 && picksB.length === 0 && teamAId === '' && teamBId === ''}
            aria-label="Swap sides"
            title="Swap sides"
          >
            <span className={styles.swapIconH} aria-hidden="true">⇄</span>
            <span className={styles.swapIconV} aria-hidden="true">⇅</span>
          </button>
          <SideBuilder
            title="Side B gives"
            entries={sideB}
            otherEntries={sideA}
            otherSideName="Side A"
            onRemove={removeFrom(setSideB)}
            teams={teams}
            teamId={teamBId}
            onTeamChange={changeTeamB}
            searchQuery={queryB}
            onSearchChange={setQueryB}
            onAddSearch={addTo(setSideB, sideA)}
            leagueLoaded={leagueLoaded}
            week={week}
            picks={picksB}
            onAddPick={addPickTo(setPicksB)}
            onRemovePick={removePickFrom(setPicksB)}
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.analyze}
            disabled={!canRun}
            // The empty-builder hint below the button already says this in
            // visible text; the title keeps the reason attached to the
            // button itself for tooltips and assistive tech.
            title={sideA.length === 0 && sideB.length === 0 && picksA.length === 0 && picksB.length === 0 ? 'Add players or a draft pick to either side first' : undefined}
            onClick={() => runAnalysis()}
          >
            Analyze trade
          </button>
          {(sideA.length > 0 || sideB.length > 0 || picksA.length > 0 || picksB.length > 0) && (
            <button
              type="button"
              className={styles.copy}
              onClick={copyTradeLink}
              aria-live="polite"
              // The URL already carries the #trade= hash, but nothing on the
              // button says what the link contains — keep the why attached
              // to the button itself for tooltips and assistive tech.
              title="Copies a link with this trade's players, draft picks, and teams — league context stays in the URL"
            >
              {copyStatus === 'copied' ? 'Copied ✓' : copyStatus === 'failed' ? 'Copy failed' : 'Copy trade link'}
            </button>
          )}
          {(sideA.length > 0 || sideB.length > 0 || picksA.length > 0 || picksB.length > 0) && (
            <button
              type="button"
              className={styles.clear}
              onClick={clearBuilder}
              // The last of the action buttons to get one: Swap, Analyze, and
              // Copy trade link all carry title tooltips — keep the why
              // attached to this one too, for tooltips and assistive tech.
              title="Clear all players, draft picks, teams, and results"
            >
              Clear
            </button>
          )}
        </div>

        {failedCopyUrl && (
          <div className={styles.copyFallback}>
            <p className={styles.copyFallbackHint}>
              Auto-copy isn't available on this device — select the link below
              and copy it by hand:
            </p>
            <input
              type="text"
              readOnly
              className={styles.copyFallbackInput}
              value={failedCopyUrl}
              aria-label="Trade link — select and copy manually"
              // The hint above already says what this is, but only for
              // sighted readers — the title keeps the why attached to the
              // control itself for tooltips and assistive tech, matching the
              // Copy trade link button's title discipline above.
              title="Trade link — select and copy manually"
              onFocus={e => e.currentTarget.select()}
              onClick={e => e.currentTarget.select()}
            />
          </div>
        )}

        {sameTeam && (
          // The builder warnings live outside the results live region, so a
          // screen reader user picking the same team for both sides would
          // otherwise never hear this blocking warning. role="alert" makes
          // it announce the moment it appears. Visible text unchanged.
          <p className={styles.warning} role="alert">
            Side A and Side B are the same team — pick two different teams to grade a trade.
          </p>
        )}

        {sideA.length === 0 && sideB.length === 0 && picksA.length === 0 && picksB.length === 0 && (
          <p className={styles.emptyHint}>
            {leagueLoaded
              ? 'Add players to either side — from a team roster or the name search — or a draft pick, then hit Analyze trade.'
              : 'Add players to either side with the name search — or a draft pick — then hit Analyze trade.'}
          </p>
        )}

        {warnings.map((w, i) => (
          // The analysis warnings live outside the results live region, so a
          // screen reader user would otherwise hear the verdict but never
          // the caveat that some players were left out of the math.
          // role="alert" announces each warning the moment it appears,
          // matching the same-team warning's discipline above.
          <p key={i} className={styles.warning} role="alert">{w}</p>
        ))}

        {/* Always mounted: the live region must exist before the verdict
            appears so screen readers announce it. Announcing only the
            verdict, not the builder/search chatter, keeps it noise-free. */}
        <div ref={resultsRef} aria-live="polite">
          {result && (
            <Results
              result={result}
              leagueLoaded={leagueLoaded}
              week={week}
              fixes={fixes}
              onApplyFix={applyFix}
              sleeperProjections={sleeperProjections}
              sleeperReady={sleeperReady}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

// One source of truth for the human-readable verdict, shared by the results
// section and the document title. Names the winning team when we know it
// (league loaded with teams picked); falls back to "Side A/B wins" in
// manual mode.
function verdictCopy(result: FullTradeAnalysis): { label: string; margin: string | null } {
  const teamAName = result.teamAImpact?.teamName ?? '';
  const teamBName = result.teamBImpact?.teamName ?? '';
  const winnerName = result.winner === 'A' ? teamAName : result.winner === 'B' ? teamBName : '';
  const label =
    result.winner === 'even'
      ? 'Even trade'
      : winnerName
        ? `${winnerName} wins`
        : result.winner === 'A'
          ? 'Side A wins'
          : 'Side B wins';
  const margin = result.winner === 'even' ? null : `${result.margin} VOR pt${result.margin === 1 ? '' : 's'}`;
  return { label, margin };
}

function Results({
  result,
  leagueLoaded,
  week,
  fixes,
  onApplyFix,
  sleeperProjections,
  sleeperReady,
}: {
  result: FullTradeAnalysis;
  leagueLoaded: boolean;
  week: number;
  fixes: FairnessFix[];
  onApplyFix: (fix: FairnessFix) => void;
  sleeperProjections: Record<string, number> | undefined;
  sleeperReady: boolean;
}) {
  const teamAName = result.teamAImpact?.teamName ?? '';
  const teamBName = result.teamBImpact?.teamName ?? '';
  const { label: verdict, margin } = verdictCopy(result);
  return (
    <section className={styles.results} aria-label="Trade verdict">
      <div className={`${styles.verdict} ${styles[`verdict${result.winner}`]}`}>
        <span className={styles.verdictLabel}>{verdict}</span>
        {margin && <span className={styles.verdictMargin}>by {margin}</span>}
      </div>

      <div className={styles.totals}>
        <div className={styles.total}>
          <span className={styles.totalLabel}>{teamAName ? `Side A — ${teamAName}` : 'Side A'} value</span>
          {/* Side A lost: dim its number so the totals row agrees with the
             verdict strip above (Side B keeps the lime accent). Even trades
             leave both numbers lime. */}
          <span className={`${styles.totalNum}${result.winner === 'B' ? ` ${styles.totalLose}` : ''}`}>{result.sideATotal}</span>
        </div>
        <div className={styles.total}>
          <span className={styles.totalLabel}>{teamBName ? `Side B — ${teamBName}` : 'Side B'} value</span>
          <span className={`${styles.totalNum}${result.winner === 'A' ? ` ${styles.totalLose}` : ''}`}>{result.sideBTotal}</span>
        </div>
      </div>

      {fixes.length > 0 && (
        // "Make it fair" counter-offer suggestions (backlog item 53): the
        // single-player tweaks that would even a lopsided trade out,
        // priced on the same VOR values as the verdict. One tap applies the
        // tweak to the builder and re-runs the analysis. The list renders
        // inside the results live region, so the verdict announcement
        // includes the fix count.
        <section className={styles.fairness} aria-label="Make it fair">
          <h3 className={styles.fairnessTitle}>Make it fair</h3>
          <ul className={styles.fixList} aria-label="Suggested tweaks to even the trade">
            {fixes.map((fix, i) => {
              const sideName = fix.side === 'A' ? teamAName || 'Side A' : teamBName || 'Side B';
              const blurb = fixBlurb(fix, teamAName || 'Side A', teamBName || 'Side B');
              const actionLabel =
                fix.action === 'add'
                  ? `Add ${fix.player.name} to ${sideName}`
                  : `Remove ${fix.player.name} from ${sideName}`;
              const resultNote =
                fix.newWinner === 'even'
                  ? 'Evens the trade'
                  : `${fix.newWinner === 'A' ? teamAName || 'Side A' : teamBName || 'Side B'} still leads by ${fix.newMargin} VOR`;
              return (
                <li key={`${fix.action}-${fix.side}-${fix.player.id}-${i}`} className={styles.fixRow}>
                  <button
                    type="button"
                    className={styles.fixBtn}
                    onClick={() => onApplyFix(fix)}
                    // The visible label says what changes; the blurb names
                    // the resulting verdict too, keeping the why attached
                    // to the button for tooltips and assistive tech.
                    aria-label={`${blurb} Apply to the builder`}
                    title={blurb}
                  >
                    {actionLabel}
                  </button>
                  <span className={styles.fixNote}>{resultNote}</span>
                </li>
              );
            })}
          </ul>
          <p className={styles.fixMethod}>
            One-tap tweaks priced on the same value-over-replacement numbers
            as the verdict — guidance only, not trade advice.
          </p>
        </section>
      )}

      <div className={styles.breakdowns}>
        <PlayerBreakdown title={teamAName ? `Side A — ${teamAName}` : 'Side A'} players={result.sideA} picks={result.picksA} week={week} sleeperProjections={sleeperProjections} sleeperReady={sleeperReady} />
        <PlayerBreakdown title={teamBName ? `Side B — ${teamBName}` : 'Side B'} players={result.sideB} picks={result.picksB} week={week} sleeperProjections={sleeperProjections} sleeperReady={sleeperReady} />
      </div>

      {(result.teamAImpact || result.teamBImpact) && (
        <div className={styles.impacts}>
          {result.teamAImpact && <TeamImpact impact={result.teamAImpact} side="A" />}
          {result.teamBImpact && <TeamImpact impact={result.teamBImpact} side="B" />}
        </div>
      )}

      <p className={styles.method}>
        Values are value-over-replacement (VOR) in projected points, computed
        {leagueLoaded ? (
          <>
            {' '}
            for your league's size, scoring, and roster shape. A raw value win
            isn't everything — check the roster takes below for how each team's
            starting lineup actually changes.
          </>
        ) : (
          <>
            {' '}
            for a standard 10-team full-PPR league (1 QB, 2 RB, 2 WR, TE, FLEX,
            K, DST, 6 bench). <Link to="/">Load the league</Link> to grade the
            trade against your league's real shape and get roster takes for
            each team.
          </>
        )}
        {' '}The matchup chip on each player is the week-{week} opponent's
        points allowed vs his position, from completed weeks{' '}
        {matchupDataWeeks()[0]}–{matchupDataWeeks()[1]} — the same rating the
        Start/Sit page shows. The Sleeper value beside each VOR is
        Sleeper's own week-{week} projection where published; a dash means
        no Sleeper line for that player, and the verdict counts VOR rows
        only. Draft picks price at the mid-round slot for the league size
        (a traded pick's exact slot is unknown until the season ends),
        losing one round of value per year beyond the next draft — an
        expected value, not a guarantee of where the pick lands. Picks
        count toward the value totals but never toward a starting lineup.
      </p>
    </section>
  );
}

// Item-129 Sleeper projection value: Sleeper's own week-N projection next
// to TraderApe's VOR, so the verdict can be checked against the market
// number. A pending or failed fetch just leaves dashes — the breakdown
// never waits on it, and the verdict counts VOR rows only.
function SleeperValue({
  player,
  projections,
  ready,
  week,
}: {
  player: FullTradeAnalysis['sideA'][number]['player'];
  projections: Record<string, number> | undefined;
  ready: boolean;
  week: number;
}) {
  const sid = player.sleeperId;
  const value = ready && sid ? projections?.[String(sid)] : undefined;
  if (value === undefined) {
    return (
      <span
        className={styles.sleeper}
        aria-label={
          ready
            ? 'No Sleeper projection for this player'
            : 'Sleeper projection not loaded'
        }
      >
        —
      </span>
    );
  }
  const label = `Sleeper projection ${value.toFixed(1)} for week ${week}`;
  return (
    <span className={styles.sleeper} title={label} aria-label={label}>
      {value.toFixed(1)}
    </span>
  );
}

function PlayerBreakdown({
  title,
  players,
  picks,
  week,
  sleeperProjections,
  sleeperReady,
}: {
  title: string;
  players: FullTradeAnalysis['sideA'];
  picks: ValuedPick[];
  week: number;
  sleeperProjections: Record<string, number> | undefined;
  sleeperReady: boolean;
}) {
  if (players.length === 0 && picks.length === 0) {
    return (
      <div className={styles.breakdown}>
        <h3>{title}</h3>
        <p className={styles.emptySide}>Nothing</p>
      </div>
    );
  }
  return (
    <div className={styles.breakdown}>
      <h3>{title}</h3>
      <ul aria-label={`${title} player values`}>
        {players.map(({ player, vor }) => (
          <li key={player.id} className={styles.vorRow}>
            <PosBadge pos={player.pos} />
            <span className={styles.pName}>{player.name}</span>
            {/* NFL team identity line, matching the picked-player rows —
                the verdict section is the one place picks lose their team. */}
            <span className={styles.pTeam}>{player.team}</span>
            <MatchupChip team={player.team} pos={player.pos} week={week} />
            <span className={styles.vor}>{vor.toFixed(1)}</span>
            <SleeperValue
              player={player}
              projections={sleeperProjections}
              ready={sleeperReady}
              week={week}
            />
          </li>
        ))}
        {/* Draft picks on this side (backlog item 175): no matchup chip and
            no Sleeper line — a pick has no week-N opponent — just the label
            and its expected VOR, which the totals above already include. */}
        {picks.map(({ pick, vor, label }) => (
          <li
            key={`${pick.season}-${pick.round}`}
            className={styles.vorRow}
            aria-label={`${label}, expected value ${vor.toFixed(1)} VOR`}
            title={`${label} — expected value, priced at the mid-round slot`}
          >
            <span className={styles.pName}>{label}</span>
            <span className={styles.vor}>{vor.toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamImpact({
  impact,
  side,
}: {
  impact: NonNullable<FullTradeAnalysis['teamAImpact']>;
  side: string;
}) {
  if (impact.takes.length === 0) return null;
  return (
    <div className={styles.impact}>
      <h3>
        {impact.teamName} <span className={styles.sideTag}>(Side {side})</span>
      </h3>
      {/* The list had no name of its own beyond the heading, so screen
          readers heard an anonymous list; the name mirrors the heading
          plus the page's roster-takes discipline. */}
      <ul aria-label={`${impact.teamName} (Side ${side}) roster takes`}>
        {impact.takes.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
