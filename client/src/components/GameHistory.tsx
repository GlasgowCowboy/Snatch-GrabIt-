import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { History, Trophy, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { getQueryFn } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import type { Game, GameParticipant } from '@shared/schema';

interface GameHistoryEntry {
  game: Game;
  participant: GameParticipant;
}

export default function GameHistory() {
  const { user } = useAuth();
  const isPaid = user?.tier === 'paid';

  const { data: games, isLoading, error } = useQuery<GameHistoryEntry[]>({
    queryKey: ['/api/games/history'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user && isPaid,
  });

  if (!user) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Game History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>Log in to track your game history.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isPaid) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Game History
          </CardTitle>
          <CardDescription>Available with a paid account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground space-y-2">
            <Lock className="w-8 h-8 mx-auto opacity-50" />
            <p className="font-medium">Upgrade to track every game you play</p>
            <p className="text-xs">Placements, scores, and declare-outs all logged.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5" />
          Game History
        </CardTitle>
        <CardDescription>Your finished games, newest first</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3" data-testid="game-history-loading">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 bg-muted rounded-md animate-pulse">
                <div className="w-full h-12 bg-muted-foreground/20 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Couldn't load game history.</p>
          </div>
        ) : games && games.length > 0 ? (
          <div className="space-y-3" data-testid="game-history-list">
            {[...games]
              .sort((a, b) => {
                const aTime = a.game.finishedAt ? new Date(a.game.finishedAt).getTime() : 0;
                const bTime = b.game.finishedAt ? new Date(b.game.finishedAt).getTime() : 0;
                return bTime - aTime;
              })
              .map(({ game, participant }) => {
                const won = participant.placement === 1;
                const finished = game.finishedAt ? new Date(game.finishedAt) : null;
                return (
                  <div
                    key={participant.id}
                    className="p-4 bg-muted/50 rounded-md space-y-2"
                    data-testid={`game-history-row-${participant.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {won && <Trophy className="w-4 h-4 text-yellow-500" data-testid="icon-winner" />}
                          <span className="font-medium text-sm">
                            {won ? 'You won' : `Placed #${participant.placement ?? '?'}`}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {game.scoringMethod === 'fullHand' ? 'Full Hand' : 'Round'}
                          </Badge>
                          {participant.declaredOut && (
                            <Badge variant="outline" className="text-xs" data-testid="badge-declared-out">
                              Declared out
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {finished ? format(finished, 'MMM d, h:mm a') : 'In progress'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-semibold" data-testid="text-game-score">
                          {participant.score}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          target {game.targetScore}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No finished games yet.</p>
            <p className="text-xs mt-2">Play a game to get started.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
