import { useEffect, useRef, useState } from 'react';
import type { GameState } from '@shared/schema';
import type { GameMove } from '@shared/gameEngine';
import type { Room } from '@shared/rooms';
import type { ClientMessage, ServerMessage } from '@shared/wsMessages';

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface UseGameSyncResult {
  room: Room | null;
  gameState: GameState | null;
  connectionState: ConnectionState;
  lastError: string | null;
  sendMove: (move: GameMove) => void;
  sendChat: (message: string) => void;
  sendNextRound: () => void;
}

const RECONNECT_MAX_ATTEMPTS = 8;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15000;

function backoffDelay(attempt: number): number {
  // 1s, 2s, 4s, 8s, 15s, 15s, ...
  return Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_MS * 2 ** attempt);
}

export function useGameSync(
  roomCode: string | undefined,
  playerId: string | undefined,
  onError?: (message: string) => void,
): UseGameSyncResult {
  const [room, setRoom] = useState<Room | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('closed');
  const [lastError, setLastError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const errorHandlerRef = useRef(onError);

  useEffect(() => {
    errorHandlerRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!roomCode || !playerId) {
      setConnectionState('closed');
      setRoom(null);
      setGameState(null);
      return;
    }

    // Reset on room change so stale state doesn't leak across rooms
    setRoom(null);
    setGameState(null);
    setLastError(null);

    let cancelled = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let terminal = false;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws?code=${encodeURIComponent(roomCode)}&playerId=${encodeURIComponent(playerId)}`;

    const connect = () => {
      if (cancelled) return;
      setConnectionState(attempt === 0 ? 'connecting' : 'reconnecting');

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        attempt = 0;
        setConnectionState('open');
      };

      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === 'room') {
          setRoom(msg.room);
        } else if (msg.type === 'state') {
          setGameState(msg.state);
        } else if (msg.type === 'error') {
          setLastError(msg.message);
          errorHandlerRef.current?.(msg.message);
        } else if (msg.type === 'closed') {
          // Server-initiated terminal close (unknown room/player). Don't retry.
          terminal = true;
          setLastError(msg.reason);
        }
      };

      const scheduleReconnect = () => {
        if (cancelled || terminal) return;
        if (attempt >= RECONNECT_MAX_ATTEMPTS) {
          setConnectionState('closed');
          return;
        }
        const delay = backoffDelay(attempt);
        attempt += 1;
        setConnectionState('reconnecting');
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // 'error' fires before 'close'; let 'close' drive the retry decision.
      };

      ws.onclose = () => {
        if (cancelled) return;
        wsRef.current = null;
        if (terminal) {
          setConnectionState('closed');
          return;
        }
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.onopen = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnectionState('closed');
    };
  }, [roomCode, playerId]);

  const sendRaw = (msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  };

  return {
    room,
    gameState,
    connectionState,
    lastError,
    sendMove: (move) => sendRaw({ type: 'move', move }),
    sendChat: (message) => sendRaw({ type: 'chat', message }),
    sendNextRound: () => sendRaw({ type: 'next-round' }),
  };
}
