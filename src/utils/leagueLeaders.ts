// League Leaders board (backlog item 78) — TraderApe's take on the
// "Top Players" leaderboard fantasy tools publish alongside standings
// (public feature description only, e.g. the RTSports top-players report:
// rank, player, position, NFL team, total points, average, per-week
// columns — researched Nov 1, 2026 for feature shape; the values below
// are TraderApe's own full-PPR totals from Sleeper's public weekly
// stats, no copied content).
//
// League mode flags ownership so the manager sees which leaders are
// rostered and by whom (a leader on waivers is a pickup target; a leader
// on a rival's roster is not). Guest mode degrades to pure totals with
// no ownership column. Completed weeks only — the in-progress week's
// partial stats would halve a player's pace (same convention as the
// Weekly Rankings page this board sits on).

import type { WeeklyPprPoints } from '@/api/sleeperWeeklyPoints';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';

export const LEADER_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type LeaderPosition = (typeof LEADER_POSITIONS)[number];

export interface LeaderRow {
  player: PoolPlayer;
  /** League mode: owning fantasy team name; null when on waivers. Absent in guest mode. */
  owner: string | null;
  /** Completed weeks with a played game. */
  games: number;
  /** Total full-PPR points over completed weeks, 1dp. */
  total: number;
  /** Points per game over completed weeks, 1dp. */
  ppg: number;
  /** Best single completed week. */
  bestWeek: number;
  /** Points in that best week, 1dp. */
  bestWeekPts: number;
}

export interface PositionLeaders {
  position: LeaderPosition;
  rows: LeaderRow[];
  /** Season's biggest single-week explosion at this position. */
  topBoom: { player: PoolPlayer; week: number; pts: number } | null;
}

export interface BuildLeagueLeadersInput {
  pool: DraftPoolFile;
  weekly: WeeklyPprPoints | undefined;
  currentWeek: number;
  /** League mode: pool player id -> owning fantasy team name. Absent in guest mode. */
  ownerByPoolId?: Map<string, string>;
  /** Leaders kept per position after ranking; default 10. */
  perPosition?: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function buildLeagueLeaders({
  pool,
  weekly,
  currentWeek,
  ownerByPoolId,
  perPosition = 10,
}: BuildLeagueLeadersInput): PositionLeaders[] | null {
  if (!weekly || weekly.weeks.length === 0) return null;

  const out: PositionLeaders[] = [];
  let anyRows = false;

  for (const position of LEADER_POSITIONS) {
    const candidates: LeaderRow[] = [];
    let topBoom: PositionLeaders['topBoom'] = null;

    for (const p of pool.players) {
      if (p.pos !== position || !p.sleeperId) continue;
      const byWeek = weekly.pointsBySleeperId[p.sleeperId] ?? {};
      const entries = Object.entries(byWeek)
        .map(([w, pts]) => ({ week: Number(w), pts }))
        .filter(e => Number.isFinite(e.week) && e.week < currentWeek && Number.isFinite(e.pts));
      if (entries.length === 0) continue;
      const gpWeeks = weekly.gamesBySleeperId[p.sleeperId] ?? [];
      const games = gpWeeks.filter(w => w < currentWeek).length || entries.length;
      const total = round1(entries.reduce((s, e) => s + e.pts, 0));
      if (total <= 0) continue;
      const best = entries.reduce((a, b) => (b.pts > a.pts ? b : a));
      if (!topBoom || best.pts > topBoom.pts) {
        topBoom = { player: p, week: best.week, pts: round1(best.pts) };
      }
      candidates.push({
        player: p,
        owner: ownerByPoolId ? (ownerByPoolId.get(p.id) ?? null) : null,
        games,
        total,
        ppg: round1(total / games),
        bestWeek: best.week,
        bestWeekPts: round1(best.pts),
      });
    }

    candidates.sort((a, b) => b.total - a.total || b.ppg - a.ppg);
    if (candidates.length > 0) anyRows = true;
    out.push({ position, rows: candidates.slice(0, perPosition), topBoom });
  }

  return anyRows ? out : null;
}
