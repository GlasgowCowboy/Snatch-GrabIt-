import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useGameSync } from '@/hooks/use-game-sync';
import GameLobby from '@/components/GameLobby';
import GameBoardInteractive from '@/components/GameBoardInteractive';
import GameCountdown from '@/components/GameCountdown';
import { ScoringMethod } from '@shared/schema';
import { AIDifficulty } from '@shared/aiPlayer';
import type {
  CreateRoomResponse,
  JoinRoomResponse,
  Room,
} from '@shared/rooms';

type UIState = 'lobby' | 'waiting' | 'countdown' | 'playing';

export default function Home() {
  const { toast } = useToast();
  const [uiState, setUIState] = useState<UIState>('lobby');
  const [roomCode, setRoomCode] = useState<string>('');
  const [playerId, setPlayerId] = useState<string>('');
  const previousStatusRef = useRef<Room['status'] | undefined>(undefined);

  const {
    room,
    gameState,
    sendMove,
    sendChat,
    sendNextRound,
    connectionState,
  } = useGameSync(roomCode || undefined, playerId || undefined, (msg) =>
    toast({ title: 'Invalid move', description: msg, variant: 'destructive' }),
  );

  // Detect server-side transition from waiting → playing and start countdown locally
  useEffect(() => {
    const status = room?.status;
    const prev = previousStatusRef.current;
    if (prev === 'waiting' && status === 'playing' && uiState === 'waiting') {
      setUIState('countdown');
    }
    previousStatusRef.current = status;
  }, [room?.status, uiState]);

  const createRoomMutation = useMutation({
    mutationFn: async (input: {
      playerName: string;
      cardBackImage?: string;
      scoringMethod: ScoringMethod;
      targetScore: number;
      aiConfig?: { numAI: number; difficulty: AIDifficulty };
    }) => {
      const res = await apiRequest('POST', '/api/rooms', input);
      return (await res.json()) as CreateRoomResponse;
    },
    onSuccess: ({ room, playerId }) => {
      setRoomCode(room.code);
      setPlayerId(playerId);
      setUIState('waiting');
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create room', description: error.message, variant: 'destructive' });
    },
  });

  const joinRoomMutation = useMutation({
    mutationFn: async (input: { code: string; playerName: string; cardBackImage?: string }) => {
      const { code, ...body } = input;
      const res = await apiRequest('POST', `/api/rooms/${code.toUpperCase()}/join`, body);
      return (await res.json()) as JoinRoomResponse;
    },
    onSuccess: ({ room, playerId }) => {
      setRoomCode(room.code);
      setPlayerId(playerId);
      setUIState('waiting');
    },
    onError: (error: Error) => {
      toast({ title: 'Could not join room', description: error.message, variant: 'destructive' });
    },
  });

  const readyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', `/api/rooms/${roomCode}/ready`, { playerId });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update ready state', description: error.message, variant: 'destructive' });
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', `/api/rooms/${roomCode}/start`, { playerId });
    },
    onSuccess: () => {
      setUIState('countdown');
    },
    onError: (error: Error) => {
      toast({ title: 'Could not start game', description: error.message, variant: 'destructive' });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (!roomCode || !playerId) return;
      await apiRequest('POST', `/api/rooms/${roomCode}/leave`, { playerId });
    },
    onSettled: () => {
      setRoomCode('');
      setPlayerId('');
      previousStatusRef.current = undefined;
      setUIState('lobby');
    },
  });

  const handleCreateRoom = (
    playerName: string,
    cardBackImage?: string,
    scoringMethodParam?: ScoringMethod,
    targetScoreParam?: number,
    aiConfigParam?: { numAI: number; difficulty: AIDifficulty },
  ) => {
    createRoomMutation.mutate({
      playerName,
      cardBackImage: cardBackImage || undefined,
      scoringMethod: scoringMethodParam ?? 'fullHand',
      targetScore: targetScoreParam ?? 50,
      aiConfig: aiConfigParam,
    });
  };

  const handleJoinRoom = (code: string, playerName: string, cardBackImage?: string) => {
    joinRoomMutation.mutate({ code, playerName, cardBackImage: cardBackImage || undefined });
  };

  const handleCountdownComplete = () => setUIState('playing');

  if (uiState === 'playing' && gameState) {
    return (
      <GameBoardInteractive
        gameState={gameState}
        currentPlayerId={playerId}
        connectionState={connectionState}
        sendMove={sendMove}
        sendChat={sendChat}
        sendNextRound={sendNextRound}
        onLeaveGame={() => leaveMutation.mutate()}
      />
    );
  }

  const isHost = !!room && room.hostId === playerId;

  return (
    <>
      <GameLobby
        roomCode={uiState !== 'lobby' ? room?.code : undefined}
        gameDbId={uiState !== 'lobby' ? room?.gameDbId : undefined}
        players={uiState !== 'lobby' ? room?.players : undefined}
        currentPlayerId={playerId}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onStartGame={() => startMutation.mutate()}
        onToggleReady={() => readyMutation.mutate()}
        onLeaveRoom={uiState === 'waiting' ? () => leaveMutation.mutate() : undefined}
        isHost={isHost}
        scoringMethod={room?.scoringMethod}
        targetScore={room?.targetScore}
      />
      <GameCountdown
        show={uiState === 'countdown'}
        onComplete={handleCountdownComplete}
      />
    </>
  );
}
