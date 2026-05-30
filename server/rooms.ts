import { randomUUID } from "crypto";
import { createInitialGameState } from "@shared/gameEngine";
import {
  MAX_PLAYERS_PER_ROOM,
  type AIConfig,
  type Room,
  type RoomPlayer,
} from "@shared/rooms";
import type { GameState, ScoringMethod } from "@shared/schema";
import { storage } from "./storage";

const AI_NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace'];
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function buildAIPlayers(aiConfig: AIConfig): RoomPlayer[] {
  const aiPlayers: RoomPlayer[] = [];
  for (let i = 0; i < aiConfig.numAI; i++) {
    const name = AI_NAMES[i] ?? `AI ${i + 1}`;
    aiPlayers.push({
      id: `ai-${randomUUID()}`,
      name: `${name} (AI)`,
      isReady: true,
      isAI: true,
      isHost: false,
      cardBackImage: `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`,
    });
  }
  return aiPlayers;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  async createRoom(input: {
    playerName: string;
    cardBackImage?: string;
    scoringMethod: ScoringMethod;
    targetScore: number;
    durationSec?: number;
    aiConfig?: AIConfig;
    userId?: string | null;
  }): Promise<{ room: Room; playerId: string }> {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const hostId = `player-${randomUUID()}`;
    const host: RoomPlayer = {
      id: hostId,
      name: input.playerName,
      isReady: false,
      isHost: true,
      cardBackImage: input.cardBackImage,
      userId: input.userId ?? null,
    };

    const aiPlayers = input.aiConfig ? buildAIPlayers(input.aiConfig) : [];

    // Pre-create the games row so bets placed during the lobby can reference
    // a real games.id (FK constraint on virtual_bets.game_id).
    const dbGame = await storage.createGame({
      scoringMethod: input.scoringMethod,
      targetScore: input.targetScore,
    });

    const room: Room = {
      code,
      hostId,
      players: [host, ...aiPlayers],
      scoringMethod: input.scoringMethod,
      targetScore: input.targetScore,
      durationSec: input.durationSec,
      aiConfig: input.aiConfig,
      status: 'waiting',
      gameDbId: dbGame.id,
      createdAt: Date.now(),
    };

    this.rooms.set(code, room);
    this.evictExpired();
    return { room, playerId: hostId };
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  joinRoom(
    code: string,
    input: { playerName: string; cardBackImage?: string; userId?: string | null },
  ): { room: Room; playerId: string } {
    const room = this.requireRoom(code);
    if (room.status !== 'waiting') {
      throw new RoomError('Room is no longer accepting players', 409);
    }
    if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
      throw new RoomError('Room is full', 409);
    }

    const playerId = `player-${randomUUID()}`;
    room.players.push({
      id: playerId,
      name: input.playerName,
      isReady: false,
      isHost: false,
      cardBackImage: input.cardBackImage,
      userId: input.userId ?? null,
    });

    return { room, playerId };
  }

  toggleReady(code: string, playerId: string): Room {
    const room = this.requireRoom(code);
    const player = this.requirePlayer(room, playerId);
    if (player.isAI) {
      throw new RoomError('AI players are always ready', 400);
    }
    player.isReady = !player.isReady;
    return room;
  }

  async startGame(code: string, playerId: string): Promise<Room> {
    const room = this.requireRoom(code);
    if (room.hostId !== playerId) {
      throw new RoomError('Only the host can start the game', 403);
    }
    if (room.status !== 'waiting') {
      throw new RoomError('Game has already started', 409);
    }
    if (room.players.length < 2) {
      throw new RoomError('Need at least 2 players to start', 400);
    }
    if (!room.players.every(p => p.isReady)) {
      throw new RoomError('All players must be ready', 400);
    }

    room.gameState = createInitialGameState(
      room.players.map(p => ({
        id: p.id,
        name: p.name,
        cardBackImage: p.cardBackImage,
        isAI: p.isAI,
      })),
      { method: room.scoringMethod, targetScore: room.targetScore, durationSec: room.durationSec },
    );
    room.status = 'playing';
    await storage.updateGame(room.gameDbId, { startedAt: new Date() });
    return room;
  }

  leaveRoom(code: string, playerId: string): Room | undefined {
    const room = this.rooms.get(code);
    if (!room) return undefined;

    room.players = room.players.filter(p => p.id !== playerId);
    // Prune the in-flight game state too so the leaver doesn't linger as a
    // zombie slot for remaining players. Their cards are abandoned with them.
    if (room.gameState) {
      room.gameState = {
        ...room.gameState,
        players: room.gameState.players.filter(p => p.id !== playerId),
      };
    }

    // If host left, promote next human player (or close room if none)
    if (room.hostId === playerId) {
      const nextHost = room.players.find(p => !p.isAI);
      if (nextHost) {
        room.hostId = nextHost.id;
        nextHost.isHost = true;
      } else {
        this.rooms.delete(code);
        return undefined;
      }
    }

    if (room.players.length === 0) {
      this.rooms.delete(code);
      return undefined;
    }

    return room;
  }

  private requireRoom(code: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('Room not found', 404);
    return room;
  }

  private requirePlayer(room: Room, playerId: string): RoomPlayer {
    const player = room.players.find(p => p.id === playerId);
    if (!player) throw new RoomError('Player not in room', 404);
    return player;
  }

  private evictExpired(): void {
    const now = Date.now();
    this.rooms.forEach((room, code) => {
      if (now - room.createdAt > ROOM_TTL_MS) {
        this.rooms.delete(code);
      }
    });
  }

  /**
   * Boot-restore: hydrate any in-flight games persisted to the DB back into
   * the in-memory map. Called once on server start. Skips snapshots that
   * fail validation (e.g. older shape than the current code expects).
   *
   * Returns the list of room codes restored — caller uses this to restart
   * AI timers via gameSocket.
   */
  async restoreActiveGames(): Promise<string[]> {
    const snapshots = await storage.listActiveGameStates();
    const restored: string[] = [];
    for (const { liveState, gameId } of snapshots) {
      try {
        const snap = liveState as {
          code?: string;
          hostId?: string;
          players?: RoomPlayer[];
          scoringMethod?: ScoringMethod;
          targetScore?: number;
          aiConfig?: AIConfig;
          gameDbId?: string;
          gameState?: GameState;
          createdAt?: number;
        };
        if (
          !snap?.code ||
          !snap.hostId ||
          !Array.isArray(snap.players) ||
          !snap.scoringMethod ||
          !snap.targetScore ||
          !snap.gameDbId ||
          !snap.gameState
        ) {
          // eslint-disable-next-line no-console
          console.warn(`[restore] skipping malformed snapshot for game ${gameId}`);
          continue;
        }
        // Sanity: the DB id we read from MUST match the one inside the
        // snapshot. If it doesn't, something is very wrong — bail rather
        // than restoring an inconsistent room.
        if (snap.gameDbId !== gameId) continue;
        // Skip if a room with the same code is somehow already in memory
        // (e.g. duplicate restore).
        if (this.rooms.has(snap.code)) continue;
        this.rooms.set(snap.code, {
          code: snap.code,
          hostId: snap.hostId,
          players: snap.players,
          scoringMethod: snap.scoringMethod,
          targetScore: snap.targetScore,
          aiConfig: snap.aiConfig,
          status: 'playing',
          gameDbId: snap.gameDbId,
          gameState: snap.gameState,
          createdAt: snap.createdAt ?? Date.now(),
        });
        restored.push(snap.code);
      } catch {
        // Skip and keep going — never let a single bad row break the boot.
      }
    }
    return restored;
  }
}

export class RoomError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

export const roomManager = new RoomManager();
