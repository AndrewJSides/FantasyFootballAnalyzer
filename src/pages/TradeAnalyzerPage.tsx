import { useEffect, useMemo, useState } from 'react';
import type { League, Player, Team } from '@/types';
import type { PoolPlayer } from '@/types/draft';
import { POOL } from '@/data/draftPool';
import { PosBadge } from '@/components/PosBadge';
import {
  analyzeTrade,
  resolveTradeSide,
  valueLeagueFor,
  type FullTradeAnalysis,
} from '@/utils/tradeAnalysis';
import styles from './TradeAnalyzerPage.module.css';

interface TradeAnalyzerPageProps {
  league: League | null;
}

type Entry = Player | PoolPlayer;

// ---------------------------------------------------------------------------
// Player search (manual mode): match against the bundled pool by name.
// ---------------------------------------------------------------------------

function searchPool(query: string, limit = 8): PoolPlayer[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: PoolPlayer[] = [];
  for (const p of POOL.players) {
    if (p.name.toLowerCase().includes(q)) {
      out.push(p);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function entryLabel(e: Entry): string {
  return e.name;
}

function entryPos(e: Entry): string {
  return 'position' in e ? (e as Player).position : (e as PoolPlayer).pos;
}

// ---------------------------------------------------------------------------
// Side builder column
// ---------------------------------------------------------------------------

function SideBuilder(props: {
  title: string;
  entries: Entry[];
  onRemove: (idx: number) => void;
  teams: Team[];
  teamId: string;
  onTeamChange: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onAddSearch: (p: PoolPlayer) => void;
  leagueLoaded: boolean;
}) {
  const {
    title, entries, onRemove, teams, teamId, onTeamChange,
    searchQuery, onSearchChange, onAddSearch, leagueLoaded,
  } = props;
  const team = teams.find(t => t.id === teamId);
  const results = useMemo(() => searchPool(searchQuery), [searchQuery]);

  const addRosterPlayer = (p: Player) => {
    if (!entries.some(e => 'platformId' in e && (e as Player).id === p.id)) {
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
          >
            <option value="">— pick a team —</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
      )}

      {team && (
        <div className={styles.rosterList}>
          <span className={styles.label}>Tap a player to add</span>
          <ul>
            {(team.roster ?? []).map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  className={styles.rosterBtn}
                  onClick={() => addRosterPlayer(p)}
                >
                  <PosBadge pos={p.position} />
                  <span className={styles.pName}>{p.name}</span>
                  <span className={styles.pTeam}>{p.team}</span>
                </button>
              </li>
            ))}
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
        />
      </label>
      {results.length > 0 && (
        <ul className={styles.searchResults}>
          {results.map(p => (
            <li key={p.id}>
              <button
                type="button"
                className={styles.rosterBtn}
                onClick={() => { onAddSearch(p); onSearchChange(''); }}
              >
                <PosBadge pos={p.pos} />
                <span className={styles.pName}>{p.name}</span>
                <span className={styles.pTeam}>{p.team} · {p.pos}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && (
        <ul className={styles.picked}>
          {entries.map((e, i) => (
            <li key={`${entryLabel(e)}-${i}`} className={styles.pick}>
              <PosBadge pos={entryPos(e)} />
              <span className={styles.pName}>{entryLabel(e)}</span>
              <button
                type="button"
                className={styles.remove}
                onClick={() => onRemove(i)}
                aria-label={`Remove ${entryLabel(e)}`}
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

  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [sideA, setSideA] = useState<Entry[]>([]);
  const [sideB, setSideB] = useState<Entry[]>([]);
  const [queryA, setQueryA] = useState('');
  const [queryB, setQueryB] = useState('');
  const [result, setResult] = useState<FullTradeAnalysis | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // When a synced league (PIN or directly connected) loads, preselect
  // Andrew's own team as Side A so the common "what should I give?" flow
  // starts one tap ahead. Never overrides a team the user already picked.
  const myTeamId = useMemo(
    () => (leagueLoaded && league ? league.teams.find(t => t.isMyTeam)?.id ?? '' : ''),
    [leagueLoaded, league],
  );
  useEffect(() => {
    if (myTeamId && !teamAId) {
      setTeamAId(myTeamId);
    }
  }, [myTeamId, teamAId]);

  const addTo = (setter: React.Dispatch<React.SetStateAction<Entry[]>>) =>
    (p: PoolPlayer) => setter(prev => [...prev, p as Entry]);
  const removeFrom = (setter: React.Dispatch<React.SetStateAction<Entry[]>>) =>
    (idx: number) => setter(prev => prev.filter((_, i) => i !== idx));

  const runAnalysis = () => {
    const valueLeague = valueLeagueFor(leagueLoaded ? league : null);
    const ra = resolveTradeSide(sideA);
    const rb = resolveTradeSide(sideB);
    const warns: string[] = [];
    if (ra.unresolved.length > 0 || rb.unresolved.length > 0) {
      warns.push(
        `Couldn't match ${[...ra.unresolved, ...rb.unresolved].join(', ')} to rankings — left out of the math.`,
      );
    }
    const teamA = teams.find(t => t.id === teamAId);
    const teamB = teams.find(t => t.id === teamBId);
    setResult(
      analyzeTrade(ra.players, rb.players, {
        valueLeague,
        teamA,
        teamB,
      }),
    );
    setWarnings(warns);
  };

  const canRun = sideA.length > 0 || sideB.length > 0;

  return (
    <div className={styles.page}>
      <div className="container">
        <header className={styles.hero}>
          <span className={styles.kicker}>▌ PROSPECTIVE TRADE ANALYZER</span>
          <h1 className={styles.heading}>Trade Analyzer</h1>
          <p className={styles.intro}>
            Grade a trade <em>before</em> you make it. Pick the players changing
            hands and get a value-over-replacement verdict for your league's
            exact shape
            {leagueLoaded ? ` — ${league.name}` : ''}. Connect a Yahoo, ESPN, or
            Sleeper league for roster-aware takes on how the deal hits each
            team's positional depth.
          </p>
          {!leagueLoaded && (
            <p className={styles.guestNote}>
              No league connected — running in manual mode against the consensus
              board. <a href="/">Connect your league</a> for team rosters and
              depth analysis.
            </p>
          )}
        </header>

        <div className={styles.builder}>
          <SideBuilder
            title="Side A gives"
            entries={sideA}
            onRemove={removeFrom(setSideA)}
            teams={teams}
            teamId={teamAId}
            onTeamChange={setTeamAId}
            searchQuery={queryA}
            onSearchChange={setQueryA}
            onAddSearch={addTo(setSideA)}
            leagueLoaded={leagueLoaded}
          />
          <div className={styles.vs} aria-hidden="true">⇄</div>
          <SideBuilder
            title="Side B gives"
            entries={sideB}
            onRemove={removeFrom(setSideB)}
            teams={teams}
            teamId={teamBId}
            onTeamChange={setTeamBId}
            searchQuery={queryB}
            onSearchChange={setQueryB}
            onAddSearch={addTo(setSideB)}
            leagueLoaded={leagueLoaded}
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.analyze}
            disabled={!canRun}
            onClick={runAnalysis}
          >
            Analyze trade
          </button>
          {(sideA.length > 0 || sideB.length > 0) && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => { setSideA([]); setSideB([]); setResult(null); setWarnings([]); }}
            >
              Clear
            </button>
          )}
        </div>

        {warnings.map((w, i) => (
          <p key={i} className={styles.warning}>{w}</p>
        ))}

        {result && <Results result={result} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function Results({ result }: { result: FullTradeAnalysis }) {
  const verdict =
    result.winner === 'even'
      ? 'Even trade'
      : result.winner === 'A'
        ? 'Side A wins'
        : 'Side B wins';
  return (
    <section className={styles.results} aria-label="Trade verdict">
      <div className={`${styles.verdict} ${styles[`verdict${result.winner}`]}`}>
        <span className={styles.verdictLabel}>{verdict}</span>
        {result.winner !== 'even' && (
          <span className={styles.verdictMargin}>
            by {result.margin} VOR pts
          </span>
        )}
      </div>

      <div className={styles.totals}>
        <div className={styles.total}>
          <span className={styles.totalLabel}>Side A value</span>
          <span className={styles.totalNum}>{result.sideATotal}</span>
        </div>
        <div className={styles.total}>
          <span className={styles.totalLabel}>Side B value</span>
          <span className={styles.totalNum}>{result.sideBTotal}</span>
        </div>
      </div>

      <div className={styles.breakdowns}>
        <PlayerBreakdown title="Side A" players={result.sideA} />
        <PlayerBreakdown title="Side B" players={result.sideB} />
      </div>

      {(result.teamAImpact || result.teamBImpact) && (
        <div className={styles.impacts}>
          {result.teamAImpact && <TeamImpact impact={result.teamAImpact} side="A" />}
          {result.teamBImpact && <TeamImpact impact={result.teamBImpact} side="B" />}
        </div>
      )}

      <p className={styles.method}>
        Values are value-over-replacement (VOR) in projected points, computed
        for your league's size, scoring, and roster shape. A raw value win
        isn't everything — check the roster takes below for how each team's
        starting lineup actually changes.
      </p>
    </section>
  );
}

function PlayerBreakdown({
  title,
  players,
}: {
  title: string;
  players: FullTradeAnalysis['sideA'];
}) {
  if (players.length === 0) {
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
      <ul>
        {players.map(({ player, vor }) => (
          <li key={player.id} className={styles.vorRow}>
            <PosBadge pos={player.pos} />
            <span className={styles.pName}>{player.name}</span>
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
      <ul>
        {impact.takes.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
