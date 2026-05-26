import type { GameState } from "./schema";
import type { GameMove } from "./gameEngine";
import type { Room } from "./rooms";

export type ClientMessage =
  | { type: 'move'; move: GameMove }
  | { type: 'chat'; message: string }
  | { type: 'next-round' };

export type ServerMessage =
  | { type: 'room'; room: Room }
  | { type: 'state'; state: GameState }
  | { type: 'error'; message: string }
  | { type: 'closed'; reason: string }
  // Per-room presence: the set of playerIds (excluding AI) with no live WS
  // right now. Pushed whenever connections change. Clients use this to render
  // a "disconnected" badge on affected players.
  | { type: 'presence'; disconnectedPlayerIds: string[] };
