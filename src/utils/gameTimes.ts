// Kickoff times for the current NFL week, from the bundled ESPN-sourced
// game-times snapshot (scripts/buildGameTimes.ts, `npm run fetch:gametimes`).
// Powers the Start/Sit page's kickoff chips and the late-swap watch
// (backlog item 35): lineup locks are per-game, not per-week, so WHEN a
// player plays decides whether a late scratch can still be swapped out.

import GAME_TIMES from '@/data/nflGameTimes.2026.json';

// The bundled snapshot carries a fixed week-key type; widen it at the
// boundary so week lookup is a plain string index.
const GAME_WEEKS = (GAME_TIMES as { weeks: Record<string, Record<string, string>> }).weeks;

export interface Kickoff {
  /** ISO-8601 UTC from ESPN's scoreboard. */
  iso: string;
  /** Milliseconds since epoch — orders kickoff slots chronologically. */
  rank: number;
  /** e.g. "Sun 1:05pm ET". */
  label: string;
  /** Short slot tag: "Thu", "Sun 1pm", "Sun 4pm", "SNF", "MNF", "Sat". */
  slot: string;
}

const ET = 'America/New_York';

const DAY_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  weekday: 'short',
});
const TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** Sunday 1pm / 4pm boundary and the prime-time boundary, in ET hours. */
function slotFor(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const day = get('weekday');
  const hour = Number(get('hour'));
  if (day === 'Thu') return 'Thu';
  if (day === 'Mon') return 'MNF';
  if (day === 'Sat') return 'Sat';
  if (day === 'Sun') {
    if (hour >= 19) return 'SNF';
    if (hour >= 15) return 'Sun 4pm';
    return 'Sun 1pm';
  }
  return `${day} ${TIME_FMT.format(date)}`;
}

export function gameKickoff(nflTeam: string, week: number | undefined): Kickoff | null {
  if (week === undefined) return null;
  const iso = GAME_WEEKS[String(week)]?.[nflTeam] ?? null;
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const label = `${DAY_FMT.format(date)} ${TIME_FMT.format(date).replace(' ', '').toLowerCase()} ET`;
  return { iso, rank: date.getTime(), label, slot: slotFor(date) };
}

/** True when the player's game-time decision matters: Questionable/Doubtful. */
export function isGameTimeDecision(injuryStatus: string | null | undefined): boolean {
  return /questionable|doubtful/i.test(injuryStatus ?? '');
}
