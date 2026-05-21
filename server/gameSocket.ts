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

class GameSocketServer {
  private wss: WebSocketServer;
  private connectionsByRoom = new Map<string, Set<Conn>>();
  private aiTimersByRoom = new Map<string, NodeJS.Timeout[]>();

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on("connection", (ws, req) => this.onConnection(ws, req));
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

    this.send(ws, { type: "room", room });
    if (room.gameState) {
      this.send(ws, { type: "state", state: room.gameState });
    }

    ws.on("message", (data) => this.onMessage(code, conn, data.toString()));
    ws.on("close", () => {
      set.delete(conn);
      if (set.size === 0) this.connectionsByRoom.delete(code);
    });
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
        this.broadcastState(code);
        if (prevStatus !== "gameOver" && room.gameState.status === "gameOver") {
          const userIdByPlayerId = new Map(
            room.players.map((p) => [p.id, p.userId ?? null]),
          );
          const gameDbId = room.gameDbId;
          const state = room.gameState;
          void finalizeFinishedGame(gameDbId, state, userIdByPlayerId)
            .then(() => settleGameBets(gameDbId))
            .catch((err) => log(`failed to finalize game ${gameDbId}: ${err}`));
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
    const timer = setTimeout(() => this.runAIMove(code, aiPlayerId, difficulty), delay);
    const list = this.aiTimersByRoom.get(code) ?? [];
    list.push(timer);
    this.aiTimersByRoom.set(code, list);
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
    const list = this.aiTimersByRoom.get(code);
    if (!list) return;
    list.forEach(clearTimeout);
    this.aiTimersByRoom.delete(code);
  }

  private broadcastState(code: string) {
    const room = roomManager.getRoom(code);
    if (!room || !room.gameState) return;
    const payload: ServerMessage = { type: "state", state: room.gameState };
    const set = this.connectionsByRoom.get(code);
    if (!set) return;
    set.forEach((conn) => this.send(conn.ws, payload));
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

export const gameSocket = new GameSocketServer();

/**
 * Mark an existing games row finished and write one participant row per player.
 * The games row was already created at lobby creation; we only UPDATE here so
 * the id stays stable for bets, etc.
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
  log(`finalized game ${gameDbId} (${ranked.length} players)`);
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
