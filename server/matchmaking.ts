/**
 * Open matchmaking queue. Authenticated users opt in to be paired with anyone
 * else looking for the same scoring method + target. When the server can
 * find a compatible pair, it spins up a fresh 2-player room and stores the
 * result keyed by both users so each can fetch it on their next /status poll.
 *
 * Why polling instead of WS? The presence heartbeat already runs every 30 s;
 * matchmaking polls every 2 s but only while queued (capped duration). That's
 * a small cost and keeps the server stateless across restarts (anyone queued
 * pre-restart just re-queues — no zombie pairings).
 */
import { randomUUID } from "crypto";
import type { ScoringMethod } from "@shared/schema";
import type { AIConfig } from "@shared/rooms";
import { roomManager } from "./rooms";

interface QueueEntry {
  userId: string;
  username: string;
  scoringMethod: ScoringMethod;
  targetScore: number;
  durationSec?: number;
  joinedAt: number;
}

interface MatchResult {
  roomCode: string;
  playerId: string;
  opponentUsername: string;
  matchedAt: number;
}

const queue = new Map<string, QueueEntry>(); // userId → entry
const results = new Map<string, MatchResult>(); // userId → result (cleared after first read)

/** Drop anyone who's been queued too long without finding a pair. */
const MAX_QUEUE_AGE_MS = 5 * 60 * 1000;

export interface QueueRequest {
  userId: string;
  username: string;
  scoringMethod: ScoringMethod;
  targetScore: number;
  durationSec?: number;
}

export interface QueueStatusBase {
  inQueue: boolean;
}
export interface QueueStatusActive extends QueueStatusBase {
  inQueue: true;
  queuedFor: { method: ScoringMethod; targetScore: number; durationSec?: number };
  waitingMs: number;
  queueDepth: number;
}
export interface QueueStatusMatched extends QueueStatusBase {
  inQueue: false;
  matched: MatchResult;
}
export interface QueueStatusIdle extends QueueStatusBase {
  inQueue: false;
}
export type QueueStatus = QueueStatusActive | QueueStatusMatched | QueueStatusIdle;

export async function joinQueue(req: QueueRequest): Promise<QueueStatus> {
  evictExpired();
  // Replace any existing entry (user changed their settings).
  queue.set(req.userId, {
    userId: req.userId,
    username: req.username,
    scoringMethod: req.scoringMethod,
    targetScore: req.targetScore,
    durationSec: req.durationSec,
    joinedAt: Date.now(),
  });
  // Try to pair immediately so the first poll already returns matched.
  await tryPair();
  return getStatus(req.userId);
}

export function leaveQueue(userId: string): void {
  queue.delete(userId);
  results.delete(userId);
}

/** Idempotent — caller polls this every 2 s and acts on the response. */
export async function getStatus(userId: string): Promise<QueueStatus> {
  evictExpired();

  const result = results.get(userId);
  if (result) {
    // One-shot read — clear so the user doesn't get re-routed if they refresh.
    results.delete(userId);
    return { inQueue: false, matched: result };
  }

  const entry = queue.get(userId);
  if (!entry) return { inQueue: false };

  // Opportunistic pairing on every status call — keeps the queue moving even
  // without a dedicated background tick.
  await tryPair();

  // Re-check after pairing attempt.
  const result2 = results.get(userId);
  if (result2) {
    results.delete(userId);
    return { inQueue: false, matched: result2 };
  }

  const stillQueued = queue.get(userId);
  if (!stillQueued) return { inQueue: false };

  return {
    inQueue: true,
    queuedFor: {
      method: stillQueued.scoringMethod,
      targetScore: stillQueued.targetScore,
      durationSec: stillQueued.durationSec,
    },
    waitingMs: Date.now() - stillQueued.joinedAt,
    queueDepth: queue.size,
  };
}

/** Best-match pairing: same scoring method, same target. FIFO within that bucket. */
async function tryPair(): Promise<void> {
  // Bucket entries by canonical settings key.
  const buckets = new Map<string, QueueEntry[]>();
  queue.forEach((e) => {
    const key = `${e.scoringMethod}|${e.targetScore}|${e.durationSec ?? 0}`;
    const list = buckets.get(key) ?? [];
    list.push(e);
    buckets.set(key, list);
  });

  const lists: QueueEntry[][] = [];
  buckets.forEach((list) => lists.push(list));
  for (const list of lists) {
    // Sort by join time so longest-waiting players go first.
    list.sort((a: QueueEntry, b: QueueEntry) => a.joinedAt - b.joinedAt);
    while (list.length >= 2) {
      const a = list.shift()!;
      const b = list.shift()!;
      queue.delete(a.userId);
      queue.delete(b.userId);
      await spawnMatch(a, b);
    }
  }
}

async function spawnMatch(a: QueueEntry, b: QueueEntry): Promise<void> {
  // a is the "host" — the longer-waiting player. Create the room via the
  // existing flow so all the downstream invariants (games row, etc.) hold.
  const { room, playerId: hostId } = await roomManager.createRoom({
    playerName: a.username,
    scoringMethod: a.scoringMethod,
    targetScore: a.targetScore,
    durationSec: a.durationSec,
    userId: a.userId,
  });
  // Drop b into the same room.
  const { playerId: guestId } = roomManager.joinRoom(room.code, {
    playerName: b.username,
    userId: b.userId,
  });
  const matchedAt = Date.now();
  results.set(a.userId, {
    roomCode: room.code,
    playerId: hostId,
    opponentUsername: b.username,
    matchedAt,
  });
  results.set(b.userId, {
    roomCode: room.code,
    playerId: guestId,
    opponentUsername: a.username,
    matchedAt,
  });
}

function evictExpired(): void {
  const cutoff = Date.now() - MAX_QUEUE_AGE_MS;
  queue.forEach((entry, userId) => {
    if (entry.joinedAt < cutoff) queue.delete(userId);
  });
}

/** Used by tests to start each case from a clean slate. */
export function _resetMatchmaking(): void {
  queue.clear();
  results.clear();
}
