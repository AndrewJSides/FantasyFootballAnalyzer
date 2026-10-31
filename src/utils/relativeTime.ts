// Relative "x ago" labels for timestamps the user didn't generate — news
// headlines, sync times, that kind of thing. Coarse by design: minutes under
// an hour, hours under a day, days beyond that.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Format an ISO timestamp as a relative label ("5m ago"). Falls back to
 *  the raw string when the timestamp is invalid or in the future. */
export function timeAgo(iso: string, nowMs: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diff = nowMs - then;
  if (diff < 0) return iso;
  if (diff < MINUTE_MS) return 'just now';
  if (diff < HOUR_MS) {
    const m = Math.floor(diff / MINUTE_MS);
    return `${m}m ago`;
  }
  if (diff < DAY_MS) {
    const h = Math.floor(diff / HOUR_MS);
    return `${h}h ago`;
  }
  const d = Math.floor(diff / DAY_MS);
  return `${d}d ago`;
}
