import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { History, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getQueryFn } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { format } from 'date-fns';

interface Bet {
  id: string;
  betType: string;
  targetPlayerName: string;
  chipAmount: number;
  payout: number;
  status: 'pending' | 'won' | 'lost' | 'void';
  createdAt: string;
}

export default function BettingHistory() {
  const { user } = useAuth();
  const { data: bets, isLoading } = useQuery<Bet[]>({
    queryKey: ['/api/betting/history'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user,
  });

  const getBetTypeLabel = (betType: string): string => {
    const labels: Record<string, string> = {
      winner: 'Round Winner',
      declareOut: 'First Out',
      confidence: 'Self Confidence',
      sidebet: 'Side Bet',
    };
    return labels[betType] || betType;
  };

  const getStatusBadge = (status: string, payout: number, chipAmount: number) => {
    if (status === 'pending') {
      return (
        <Badge variant="outline" className="gap-1">
          <Minus className="w-3 h-3" />
          Pending
        </Badge>
      );
    }
    if (status === 'won') {
      return (
        <Badge variant="default" className="gap-1 bg-green-600 dark:bg-green-700">
          <TrendingUp className="w-3 h-3" />
          Won +{payout}
        </Badge>
      );
    }
    if (status === 'lost') {
      return (
        <Badge variant="destructive" className="gap-1">
          <TrendingDown className="w-3 h-3" />
          Lost -{chipAmount}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1">
        Void
      </Badge>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <History className="w-5 h-5" />
          <CardTitle>Betting History</CardTitle>
        </div>
        <CardDescription>
          Your recent bets and outcomes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!user ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Please log in to view your betting history</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 bg-muted rounded-md animate-pulse">
                <div className="w-full h-16 bg-muted-foreground/20 rounded" />
              </div>
            ))}
          </div>
        ) : bets && bets.length > 0 ? (
          <div className="space-y-3">
            {bets.map((bet) => (
              <div
                key={bet.id}
                className="p-4 bg-muted/50 rounded-md space-y-2"
                data-testid={`bet-history-${bet.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" data-testid="text-bet-type">
                        {getBetTypeLabel(bet.betType)}
                      </span>
                      {bet.targetPlayerName && (
                        <Badge variant="outline" className="text-xs" data-testid="text-target-player">
                          {bet.targetPlayerName}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span data-testid="text-bet-amount">{bet.chipAmount} chips</span>
                      <span>•</span>
                      <span data-testid="text-bet-date">
                        {format(new Date(bet.createdAt), 'MMM d, h:mm a')}
                      </span>
                    </div>
                  </div>
                  {getStatusBadge(bet.status, bet.payout, bet.chipAmount)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No betting history yet</p>
            <p className="text-xs mt-2">Place your first bet in a game lobby!</p>
          </div>
        )}
        
        <div className="mt-4 p-3 bg-muted/30 rounded-md">
          <p className="text-xs text-muted-foreground text-center">
            <strong>Entertainment Only:</strong> Virtual chips have no real-world value. 
            This is a game feature for fun competition.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
