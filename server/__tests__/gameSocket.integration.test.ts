import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { gameSocket } from '../gameSocket';
import { roomManager } from '../rooms';
import { storage } from '../storage';
import { MemoryStorage } from '../storage-memory';
import type { Room } from '@shared/rooms';
import type { ClientMessage, ServerMessage } from '@shared/wsMessages';

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

let httpServer: HttpServer;
let port: number;

beforeAll(async () => {
  httpServer = createServer();
  gameSocket.attach(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    httpServer.close((err) => (err ? reject(err) : resolve())),
  );
});

interface TestClient {
  ws: WebSocket;
  messages: ServerMessage[];
  /** Resolves with the next message that matches the predicate (or any message). */
  next(predicate?: (m: ServerMessage) => boolean): Promise<ServerMessage>;
  send(msg: ClientMessage | string): void;
  close(): Promise<void>;
}

function connectClient(code: string, playerId: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/ws?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}`,
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
      messages,
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
      send(msg) {
        ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
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
    // 'closed' message arrives before close for rejection cases; resolve anyway so test can read it.
    ws.once('close', () => resolve(client));
  });
}

async function createTwoPlayerRoom(): Promise<{ room: Room; hostId: string; guestId: string }> {
  const { room, playerId: hostId } = await roomManager.createRoom({
    playerName: 'Host',
    scoringMethod: 'fullHand',
    targetScore: 50,
  });
  const { playerId: guestId } = roomManager.joinRoom(room.code, { playerName: 'Guest' });
  return { room, hostId, guestId };
}

async function startGame(code: string, hostId: string, guestId: string): Promise<Room> {
  roomManager.toggleReady(code, hostId);
  roomManager.toggleReady(code, guestId);
  const room = await roomManager.startGame(code, hostId);
  gameSocket.onGameStarted(room);
  return room;
}

describe('gameSocket integration', () => {
  it('rejects connections for unknown rooms with a closed message', async () => {
    const client = await connectClient('NOPE-NO-ROOM', 'player-bogus');
    const msg = await client.next();
    expect(msg.type).toBe('closed');
    if (msg.type === 'closed') {
      expect(msg.reason).toMatch(/unknown room/i);
    }
    await client.close();
  });

  it('rejects unknown players in a valid room', async () => {
    const { room } = await createTwoPlayerRoom();
    const client = await connectClient(room.code, 'player-not-in-room');
    const msg = await client.next();
    expect(msg.type).toBe('closed');
    await client.close();
  });

  it('sends initial room state on a valid connection (no game yet)', async () => {
    const { room, hostId } = await createTwoPlayerRoom();
    const client = await connectClient(room.code, hostId);
    const msg = await client.next();
    expect(msg.type).toBe('room');
    if (msg.type === 'room') {
      expect(msg.room.code).toBe(room.code);
      expect(msg.room.players.some((p) => p.id === hostId)).toBe(true);
    }
    await client.close();
  });

  it('broadcasts state to all connected clients when a player makes a move', async () => {
    const { room, hostId, guestId } = await createTwoPlayerRoom();
    await startGame(room.code, hostId, guestId);

    const hostClient = await connectClient(room.code, hostId);
    const guestClient = await connectClient(room.code, guestId);

    // Drain initial room + state messages on both clients
    await hostClient.next((m) => m.type === 'state');
    await guestClient.next((m) => m.type === 'state');

    // draw-pile is universally valid when drawPile or currentDraw is non-empty (fresh state)
    hostClient.send({ type: 'move', move: { type: 'draw-pile' } });

    const hostState = await hostClient.next((m) => m.type === 'state');
    const guestState = await guestClient.next((m) => m.type === 'state');

    expect(hostState.type).toBe('state');
    expect(guestState.type).toBe('state');
    if (hostState.type === 'state' && guestState.type === 'state') {
      const hostPlayer = hostState.state.players.find((p) => p.id === hostId)!;
      const guestPlayerView = guestState.state.players.find((p) => p.id === hostId)!;
      // Both peers should see the host's currentDraw populated after a draw
      expect(hostPlayer.currentDraw.length).toBeGreaterThan(0);
      expect(guestPlayerView.currentDraw.length).toBe(hostPlayer.currentDraw.length);
    }

    await hostClient.close();
    await guestClient.close();
  });

  it('replies with error to the sender on invalid moves and does not broadcast', async () => {
    const { room, hostId, guestId } = await createTwoPlayerRoom();
    await startGame(room.code, hostId, guestId);

    const hostClient = await connectClient(room.code, hostId);
    const guestClient = await connectClient(room.code, guestId);

    await hostClient.next((m) => m.type === 'state');
    await guestClient.next((m) => m.type === 'state');

    // bone-to-foundation with foundationIndex=-1 requires an Ace on top of the bone pile.
    // The shuffled bone pile is statistically very unlikely to have an Ace on top, but to
    // make the test deterministic we use an obviously-invalid foundationIndex.
    hostClient.send({ type: 'move', move: { type: 'bone-to-foundation', foundationIndex: 99 } });

    const err = await hostClient.next((m) => m.type === 'error');
    expect(err.type).toBe('error');

    // Guest must not receive a state message as a consequence of the failed move.
    const guestSawState = await Promise.race([
      guestClient.next((m) => m.type === 'state').then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    expect(guestSawState).toBe(false);

    await hostClient.close();
    await guestClient.close();
  });

  it('replies with error on malformed JSON', async () => {
    const { room, hostId, guestId } = await createTwoPlayerRoom();
    await startGame(room.code, hostId, guestId);

    const hostClient = await connectClient(room.code, hostId);
    await hostClient.next((m) => m.type === 'state');

    hostClient.send('not-json-at-all');
    const err = await hostClient.next((m) => m.type === 'error');
    expect(err.type).toBe('error');
    if (err.type === 'error') {
      expect(err.message).toMatch(/malformed/i);
    }

    await hostClient.close();
  });

  it('propagates chat messages to all clients via state broadcast', async () => {
    const { room, hostId, guestId } = await createTwoPlayerRoom();
    await startGame(room.code, hostId, guestId);

    const hostClient = await connectClient(room.code, hostId);
    const guestClient = await connectClient(room.code, guestId);

    await hostClient.next((m) => m.type === 'state');
    await guestClient.next((m) => m.type === 'state');

    hostClient.send({ type: 'chat', message: 'hello world' });

    const guestState = await guestClient.next(
      (m) => m.type === 'state' && (m.state.chatMessages ?? []).some((c) => c.message === 'hello world'),
    );
    expect(guestState.type).toBe('state');
    if (guestState.type === 'state') {
      const chat = guestState.state.chatMessages!.find((c) => c.message === 'hello world')!;
      expect(chat.playerId).toBe(hostId);
      expect(chat.playerName).toBe('Host');
    }

    await hostClient.close();
    await guestClient.close();
  });

  it('completes a round-end → next-round cycle', async () => {
    const { room, hostId, guestId } = await createTwoPlayerRoom();
    const started = await startGame(room.code, hostId, guestId);
    // Target high enough that a +5 declare-out bonus does not end the game.
    started.gameState!.scoringSettings.targetScore = 1000;
    // Empty bone pile so declare-out is valid.
    started.gameState!.players.find((p) => p.id === hostId)!.bonePile = [];

    const hostClient = await connectClient(room.code, hostId);
    const guestClient = await connectClient(room.code, guestId);
    await hostClient.next((m) => m.type === 'state');
    await guestClient.next((m) => m.type === 'state');

    hostClient.send({ type: 'move', move: { type: 'declare-out' } });
    const roundEnded = await guestClient.next(
      (m) => m.type === 'state' && m.state.status === 'roundEnded',
    );
    expect(roundEnded.type).toBe('state');

    hostClient.send({ type: 'next-round' });
    const restarted = await guestClient.next(
      (m) => m.type === 'state' && m.state.status === 'playing',
    );
    expect(restarted.type).toBe('state');
    if (restarted.type === 'state') {
      // Fresh deal: each player should have a full bone pile again, and round scores reset.
      restarted.state.players.forEach((p) => {
        expect(p.bonePile.length).toBe(13);
        expect(p.tableau.flat().length).toBe(4);
      });
    }

    await hostClient.close();
    await guestClient.close();
  });

  it('finalizes the games row and settles bets when a game ends via WS', async () => {
    if (!(storage instanceof MemoryStorage)) {
      throw new Error('Test requires MemoryStorage; do not set DATABASE_URL when running tests');
    }

    const { room, hostId, guestId } = await createTwoPlayerRoom();
    const gameDbId = room.gameDbId;

    // A bettor (with a profile + chip balance) wagering that "Host" wins.
    const bettor = await storage.createUser(
      { username: `bettor-${Date.now()}`, password: 'x', email: null },
      'Bettor',
    );
    const winnerBet = await storage.placeBet({
      gameId: gameDbId,
      bettorUserId: bettor.id,
      bettorName: 'Bettor',
      betType: 'winner',
      targetUserId: null,
      targetPlayerName: 'Host',
      chipAmount: 10,
      payout: 20,
      status: 'pending',
    });
    const loserBet = await storage.placeBet({
      gameId: gameDbId,
      bettorUserId: bettor.id,
      bettorName: 'Bettor',
      betType: 'winner',
      targetUserId: null,
      targetPlayerName: 'Guest',
      chipAmount: 5,
      payout: 10,
      status: 'pending',
    });

    const started = await startGame(room.code, hostId, guestId);
    // Target low enough that declare-out's +5 bonus tips Host over the line.
    started.gameState!.scoringSettings.targetScore = 5;
    started.gameState!.players.find((p) => p.id === hostId)!.bonePile = [];

    const hostClient = await connectClient(room.code, hostId);
    await hostClient.next((m) => m.type === 'state');

    hostClient.send({ type: 'move', move: { type: 'declare-out' } });
    const gameOver = await hostClient.next(
      (m) => m.type === 'state' && m.state.status === 'gameOver',
    );
    expect(gameOver.type).toBe('state');
    if (gameOver.type === 'state') {
      expect(gameOver.state.winnerId).toBe(hostId);
    }

    // Finalize + settle run fire-and-forget after the state broadcast — poll until visible.
    await waitFor(async () => {
      const game = (storage as MemoryStorage)['gamesList'].get(gameDbId);
      const bets = await storage.getGameBets(gameDbId);
      return Boolean(game?.finishedAt) && bets.every((b) => b.status !== 'pending');
    });

    const finalized = (storage as MemoryStorage)['gamesList'].get(gameDbId)!;
    expect(finalized.finishedAt).toBeInstanceOf(Date);

    const finalBets = await storage.getGameBets(gameDbId);
    const settledWinner = finalBets.find((b) => b.id === winnerBet.id)!;
    const settledLoser = finalBets.find((b) => b.id === loserBet.id)!;
    expect(settledWinner.status).toBe('won');
    expect(settledLoser.status).toBe('lost');

    const participants = (storage as MemoryStorage)['participants'].filter(
      (p) => p.gameId === gameDbId,
    );
    expect(participants).toHaveLength(2);
    const host = participants.find((p) => p.playerName === 'Host')!;
    expect(host.placement).toBe(1);
    expect(host.declaredOut).toBe(true);

    await hostClient.close();
  });

  it('broadcasts room + state to clients connected during the lobby when the host starts', async () => {
    const { room, hostId, guestId } = await createTwoPlayerRoom();

    // Both players have a socket open *before* startGame runs (typical lobby UX).
    const hostClient = await connectClient(room.code, hostId);
    const guestClient = await connectClient(room.code, guestId);
    // Drain initial room snapshots; there is no game state yet.
    await hostClient.next((m) => m.type === 'room');
    await guestClient.next((m) => m.type === 'room');

    // Mirror the routes.ts /start flow exactly: toggleReady, startGame, onGameStarted.
    roomManager.toggleReady(room.code, hostId);
    roomManager.toggleReady(room.code, guestId);
    const started = await roomManager.startGame(room.code, hostId);
    gameSocket.onGameStarted(started);

    // Both clients should receive a room update (status: 'playing') and the initial state.
    const hostRoom = await hostClient.next((m) => m.type === 'room' && m.room.status === 'playing');
    const guestRoom = await guestClient.next((m) => m.type === 'room' && m.room.status === 'playing');
    expect(hostRoom.type).toBe('room');
    expect(guestRoom.type).toBe('room');

    const hostState = await hostClient.next((m) => m.type === 'state');
    const guestState = await guestClient.next((m) => m.type === 'state');
    if (hostState.type !== 'state' || guestState.type !== 'state') throw new Error('expected state');
    // Initial deal is symmetric: every player gets 13-card bone pile and 4-column tableau.
    [hostState.state, guestState.state].forEach((s) => {
      s.players.forEach((p) => {
        expect(p.bonePile.length).toBe(13);
        expect(p.tableau.flat().length).toBe(4);
      });
    });

    await hostClient.close();
    await guestClient.close();
  });

  it('delivers broadcasts to every socket when a player has multiple connections open', async () => {
    const { room, hostId, guestId } = await createTwoPlayerRoom();
    await startGame(room.code, hostId, guestId);

    // Host with two concurrent sockets — e.g. two browser tabs, or a stale socket
    // that never received its 'close' before the client reconnected.
    const hostSocketA = await connectClient(room.code, hostId);
    const hostSocketB = await connectClient(room.code, hostId);
    const guestClient = await connectClient(room.code, guestId);

    await hostSocketA.next((m) => m.type === 'state');
    await hostSocketB.next((m) => m.type === 'state');
    await guestClient.next((m) => m.type === 'state');

    // Guest's move triggers a broadcast; both of host's sockets must receive it.
    guestClient.send({ type: 'move', move: { type: 'draw-pile' } });

    const stateA = await hostSocketA.next((m) => m.type === 'state');
    const stateB = await hostSocketB.next((m) => m.type === 'state');
    expect(stateA.type).toBe('state');
    expect(stateB.type).toBe('state');
    if (stateA.type === 'state' && stateB.type === 'state') {
      // Both sockets should see the same authoritative state.
      const guestDrawA = stateA.state.players.find((p) => p.id === guestId)!.currentDraw.length;
      const guestDrawB = stateB.state.players.find((p) => p.id === guestId)!.currentDraw.length;
      expect(guestDrawA).toBe(guestDrawB);
      expect(guestDrawA).toBeGreaterThan(0);
    }

    await hostSocketA.close();
    await hostSocketB.close();
    await guestClient.close();
  });

  // Pins down the contract when a player leaves mid-game. leaveRoom prunes both
  // room.players AND room.gameState.players; onPlayerLeft closes the leaver's WS
  // and rebroadcasts room + state to whoever is still connected. The leaver
  // stops receiving any further updates.
  it('after a player leaves mid-game: room + game state both shrink, leaver socket closes', async () => {
    const { room, hostId, guestId } = await createTwoPlayerRoom();
    await startGame(room.code, hostId, guestId);

    const hostClient = await connectClient(room.code, hostId);
    const guestClient = await connectClient(room.code, guestId);
    await hostClient.next((m) => m.type === 'state');
    await guestClient.next((m) => m.type === 'state');

    // Mirror POST /api/rooms/:code/leave exactly: leaveRoom() + onPlayerLeft().
    const remainingRoom = roomManager.leaveRoom(room.code, guestId);
    gameSocket.onPlayerLeft(room.code, guestId);

    expect(remainingRoom).toBeDefined();
    expect(remainingRoom!.players.map((p) => p.id)).toEqual([hostId]);
    // gameState.players is pruned too — no zombie slot for remaining players.
    expect(remainingRoom!.gameState!.players.map((p) => p.id)).toEqual([hostId]);

    // Host receives the shrunken room AND a state broadcast reflecting the prune.
    const hostRoomAfterLeave = await hostClient.next(
      (m) => m.type === 'room' && m.room.players.length === 1,
    );
    expect(hostRoomAfterLeave.type).toBe('room');
    const hostStateAfterLeave = await hostClient.next(
      (m) => m.type === 'state' && m.state.players.length === 1,
    );
    expect(hostStateAfterLeave.type).toBe('state');
    if (hostStateAfterLeave.type === 'state') {
      expect(hostStateAfterLeave.state.players.map((p) => p.id)).toEqual([hostId]);
    }

    // The leaver's WebSocket is closed by the server. Wait for the close event
    // since ws.close() is asynchronous.
    if (guestClient.ws.readyState !== WebSocket.CLOSED) {
      await new Promise<void>((resolve) =>
        guestClient.ws.once('close', () => resolve()),
      );
    }
    expect(guestClient.ws.readyState).toBe(WebSocket.CLOSED);

    // Subsequent state broadcasts (from host's move) reach host but not the
    // leaver — their conn was removed from connectionsByRoom.
    const guestMessagesBefore = guestClient.messages.length;
    hostClient.send({ type: 'move', move: { type: 'draw-pile' } });
    await hostClient.next((m) => m.type === 'state');
    // Give any stray broadcast a moment to arrive (it shouldn't).
    await new Promise((r) => setTimeout(r, 50));
    expect(guestClient.messages.length).toBe(guestMessagesBefore);

    await hostClient.close();
  });

  it('schedules AI moves and broadcasts state when the timer fires', async () => {
    // Fake setTimeout/clearTimeout only — leave Date, microtasks, and socket I/O alone
    // so that real WS messaging still works while we control the AI delay clock.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { room, playerId: hostId } = await roomManager.createRoom({
        playerName: 'Human',
        scoringMethod: 'fullHand',
        targetScore: 50,
        aiConfig: { numAI: 1, difficulty: 'hard' },
      });
      roomManager.toggleReady(room.code, hostId);
      const started = await roomManager.startGame(room.code, hostId);
      gameSocket.onGameStarted(started);

      const client = await connectClient(room.code, hostId);
      await client.next((m) => m.type === 'room');
      const initial = await client.next((m) => m.type === 'state');
      if (initial.type !== 'state') throw new Error('expected initial state');
      const aiPlayer = initial.state.players.find((p) => p.id !== hostId)!;
      const aiId = aiPlayer.id;

      // Hard difficulty AI delay is 3000–6000ms; advance past the max to guarantee firing.
      vi.advanceTimersByTime(6500);

      const aiBroadcast = await client.next((m) => m.type === 'state');
      expect(aiBroadcast.type).toBe('state');
      if (aiBroadcast.type === 'state') {
        // Any successful AI move must visibly mutate the AI player's view. We compare
        // serialized state because some moves (e.g. tableau-to-tableau) preserve total
        // card counts but rearrange columns — a length-only diff would miss them.
        const aiAfter = aiBroadcast.state.players.find((p) => p.id === aiId)!;
        expect(JSON.stringify(aiAfter)).not.toBe(JSON.stringify(aiPlayer));
      }

      await client.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends the current (post-move) game state to a late-connecting client', async () => {
    const { room, hostId, guestId } = await createTwoPlayerRoom();
    await startGame(room.code, hostId, guestId);

    const hostClient = await connectClient(room.code, hostId);
    await hostClient.next((m) => m.type === 'state');

    // Host makes a move; only host is connected so far.
    hostClient.send({ type: 'move', move: { type: 'draw-pile' } });
    const hostState = await hostClient.next((m) => m.type === 'state');
    if (hostState.type !== 'state') throw new Error('expected state');
    const hostCurrentDrawAfter = hostState.state.players.find((p) => p.id === hostId)!.currentDraw.length;
    expect(hostCurrentDrawAfter).toBeGreaterThan(0);

    // Guest connects AFTER the move. They should immediately receive a 'state' reflecting it.
    const guestClient = await connectClient(room.code, guestId);
    await guestClient.next((m) => m.type === 'room');
    const guestState = await guestClient.next((m) => m.type === 'state');
    expect(guestState.type).toBe('state');
    if (guestState.type === 'state') {
      const guestViewOfHost = guestState.state.players.find((p) => p.id === hostId)!;
      expect(guestViewOfHost.currentDraw.length).toBe(hostCurrentDrawAfter);
    }

    await hostClient.close();
    await guestClient.close();
  });

  it('resumes broadcasts after a client reconnects with the same playerId', async () => {
    const { room, hostId, guestId } = await createTwoPlayerRoom();
    await startGame(room.code, hostId, guestId);

    const hostClient = await connectClient(room.code, hostId);
    const guestClient = await connectClient(room.code, guestId);
    await hostClient.next((m) => m.type === 'state');
    await guestClient.next((m) => m.type === 'state');

    // Host simulates a network blip.
    await hostClient.close();

    // While host is offline, guest makes a move. No broadcast should reach the old socket.
    guestClient.send({ type: 'move', move: { type: 'draw-pile' } });
    const guestStateAfterMove = await guestClient.next((m) => m.type === 'state');
    if (guestStateAfterMove.type !== 'state') throw new Error('expected state');
    const guestCurrentDraw = guestStateAfterMove.state.players.find((p) => p.id === guestId)!.currentDraw.length;
    expect(guestCurrentDraw).toBeGreaterThan(0);

    // Host reconnects with the same playerId — should see the post-move state immediately.
    const reconnected = await connectClient(room.code, hostId);
    await reconnected.next((m) => m.type === 'room');
    const reconnectedState = await reconnected.next((m) => m.type === 'state');
    expect(reconnectedState.type).toBe('state');
    if (reconnectedState.type === 'state') {
      expect(reconnectedState.state.players.find((p) => p.id === guestId)!.currentDraw.length).toBe(guestCurrentDraw);
    }

    // And a subsequent move should be broadcast to the reconnected socket.
    guestClient.send({ type: 'move', move: { type: 'draw-pile' } });
    const reconnectedNext = await reconnected.next((m) => m.type === 'state');
    expect(reconnectedNext.type).toBe('state');

    await reconnected.close();
    await guestClient.close();
  });

  it('broadcasts moves to every connected client in a 3-player room', async () => {
    const { room, playerId: hostId } = await roomManager.createRoom({
      playerName: 'Host',
      scoringMethod: 'fullHand',
      targetScore: 50,
    });
    const { playerId: p2Id } = roomManager.joinRoom(room.code, { playerName: 'P2' });
    const { playerId: p3Id } = roomManager.joinRoom(room.code, { playerName: 'P3' });
    roomManager.toggleReady(room.code, hostId);
    roomManager.toggleReady(room.code, p2Id);
    roomManager.toggleReady(room.code, p3Id);
    const started = await roomManager.startGame(room.code, hostId);
    gameSocket.onGameStarted(started);

    const c1 = await connectClient(room.code, hostId);
    const c2 = await connectClient(room.code, p2Id);
    const c3 = await connectClient(room.code, p3Id);

    await Promise.all([
      c1.next((m) => m.type === 'state'),
      c2.next((m) => m.type === 'state'),
      c3.next((m) => m.type === 'state'),
    ]);

    c2.send({ type: 'move', move: { type: 'draw-pile' } });

    const [s1, s2, s3] = await Promise.all([
      c1.next((m) => m.type === 'state'),
      c2.next((m) => m.type === 'state'),
      c3.next((m) => m.type === 'state'),
    ]);

    expect(s1.type).toBe('state');
    expect(s2.type).toBe('state');
    expect(s3.type).toBe('state');
    if (s1.type === 'state' && s2.type === 'state' && s3.type === 'state') {
      // All three peers must see P2's currentDraw populated identically.
      const p2DrawC1 = s1.state.players.find((p) => p.id === p2Id)!.currentDraw.length;
      const p2DrawC2 = s2.state.players.find((p) => p.id === p2Id)!.currentDraw.length;
      const p2DrawC3 = s3.state.players.find((p) => p.id === p2Id)!.currentDraw.length;
      expect(p2DrawC1).toBeGreaterThan(0);
      expect(p2DrawC2).toBe(p2DrawC1);
      expect(p2DrawC3).toBe(p2DrawC1);
    }

    await c1.close();
    await c2.close();
    await c3.close();
  });
});
