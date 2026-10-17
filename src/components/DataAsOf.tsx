// "Data as of …" freshness stamp. The league snapshot comes from the
// TraderApe DB (synced by the owner via /admin), not a live platform pull,
// so league pages show when it was last synced. Renders nothing when the
// league carries no timestamp (live OAuth leagues, guest mode).
export function DataAsOf({ syncedAt }: { syncedAt?: string }) {
  if (!syncedAt) return null;
  const d = new Date(syncedAt);
  if (Number.isNaN(d.getTime())) return null;
  const label = d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <p className="data-as-of">
      <span aria-hidden="true">▌ </span>Data as of {label}
    </p>
  );
}
