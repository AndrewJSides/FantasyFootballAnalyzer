// Load a league snapshot from the TraderApe database via its share PIN.
// No account needed: possession of the PIN is the auth. The snapshot is the
// normalized League object the owner's browser synced, so it renders through
// the exact same pages as a directly-connected league.

import type { League } from '@/types';

export async function loadLeagueFromPin(rawPin: string): Promise<League> {
  const pin = rawPin.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,10}$/.test(pin)) {
    throw new Error('That PIN doesn\'t look right — check it and try again.');
  }
  const res = await fetch(`/api/league-data?pin=${encodeURIComponent(pin)}`);
  if (res.status === 404) {
    throw new Error('No league found for that PIN.');
  }
  if (!res.ok) {
    throw new Error('Could not load the league. Try again in a bit.');
  }
  const { league, syncedAt } = await res.json();
  if (!league || !league.id) {
    throw new Error('The stored league data looks corrupt. Ask the owner to re-sync.');
  }
  return {
    ...league,
    viaPin: pin,
    isLoaded: true,
    loadedAt: Date.now(),
    // When the owner last synced; surfaces can show "data as of …".
    ...(syncedAt ? { pinSyncedAt: syncedAt } : {}),
  } as League;
}
