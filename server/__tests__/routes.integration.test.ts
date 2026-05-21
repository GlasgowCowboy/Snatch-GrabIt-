import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { type Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { registerRoutes } from '../routes';
import { gameSocket } from '../gameSocket';
import type { Room } from '@shared/rooms';
import type { ServerMessage } from '@shared/wsMessages';

let httpServer: HttpServer;
let baseUrl: string;
let wsUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  httpServer = await registerRoutes(app);
  gameSocket.attach(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}/ws`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    httpServer.close((err) => (err ? reject(err) : resolve())),
  );
});

// --- WS test client (minimal copy of the helper from gameSocket.integration.test.ts) ---

interface TestClient {
  ws: WebSocket;
  next(predicate?: (m: ServerMessage) => boolean): Promise<ServerMessage>;
  close(): Promise<void>;
}

function connectClient(code: string, playerId: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${wsUrl}?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}`,
    );
    const messages: ServerMessage[] = [];
    const waiters: Array<{ pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }> = [];

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      messages.push(msg);
      for (let i = 0; i < waiters.length; i++) {
        if (waiters[i].pred(msg)) {
          waiters.splice(i, 1)[0].resolve(msg);
          break;
        }
      }
    });

    const client: TestClient = {
      ws,
      next(predicate) {
        const pred = predicate ?? (() => true);
        const existing = messages.find(pred);
        if (existing) {
          messages.splice(messages.indexOf(existing), 1);
          return Promise.resolve(existing);
        }
        return new Promise<ServerMessage>((res) => {
          waiters.push({
            pred: (m) => {
              if (!pred(m)) return false;
              messages.splice(messages.indexOf(m), 1);
              return true;
            },
            resolve: res,
          });
        });
      },
      close() {
        return new Promise<void>((res) => {
          if (ws.readyState === WebSocket.CLOSED) return res();
          ws.once('close', () => res());
          ws.close();
        });
      },
    };

    ws.once('open', () => resolve(client));
    ws.once('error', (err) => reject(err));
    ws.once('close', () => resolve(client));
  });
}

// --- REST helpers ---

async function post<T = unknown>(path: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as T) : (undefined as T) };
}

