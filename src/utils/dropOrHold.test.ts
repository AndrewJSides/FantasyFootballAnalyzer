// Drop-or-hold verdicts: an Out low-value player is safe to drop, a buried
// below-replacement bench piece is droppable with regret, starters and
// handcuffs hold.
import { describe, expect, it } from 'vitest';
import type { League, RosterSlots, Team } from '@/types';
import type { DraftPoolFile, PoolPlayer } from '@/types/draft';
import { DEFAULT_MANUAL_SHAPE } from './tradeAnalysis';
import { dropOrHoldVerdicts, MAX_DROP_ROWS } from './dropOrHold';

const SLOTS: RosterSlots = { ...DEFAULT_MANUAL_SHAPE };

function poolPlayer(
  id: string,
  pos: string,
  proj: number,
  extra: Partial<PoolPlayer> = {},
): PoolPlayer {
  return {
    id,
    name: id,
    pos,
    team: 'FA',
    projPts: proj,
    projPtsPpr: proj,
    projPtsStd: proj,
    ...extra,
  } as PoolPlayer;
}

// 10-team league: RB/WR replacement rank is 30, so 30 fillers at 200 pin the
// replacement level at 200 and every test player below it has VOR 0.
function makePool(): DraftPoolFile {
  const players: PoolPlayer[] = [
    poolPlayer('stud-rb', 'RB', 400),
    poolPlayer('mid-rb', 'RB', 260),
    poolPlayer('cuff-rb', 'RB', 110, { depthChartOrder: 2 }),
    poolPlayer('washed-rb', 'RB', 100),
    poolPlayer('buried-rb', 'RB', 90),
    poolPlayer('out-wr', 'WR', 60, {
      injuryStatus: 'O',
      injuryBodyPart: 'Knee',
    }),
    ...Array.from({ length: 30 }, (_, i) => poolPlayer(`rbf${i}`, 'RB', 200)),
    ...Array.from({ length: 30 }, (_, i) => poolPlayer(`wrf${i}`, 'WR', 200)),
  ];
  return { players } as DraftPoolFile;
}

function rosterPlayer(id: string, pos: string) {
  return { id, platformId: id, name: id, position: pos, team: 'FA' };
}

function leagueWith(team: Team): League {
  return {
    id: 'test',
    name: 'Test League',
    platform: 'sleeper',
    totalTeams: 10,
    rosterSlots: SLOTS,
    scoringType: 'ppr',
    teams: [team],
  } as League;
}

function myTeam(): Team {
  return {
    id: 'me',
    name: 'me',
    isMyTeam: true,
    roster: [
      rosterPlayer('stud-rb', 'RB'),
      rosterPlayer('mid-rb', 'RB'),
      rosterPlayer('cuff-rb', 'RB'),
      rosterPlayer('washed-rb', 'RB'),
      rosterPlayer('buried-rb', 'RB'),
      rosterPlayer('out-wr', 'WR'),
    ],
  } as Team;
}

describe('dropOrHoldVerdicts', () => {
  it('grades an Out below-replacement player as safe to drop, first', () => {
    const pool = makePool();
    const team = myTeam();
    const rows = dropOrHoldVerdicts(leagueWith(team), team, pool);
    expect(rows[0].player.id).toBe('out-wr');
    expect(rows[0].verdict).toBe('drop');
    expect(rows[0].reasons.join(' ')).toMatch(/out/i);
    expect(rows[0].reasons.join(' ')).toMatch(/Knee/);
  });

  it('grades a buried below-replacement bench piece as droppable with regret', () => {
    const pool = makePool();
    const team = myTeam();
    const rows = dropOrHoldVerdicts(leagueWith(team), team, pool);
    const buried = rows.find(r => r.player.id === 'buried-rb');
    expect(buried?.verdict).toBe('regret');
    expect(buried?.reasons.join(' ')).toMatch(/buried/i);
  });

  it('holds the starters and the handcuff', () => {
    const pool = makePool();
    const team = myTeam();
    const rows = dropOrHoldVerdicts(leagueWith(team), team, pool);
    const byId = new Map(rows.map(r => [r.player.id, r]));
    expect(byId.get('stud-rb')?.verdict).toBe('hold');
    expect(byId.get('mid-rb')?.verdict).toBe('hold');
    const cuff = byId.get('cuff-rb');
    expect(cuff?.verdict).toBe('hold');
    expect(cuff?.reasons.join(' ')).toMatch(/handcuff/i);
  });

  it('skips roster players that do not resolve to the pool', () => {
    const pool = makePool();
    const team = myTeam();
    team.roster = [
      ...team.roster!,
      { id: 'ghost', platformId: 'ghost', name: '', position: '', team: '' },
    ];
    const rows = dropOrHoldVerdicts(leagueWith(team), team, pool);
    expect(rows.every(r => r.player.id !== 'ghost')).toBe(true);
  });

  it('caps the table at MAX_DROP_ROWS', () => {
    const pool = makePool();
    const team = myTeam();
    const pool2: DraftPoolFile = {
      players: [
        ...pool.players,
        ...Array.from({ length: 8 }, (_, i) =>
          poolPlayer(`extra${i}`, 'RB', 80 + i),
        ),
      ],
    } as DraftPoolFile;
    team.roster = [
      ...team.roster!,
      ...Array.from({ length: 8 }, (_, i) => rosterPlayer(`extra${i}`, 'RB')),
    ];
    const rows = dropOrHoldVerdicts(leagueWith(team), team, pool2);
    expect(rows.length).toBe(MAX_DROP_ROWS);
  });
});
