// Snapshots the trade value chart so value-change deltas can be shown on the
// Trade Value Chart page (backlog item 26, remainder). The chart itself is
// priced live from the bundled pool's projected season points; without a
// stored baseline there is nothing to diff against — the same lesson as the
// projection snapshots, which must be taken before kickoff because neither
// Yahoo nor Sleeper serves past weeks' projections after the fact.
//
// The snapshot prices every chart player on the standard 10-team full-PPR
// shape (valueLeagueFor(null)), so deltas are apples-to-apples week to week
// even when the viewer's own league has a different shape. Players off the
// chart (zero/negative VOR, K, DST) are simply absent from the values map.
//
// Usage: `npm run snapshot:trade-values` — idempotent per calendar date, so
// the loop can run this as a duty. `--season=` override (default 2026);
// `--date=YYYY-MM-DD` override (default today); `--force` overwrites today's
// entry.
//
// Output: src/data/tradeValueSnapshots.<season>.json —
// { snapshots: [{ date, values: { <poolId>: <value 0-100, 1 decimal> } }] }

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTradeValueChart, type TradeValueSnapshot } from '../src/utils/tradeValues';
import { valueLeagueFor } from '../src/utils/tradeAnalysis';
import type { DraftPoolFile } from '../src/types/draft';

const OUT_DIR = join('src', 'data');

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit?.split('=')[1];
}

async function main(): Promise<void> {
  const season = Number(arg('season') ?? 2026);
  const date = arg('date') ?? new Date().toISOString().slice(0, 10);
  const force = process.argv.includes('--force');

  const poolPath = join(OUT_DIR, `draftPool.${season}.json`);
  if (!existsSync(poolPath)) throw new Error(`Pool file not found: ${poolPath}`);
  const pool = JSON.parse(readFileSync(poolPath, 'utf8')) as DraftPoolFile;

  const outPath = join(OUT_DIR, `tradeValueSnapshots.${season}.json`);
  let snapshots: TradeValueSnapshot[] = [];
  if (existsSync(outPath)) {
    const parsed = JSON.parse(readFileSync(outPath, 'utf8')) as {
      snapshots?: TradeValueSnapshot[];
    };
    snapshots = parsed.snapshots ?? [];
  }
  if (snapshots.some(s => s.date === date) && !force) {
    console.log(`Snapshot already exists for ${date}: ${outPath} (use --force to overwrite)`);
    return;
  }

  const rows = buildTradeValueChart(pool.players, { league: valueLeagueFor(null) });
  const values: Record<string, number> = {};
  for (const row of rows) values[row.player.id] = row.value;

  snapshots = [...snapshots.filter(s => s.date !== date), { date, values }].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(outPath, `${JSON.stringify({ snapshots }, null, 2)}\n`);
  console.log(`Wrote ${outPath}: ${date}, ${rows.length} players`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