async function get<T = unknown>(path: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${baseUrl}${path}`);
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as T) : (undefined as T) };
}

async function createRoom(playerName = 'Host'): Promise<{ room: Room; playerId: string }> {
  const { status, body } = await post<{ room: Room; playerId: string }>('/api/rooms', {
    playerName,
    scoringMethod: 'fullHand',
    targetScore: 50,
  });
  expect(status).toBe(201);
  return body;
}

describe('REST /api/rooms integration', () => {
  it('POST /api/rooms creates a room and returns playerId', async () => {
    const { room, playerId } = await createRoom('Alice');
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(room.hostId).toBe(playerId);
    expect(room.players).toHaveLength(1);
    expect(room.players[0].name).toBe('Alice');
    expect(room.players[0].isHost).toBe(true);
    expect(room.status).toBe('waiting');
    expect(room.gameDbId).toBeTypeOf('string');
  });

  it('POST /api/rooms rejects a missing playerName with 400', async () => {
    const { status, body } = await post<{ message: string }>('/api/rooms', {
      scoringMethod: 'fullHand',
      targetScore: 50,
    });
    expect(status).toBe(400);
    expect(body.message).toMatch(/invalid/i);
  });

  it('GET /api/rooms/:code returns the room (and 404 for missing)', async () => {
    const { room } = await createRoom();
    const found = await get<Room>(`/api/rooms/${room.code}`);
    expect(found.status).toBe(200);
    expect(found.body.code).toBe(room.code);

    const missing = await get<{ message: string }>('/api/rooms/ZZZZZZ');
    expect(missing.status).toBe(404);
  });

  it('POST /api/rooms/:code/join adds a player and broadcasts the updated room to connected clients', async () => {
    const { room, playerId: hostId } = await createRoom('Host');
    const hostWs = await connectClient(room.code, hostId);
    await hostWs.next((m) => m.type === 'room'); // drain initial

    const joinRes = await post<{ room: Room; playerId: string }>(
      `/api/rooms/${room.code}/join`,
      { playerName: 'Guest' },
    );
    expect(joinRes.status).toBe(200);
    expect(joinRes.body.room.players).toHaveLength(2);

    const broadcast = await hostWs.next((m) => m.type === 'room');
    expect(broadcast.type).toBe('room');
    if (broadcast.type === 'room') {
      expect(broadcast.room.players.map((p) => p.name).sort()).toEqual(['Guest', 'Host']);
    }

    await hostWs.close();
  });

  it('POST /api/rooms/:code/ready toggles ready and broadcasts', async () => {
    const { room, playerId: hostId } = await createRoom();
    const hostWs = await connectClient(room.code, hostId);
    await hostWs.next((m) => m.type === 'room');

    const readyRes = await post<Room>(`/api/rooms/${room.code}/ready`, { playerId: hostId });
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.players[0].isReady).toBe(true);

    const broadcast = await hostWs.next((m) => m.type === 'room');
    if (broadcast.type === 'room') {
      expect(broadcast.room.players[0].isReady).toBe(true);
    }

    // Toggle again → should flip back to false.
    const unreadyRes = await post<Room>(`/api/rooms/${room.code}/ready`, { playerId: hostId });
    expect(unreadyRes.body.players[0].isReady).toBe(false);

    await hostWs.close();
  });

  it('POST /api/rooms/:code/start succeeds when all ready and broadcasts room + state', async () => {
    const { room, playerId: hostId } = await createRoom();
    await post(`/api/rooms/${room.code}/join`, { playerName: 'Guest' });
    const updated = await get<Room>(`/api/rooms/${room.code}`);
    const guestId = updated.body.players.find((p) => !p.isHost)!.id;

    await post(`/api/rooms/${room.code}/ready`, { playerId: hostId });
    await post(`/api/rooms/${room.code}/ready`, { playerId: guestId });

    const hostWs = await connectClient(room.code, hostId);
    await hostWs.next((m) => m.type === 'room');

    const startRes = await post<Room>(`/api/rooms/${room.code}/start`, { playerId: hostId });
    expect(startRes.status).toBe(200);
    expect(startRes.body.status).toBe('playing');
    expect(startRes.body.gameState).toBeDefined();

    // onGameStarted broadcasts room then state to connected clients.
    const roomMsg = await hostWs.next((m) => m.type === 'room');
    const stateMsg = await hostWs.next((m) => m.type === 'state');
    if (roomMsg.type === 'room') expect(roomMsg.room.status).toBe('playing');
    if (stateMsg.type === 'state') expect(stateMsg.state.players).toHaveLength(2);

    await hostWs.close();
  });

  it('POST /api/rooms/:code/start returns 403 when the caller is not the host', async () => {
    const { room, playerId: hostId } = await createRoom();
    const joinRes = await post<{ playerId: string }>(`/api/rooms/${room.code}/join`, {
      playerName: 'Guest',
    });
    const guestId = joinRes.body.playerId;
    await post(`/api/rooms/${room.code}/ready`, { playerId: hostId });
    await post(`/api/rooms/${room.code}/ready`, { playerId: guestId });

    const res = await post<{ message: string }>(`/api/rooms/${room.code}/start`, {
      playerId: guestId,
    });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/host/i);
  });

  it('POST /api/rooms/:code/start returns 400 when not all players are ready', async () => {
    const { room, playerId: hostId } = await createRoom();
    await post(`/api/rooms/${room.code}/join`, { playerName: 'Guest' });
    // Only the host is ready.
    await post(`/api/rooms/${room.code}/ready`, { playerId: hostId });

    const res = await post<{ message: string }>(`/api/rooms/${room.code}/start`, {
      playerId: hostId,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ready/i);
  });

  it('POST /api/rooms/:code/leave removes the player and broadcasts the updated room', async () => {
    const { room, playerId: hostId } = await createRoom();
    const joinRes = await post<{ playerId: string }>(`/api/rooms/${room.code}/join`, {
      playerName: 'Guest',
    });
    const guestId = joinRes.body.playerId;

    const hostWs = await connectClient(room.code, hostId);
    await hostWs.next((m) => m.type === 'room');

    const leaveRes = await post<{ room: Room | null }>(`/api/rooms/${room.code}/leave`, {
      playerId: guestId,
    });
    expect(leaveRes.status).toBe(200);
    expect(leaveRes.body.room?.players).toHaveLength(1);
    expect(leaveRes.body.room?.players[0].id).toBe(hostId);

    const broadcast = await hostWs.next((m) => m.type === 'room');
    if (broadcast.type === 'room') {
      expect(broadcast.room.players).toHaveLength(1);
    }

    await hostWs.close();
  });

  it('POST /api/rooms/:code/leave returns {room: null} when the last player leaves', async () => {
    const { room, playerId: hostId } = await createRoom();
    const res = await post<{ room: Room | null }>(`/api/rooms/${room.code}/leave`, {
      playerId: hostId,
    });
    expect(res.status).toBe(200);
    expect(res.body.room).toBeNull();

    // Room should be gone.
    const after = await get<{ message: string }>(`/api/rooms/${room.code}`);
    expect(after.status).toBe(404);
  });
});
