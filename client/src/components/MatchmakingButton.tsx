import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, getQueryFn } from '@/lib/queryClient';

/**
 * "Quick match" affordance. Tap → enter queue → server polls every 2 s for a
 * match → on match, parent receives the room code + playerId via onMatched.
 *
 * Uses fullHand / 50pts as the default match — most common preset, biggest
 * pool. Could expand to a preferences sheet later but not for V1.
 */

interface QueueStatus {
  inQueue: boolean;
  queuedFor?: { method: string; targetScore: number; durationSec?: number };
  waitingMs?: number;
  queueDepth?: number;
  matched?: { roomCode: string; playerId: string; opponentUsername: string };
}

interface MatchmakingButtonProps {
  onMatched: (roomCode: string, playerId: string, opponentUsername: string) => void;
}

const POLL_INTERVAL_MS = 2000;

export default function MatchmakingButton({ onMatched }: MatchmakingButtonProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [queued, setQueued] = useState(false);

  // Status polled every 2 s while queued — react-query handles the cadence.
  const { data: status } = useQuery<QueueStatus>({
    queryKey: ['/api/matchmaking/status'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: queued,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/matchmaking/queue', {
        scoringMethod: 'fullHand',
        targetScore: 50,
      });
      return (await res.json()) as QueueStatus;
    },
    onSuccess: (s) => {
      if (s.matched) {
        // Already paired on the same request — skip the polling step.
        setQueued(false);
        onMatched(s.matched.roomCode, s.matched.playerId, s.matched.opponentUsername);
      } else {
        setQueued(true);
      }
    },
    onError: (e: Error) => {
      toast({ title: 'Quick match failed', description: e.message, variant: 'destructive' });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', '/api/matchmaking/queue'),
    onSuccess: () => {
      setQueued(false);
      qc.removeQueries({ queryKey: ['/api/matchmaking/status'] });
    },
  });

  // When the polled status flips to matched, hand off to the parent.
  useEffect(() => {
    if (status?.matched) {
      setQueued(false);
      const { roomCode, playerId, opponentUsername } = status.matched;
      onMatched(roomCode, playerId, opponentUsername);
    }
  }, [status?.matched, onMatched]);

  if (queued) {
    const waitingSec = Math.floor((status?.waitingMs ?? 0) / 1000);
    return (
      <Button
        variant="outline"
        onClick={() => leaveMutation.mutate()}
        data-testid="button-cancel-match"
        className="h-12 glass border-amber-500/40 text-amber-300 hover:bg-amber-500/10 gap-2"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        Searching… {waitingSec}s
        <span className="text-[10px] uppercase tracking-wide opacity-70 ml-2">tap to cancel</span>
      </Button>
    );
  }

  return (
    <Button
      onClick={() => joinMutation.mutate()}
      disabled={joinMutation.isPending}
      data-testid="button-quick-match"
      className="h-12 glass border border-violet-500/40 text-violet-300 hover:border-violet-500/60 hover:bg-violet-500/10 gap-2"
      variant="outline"
    >
      <Zap className="w-4 h-4" />
      Quick match
    </Button>
  );
}
