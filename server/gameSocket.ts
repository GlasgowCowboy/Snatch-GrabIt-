import type { Server as HttpServer, IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { executeMove, startNewRound } from "@shared/gameEngine";
import { AIPlayer, type AIDifficulty } from "@shared/aiPlayer";
import type { ChatMessage, GameState } from "@shared/schema";
import type { ClientMessage, ServerMessage } from "@shared/wsMessages";
import { determineBetOutcome } from "@shared/betSettlement";
import { roomManager } from "./rooms";
import type { Room } from "@shared/rooms";
import { storage } from "./storage";
import { log } from "./vite";

const WS_PATH = "/ws";

interface Conn {
  ws: WebSocket;
  playerId: string;
}

const AI_DELAY_BY_DIFFICULTY: Record<AIDifficulty, { min: number; max: number }> = {
  easy: { min: 8000, max: 14000 },
  medium: { min: 5000, max: 9000 },
  hard: { min: 3000, max: 6000 },
};

// Extend WebSocket with a liveness flag used by the heartbeat interval.
type LiveWS = WebSocket & { isAlive?: boolean };

class GameSocketServer {
  private wss: WebSocketServer;
  private connectionsByRoom = new Map<string, Set<Conn>>();
  // Each value is a Set of live timer handles so we can cancel them precisely and
  // clear stale handles when a timer fires — preventing the O(N-rounds) timer
  // multiplication that caused the server hang.
  private aiTimersByRoom = new Map<string, Set<NodeJS.Timeout>>();

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on("connection", (ws, req) => this.onConnection(ws, req));

    // Heartbeat: ping every connected socket every 30 s.  Any socket that
    // doesn't reply to a ping within 30 s is terminated and removed so it
    // doesn't linger as a zombie in connectionsByRoom.
    setInterval(() => {
      this.wss.clients.forEach((rawWs) => {
        const ws = rawWs as LiveWS;
        if (ws.isAlive === false) {
          ws.terminate();
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30_000);
  }

  attach(httpServer: HttpServer) {
    httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      try {
        const url = new URL(req.url ?? "", "http://localhost");
        if (url.pathname !== WS_PATH) return; // let Vite HMR + others handle
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.wss.emit("connection", ws, req);
        });
      } catch {
        socket.destroy();
      }
    });
  }

  /** Start AI move scheduling when a game enters 'playing' status. */
  onGameStarted(room: Room) {
    this.clearAITimers(room.code);
    this.broadcastRoom(room.code);
    if (room.gameState) this.broadcastState(room.code);
    if (!room.aiConfig) return;
    const aiPlayers = room.players.filter((p) => p.isAI);
    aiPlayers.forEach((p) => this.scheduleAIMove(room.code, p.id, room.aiConfig!.difficulty));
  }

  /**
   * Called once on server boot for each room restored from the DB. Re-arms AI
   * timers without re-broadcasting (no clients are connected yet) and without
   * the lobby setup work onGameStarted does.
   */
  onRoomRestored(room: Room) {
    if (!room.aiConfig || !room.gameState || room.gameState.status !== 'playing') return;
    const aiPlayers = room.players.filter((p) => p.isAI);
    aiPlayers.forEach((p) => this.scheduleAIMove(room.code, p.id, room.aiConfig!.difficulty));
  }

  /** Broadcast lobby/room state changes to all connected clients in the room. */
  broadcastRoom(code: string) {
    const room = roomManager.getRoom(code);
    if (!room) return;
    const payload: ServerMessage = { type: "room", room };
    const set = this.connectionsByRoom.get(code);
    if (!set) return;
    set.forEach((conn) => this.send(conn.ws, payload));
  }

  /**
   * Apply WS-layer consequences when a player leaves a room: close all of their
   * sockets so they stop receiving updates, then rebroadcast room (and game
   * state, if a game is in progress) to whoever is still connected.
   * Safe to call whether or not the room still exists in the manager.
   */
  onPlayerLeft(code: string, playerId: string) {
    const set = this.connectionsByRoom.get(code);
    if (set) {
      Array.from(set).forEach((conn) => {
        if (conn.playerId === playerId) {
          conn.ws.close();
          set.delete(conn);
        }
      });
      if (set.size === 0) this.connectionsByRoom.delete(code);
    }
    const room = roomManager.getRoom(code);
    if (!room) return;
    this.broadcastRoom(code);
    if (room.gameState) this.broadcastState(code);
  }

  private onConnection(ws: WebSocket, req: IncomingMessage) {
    const url = new URL(req.url ?? "", "http://localhost");
    const code = (url.searchParams.get("code") ?? "").toUpperCase();
    const playerId = url.searchParams.get("playerId") ?? "";

    const room = roomManager.getRoom(code);
    if (!room || !room.players.some((p) => p.id === playerId)) {
      this.send(ws, { type: "closed", reason: "Unknown room or player" });
      ws.close();
      return;
    }

    const conn: Conn = { ws, playerId };
    const set = this.connectionsByRoom.get(code) ?? new Set();
    set.add(conn);
    this.connectionsByRoom.set(code, set);

    // Mark as alive so the heartbeat doesn't immediately kill it.
    (ws as LiveWS).isAlive = true;
    ws.on("pong", () => { (ws as LiveWS).isAlive = true; });

    this.send(ws, { type: "room", room });
    if (room.gameState) {
      this.send(ws, { type: "state", state: room.gameState });
    }
    // Send current presence to the newly-connected client + tell others
    // someone (potentially they) reconnected.
    this.broadcastPresence(code);

    ws.on("message", (data) => this.onMessage(code, conn, data.toString()));
    ws.on("close", () => {
      set.delete(conn);
      if (set.size === 0) this.connectionsByRoom.delete(code);
      // Tell remaining players this connection dropped — they need to see
      // who's no longer at the table.
      this.broadcastPresence(code);
    });
  }

  /**
   * Push the current set of disconnected (human) playerIds to every connected
   * client in the room. A human player is "disconnected" when no live WS in
   * `connectionsByRoom` carries their playerId. AI players are never counted.
   */
  private broadcastPresence(code: string) {
    const room = roomManager.getRoom(code);
    if (!room) return;
    const conns = this.connectionsByRoom.get(code);
    const connectedIds = new Set<string>();
    if (conns) {
      conns.forEach((c) => connectedIds.add(c.playerId));
    }
    const disconnectedPlayerIds = room.players
      .filter((p) => !p.isAI && !connectedIds.has(p.id))
      .map((p) => p.id);
    const payload: ServerMessage = { type: "presence", disconnectedPlayerIds };
    conns?.forEach((conn) => this.send(conn.ws, payload));
  }

  private onMessage(code: string, conn: Conn, raw: string) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      this.send(conn.ws, { type: "error", message: "Malformed message" });
      return;
    }

    const room = roomManager.getRoom(code);
    if (!room || !room.gameState) {
      this.send(conn.ws, { type: "error", message: "Game not in progress" });
      return;
    }

    switch (msg.type) {
      case "move": {
        const prevStatus = room.gameState.status;
        const result = executeMove(room.gameState, conn.playerId, msg.move);
        if (result.error) {
          this.send(conn.ws, { type: "error", message: result.error });
          return;
        }
        room.gameState = result.newState;

        if (prevStatus !== "gameOver" && room.gameState.status === "gameOver") {
          // Build the userId map once — needed both for credit injection and DB writes.
          const userIdByPlayerId = new Map(
            room.players.map((p) => [p.id, p.userId ?? null]),
          );

          // Inject creditsEarned into each RoundResult *before* broadcasting so
          // the Scoreboard can show "you earned X credits" without a round-trip.
          if (room.gameState.roundResults) {
            const sorted = [...room.gameState.roundResults].sort(
              (a, b) => b.totalScore - a.totalScore,
            );
            room.gameState = {
              ...room.gameState,
              roundResults: sorted.map((r, idx) => {
                if (!userIdByPlayerId.get(r.playerId)) return r; // guest / AI
                const placementCredits = PLACEMENT_CREDIT_REWARDS[idx + 1] ?? 0;
                const declaredOutBonus = r.declaredOut ? DECLARE_OUT_CREDIT_BONUS : 0;
                const creditsEarned = placementCredits + declaredOutBonus;
                return creditsEarned > 0 ? { ...r, creditsEarned } : r;
              }),
            };
          }

          this.broadcastState(code);

          const gameDbId = room.gameDbId;
          const state = room.gameState;
          void finalizeFinishedGame(gameDbId, state, userIdByPlayerId)
            .then(() => settleGameBets(gameDbId))
            .catch((err) => log(`failed to finalize game ${gameDbId}: ${err}`));
        } else {
          this.broadcastState(code);
        }
        break;
      }
      case "chat": {
        const player = room.gameState.players.find((p) => p.id === conn.playerId);
        if (!player) return;
        const text = String(msg.message ?? "").slice(0, 500).trim();
        if (!text) return;
        const chatMessage: ChatMessage = {
          id: `msg-${Date.now()}-${randomUUID().slice(0, 6)}`,
          playerId: conn.playerId,
          playerName: player.name,
          message: text,
          timestamp: Date.now(),
        };
        room.gameState = {
          ...room.gameState,
          chatMessages: [...(room.gameState.chatMessages ?? []), chatMessage],
        };
        this.broadcastState(code);
        break;
      }
      case "next-round": {
        if (room.gameState.status === "playing") return;
        if (room.gameState.status === "gameOver") return;
        // IMPORTANT: clear any pending AI timers from the *previous* round before
        // scheduling new ones.  Without this, old timers fire in the new round and
        // reschedule themselves — causing an exponential pile-up of concurrent AI
        // timer chains (one extra chain per round) that is the primary cause of the
        // ~20-minute server hang.
        this.clearAITimers(code);
        room.gameState = startNewRound(room.gameState);
        this.broadcastState(code);
        if (room.aiConfig) {
          room.players
            .filter((p) => p.isAI)
            .forEach((p) => this.scheduleAIMove(code, p.id, room.aiConfig!.difficulty));
        }
        break;
      }
    }
  }

  private scheduleAIMove(code: string, aiPlayerId: string, difficulty: AIDifficulty) {
    const { min, max } = AI_DELAY_BY_DIFFICULTY[difficulty];
    const delay = min + Math.random() * (max - min);
    // Use a placeholder so the closure can reference `timer` after assignment.
    // eslint-disable-next-line prefer-const
    let timer: NodeJS.Timeout;
    timer = setTimeout(() => {
      // Self-remove so the Set doesn't accumulate stale handles over the lifetime
      // of a long game (previously caused unbounded memory growth).
      this.aiTimersByRoom.get(code)?.delete(timer);
      this.runAIMove(code, aiPlayerId, difficulty);
    }, delay);
    const set = this.aiTimersByRoom.get(code) ?? new Set<NodeJS.Timeout>();
    set.add(timer);
    this.aiTimersByRoom.set(code, set);
  }

  private runAIMove(code: string, aiPlayerId: string, difficulty: AIDifficulty) {
    const room = roomManager.getRoom(code);
    if (!room || !room.gameState || room.gameState.status !== "playing") return;

    const ai = new AIPlayer(difficulty);
    const primary = ai.getBestMove(aiPlayerId, room.gameState) ?? { type: "draw-pile" as const };
    let result = executeMove(room.gameState, aiPlayerId, primary);
    // Defensive: if the AI surfaces a move the engine rejects, fall back to a
    // draw-pile turn (universally safe whenever drawPile/currentDraw is non-empty).
    // Without this, runAIMove silently does nothing and the AI appears stuck
    // until the next scheduled turn — a real bug, and the source of integration
    // test flakes that asserted on observable state changes.
    if (result.error && primary.type !== "draw-pile") {
      result = executeMove(room.gameState, aiPlayerId, { type: "draw-pile" });
    }
    if (!result.error) {
      room.gameState = result.newState;
      this.broadcastState(code);
    }

    // Re-schedule only if game is still active
    if (room.gameState.status === "playing") {
      this.scheduleAIMove(code, aiPlayerId, difficulty);
    }
  }

  private clearAITimers(code: string) {
    const set = this.aiTimersByRoom.get(code);
    if (!set) return;
    set.forEach(clearTimeout);
    this.aiTimersByRoom.delete(code);
  }

  private broadcastState(code: string) {
    const room = roomManager.getRoom(code);
    if (!room || !room.gameState) return;
    const payload: ServerMessage = { type: "state", state: room.gameState };
    const set = this.connectionsByRoom.get(code);
    if (set) set.forEach((conn) => this.send(conn.ws, payload));
    // Write-through to the DB so the game survives a crash / redeploy.
    // Debounced inside scheduleLiveStatePersist so a flurry of moves
    // doesn't hammer the DB.
    this.scheduleLiveStatePersist(room.code);
  }

  /** Per-room debounce so we coalesce bursts of moves into one write/sec. */
  private livePersistTimers = new Map<string, NodeJS.Timeout>();
  private static readonly LIVE_PERSIST_DEBOUNCE_MS = 1000;

  private scheduleLiveStatePersist(code: string) {
    if (this.livePersistTimers.has(code)) return; // already scheduled
    const timer = setTimeout(() => {
      this.livePersistTimers.delete(code);
      const room = roomManager.getRoom(code);
      if (!room || !room.gameState) return;
      // Don't bother persisting once the game has finished — finalizeFinishedGame
      // calls clearLiveState itself.
      if (room.gameState.status === 'gameOver') return;
      // Persist the FULL room snapshot (not just gameState) so reboot can
      // restore the code, players, scoring settings, etc. Without code, the
      // WS endpoint has no way to route reconnects.
      const snapshot = {
        code: room.code,
        hostId: room.hostId,
        players: room.players,
        scoringMethod: room.scoringMethod,
        targetScore: room.targetScore,
        aiConfig: room.aiConfig,
        gameDbId: room.gameDbId,
        gameState: room.gameState,
        createdAt: room.createdAt,
      };
      void storage
        .persistLiveState(room.gameDbId, snapshot)
        .catch((err) => log(`persistLiveState failed for ${room.gameDbId}: ${err}`));
    }, GameSocketServer.LIVE_PERSIST_DEBOUNCE_MS);
    this.livePersistTimers.set(code, timer);
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

export const gameSocket = new GameSocketServer();

/**
 * Earnable credits per placement (1-indexed) + a bonus for declaring out. Kept
 * in one place so the curve is easy to tune. AI players don't earn — they have
 * no auth userId to credit.
 */
const PLACEMENT_CREDIT_REWARDS: Record<number, number> = {
  1: 100,
  2: 25,
  3: 10,
};
const DECLARE_OUT_CREDIT_BONUS = 25;

interface CreditGrant {
  userId: string;
  playerName: string;
  amount: number;
  reasons: string[];
}

function computeCreditGrants(
  state: GameState,
  ranked: { id: string; name: string }[],
  userIdByPlayerId: Map<string, string | null>,
): CreditGrant[] {
  const grants: CreditGrant[] = [];
  ranked.forEach((player, idx) => {
    const userId = userIdByPlayerId.get(player.id);
    if (!userId) return; // AI / guest — no credits
    const placement = idx + 1;
    const placementCredits = PLACEMENT_CREDIT_REWARDS[placement] ?? 0;
    const declaredOutBonus = state.declaredOutId === player.id ? DECLARE_OUT_CREDIT_BONUS : 0;
    const amount = placementCredits + declaredOutBonus;
    if (amount <= 0) return;
    const reasons: string[] = [];
    if (placementCredits > 0) reasons.push(`#${placement} (+${placementCredits})`);
    if (declaredOutBonus > 0) reasons.push(`declared out (+${declaredOutBonus})`);
    grants.push({ userId, playerName: player.name, amount, reasons });
  });
  return grants;
}

/**
 * Mark an existing games row finished and write one participant row per player.
 * The games row was already created at lobby creation; we only UPDATE here so
 * the id stays stable for bets, etc. Also grants persistent earned credits to
 * authenticated players based on placement + declare-out.
 */
export async function finalizeFinishedGame(
  gameDbId: string,
  state: GameState,
  userIdByPlayerId: Map<string, string | null> = new Map(),
): Promise<void> {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  await storage.updateGame(gameDbId, {
    winnerId: state.winnerId ? userIdByPlayerId.get(state.winnerId) ?? null : null,
    finishedAt: new Date(),
  });
  // Game is done — drop the live_state blob, it's no longer needed and the
  // finished record now lives in game_participants.
  await storage.clearLiveState(gameDbId).catch(() => {});
  await Promise.all(
    ranked.map((player, idx) =>
      storage.addGameParticipant({
        gameId: gameDbId,
        userId: userIdByPlayerId.get(player.id) ?? null,
        playerName: player.name,
        score: player.score,
        placement: idx + 1,
        declaredOut: state.declaredOutId === player.id,
      }),
    ),
  );

  const grants = computeCreditGrants(state, ranked, userIdByPlayerId);
  await Promise.all(
    grants.map((g) =>
      storage
        .grantCredits(g.userId, g.amount)
        .catch((err) => log(`credit grant failed for ${g.playerName}: ${err}`)),
    ),
  );
  const grantSummary = grants.length
    ? ` · credits: ${grants.map((g) => `${g.playerName} +${g.amount} (${g.reasons.join(', ')})`).join('; ')}`
    : '';
  log(`finalized game ${gameDbId} (${ranked.length} players)${grantSummary}`);
}

/**
 * Resolve every pending bet attached to a finished game: mark won/lost/void and
 * pay out chips. Skips bets that aren't pending so a re-run is idempotent.
 */
export async function settleGameBets(gameDbId: string): Promise<void> {
  const bets = await storage.getGameBets(gameDbId);
  const pending = bets.filter((b) => b.status === 'pending');
  if (pending.length === 0) return;

  const participants = await storage.getGameParticipants(gameDbId);
  let won = 0;
  let lost = 0;
  let voided = 0;
  for (const bet of pending) {
    const outcome = determineBetOutcome(bet, participants);
    await storage.updateBetStatus(bet.id, outcome, bet.payout);
    if (outcome === 'won') won++;
    else if (outcome === 'lost') lost++;
    else voided++;
  }
  log(`settled ${pending.length} bet(s) for game ${gameDbId}: ${won} won, ${lost} lost, ${voided} void`);
}
