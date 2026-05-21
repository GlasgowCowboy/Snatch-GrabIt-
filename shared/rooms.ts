import { z } from "zod";
import type { GameState, ScoringMethod } from "./schema";
import type { AIDifficulty } from "./aiPlayer";

export type RoomStatus = 'waiting' | 'playing' | 'ended';

export interface RoomPlayer {
  id: string;
  name: string;
  isReady: boolean;
  isAI?: boolean;
  isHost: boolean;
  cardBackImage?: string;
  userId?: string | null;
}

export interface AIConfig {
  numAI: number;
  difficulty: AIDifficulty;
}

export interface Room {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  scoringMethod: ScoringMethod;
  targetScore: number;
  aiConfig?: AIConfig;
  status: RoomStatus;
  gameState?: GameState;
  gameDbId: string; // games.id row, created when the room is created
  createdAt: number;
}

export const MAX_PLAYERS_PER_ROOM = 8;

export const createRoomBodySchema = z.object({
  playerName: z.string().min(1).max(50),
  cardBackImage: z.string().optional(),
  scoringMethod: z.enum(['fullHand', 'round']),
  targetScore: z.number().int().positive(),
  aiConfig: z
    .object({
      numAI: z.number().int().min(1).max(7),
      difficulty: z.enum(['easy', 'medium', 'hard']),
    })
    .optional(),
});

export const joinRoomBodySchema = z.object({
  playerName: z.string().min(1).max(50),
  cardBackImage: z.string().optional(),
});

export const readyBodySchema = z.object({
  playerId: z.string().min(1),
});

export const startBodySchema = z.object({
  playerId: z.string().min(1),
});

export const leaveBodySchema = z.object({
  playerId: z.string().min(1),
});

export type CreateRoomBody = z.infer<typeof createRoomBodySchema>;
export type JoinRoomBody = z.infer<typeof joinRoomBodySchema>;

export interface CreateRoomResponse {
  room: Room;
  playerId: string;
}

export interface JoinRoomResponse {
  room: Room;
  playerId: string;
}
