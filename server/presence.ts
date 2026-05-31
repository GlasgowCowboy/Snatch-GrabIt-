/**
 * Lightweight presence tracking.
 *
 * Clients ping `POST /api/presence/heartbeat` every 30 s while their tab is
 * focused. The server records the timestamp keyed by userId. A user is
 * "online" if their last heartbeat is within PRESENCE_TIMEOUT_MS.
 *
 * In-memory deliberately: presence is ephemeral and a server restart should
 * just rebuild it as clients ping in. Per-user precision is good enough
 * — we don't need per-device.
 *
 * Why not WebSocket presence? The existing gameSocket only catches users
 * who are in a room. We want to know if Alice is on the dashboard too.
 * A 30-s heartbeat is cheap (1 request per minute per active user) and
 * adds no new infra.
 */

const PRESENCE_TIMEOUT_MS = 90 * 1000; // 30 s heartbeat × 3 — tolerant of one drop
const lastSeenByUserId = new Map<string, number>();

export function recordHeartbeat(userId: string): void {
  lastSeenByUserId.set(userId, Date.now());
}

export function isOnline(userId: string): boolean {
  const ts = lastSeenByUserId.get(userId);
  if (!ts) return false;
  return Date.now() - ts < PRESENCE_TIMEOUT_MS;
}

/** Returns the subset of `userIds` that are currently online. */
export function filterOnline(userIds: string[]): string[] {
  return userIds.filter(isOnline);
}

/** Used by tests to start each case from a clean slate. */
export function _resetPresence(): void {
  lastSeenByUserId.clear();
}
