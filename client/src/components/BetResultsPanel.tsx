import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from './ui/badge';
import { Coins, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import type { VirtualBet } from '@shared/schema';

interface BetResultsPanelProps {
  gameDbId: string;
}

/**
 * Shown inside the game-over Scoreboard. Fetches the authenticated user's bets
 * for this specific game and displays won/lost/pending outcomes with payouts.
 * Polls every 4s so results appear as soon as settleGameBets() finishes server-side.
 */
export default function BetResultsPanel({ gameDbId }: BetResultsPanelProps) {
  const { user } = useAuth();
  const { data: bets = [] } = useQuery<VirtualBet[]>({
    queryKey: ['/api/betting/game', gameDbId],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user && !!gameDbId,
    refetchInterval: 4000,
  });

  if (!user || bets.length === 0) return null;

  const totalWagered = bets.reduce((sum, b) => sum + b.chipAmount, 0);
  const totalPayout = bets
    .filter((b) => b.status === 'won')
    .reduce((sum, b) => sum + b.payout, 0);
  const netChips = totalPayout - totalWagered;

  const betTypeLabel: Record<string, string> = {
    winner: 'Winner',
    declareOut: 'Declare Out',
    confidence: 'Confidence',
    sidebet: 'Side Bet',
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gold-light/70 uppercase tracking-wider flex items-center gap-2">
        <Coins className="w-4 h-4 text-cyan-400" />
        Your Bets
      </h3>

      <div className="space-y-2">
        {bets.map((bet) => (
          <div
            key={bet.id}
            className={`flex items-center justify-between p-3 rounded-lg border text-sm ${
              bet.status === 'won'
                ? 'bg-green-900/20 border-green-500/30'
                : bet.status === 'lost'
                ? 'bg-red-900/20 border-red-500/30'
                : 'glass border-gold/10'
            }`}
          >
            <div className="flex items-center gap-2">
              {bet.status === 'won' ? (
                <TrendingUp className="w-4 h-4 text-green-400 shrink-0" />
              ) : bet.status === 'lost' ? (
                <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-gold/60 shrink-0" />
              )}
              <div>
                <span className="text-gold-light/80">
                  {betTypeLabel[bet.betType] ?? bet.betType}
                </span>
                {bet.targetPlayerName && (
                  <span className="text-gold-light/50 ml-1">→ {bet.targetPlayerName}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-gold-light/50">{bet.chipAmount.toLocaleString()} chips</span>
              {bet.status === 'won' && (
                <Badge className="bg-green-700/60 text-green-300 border-green-500/40 text-xs">
                  +{bet.payout.toLocaleString()}
                </Badge>
              )}
              {bet.status === 'lost' && (
                <Badge variant="outline" className="border-red-500/40 text-red-400 text-xs">
                  Lost
                </Badge>
              )}
              {bet.status === 'pending' && (
                <Badge variant="outline" className="border-gold/30 text-gold/60 text-xs animate-pulse">
                  Settling…
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Summary row */}
      <div className="flex items-center justify-between pt-2 border-t border-gold/10 text-sm">
        <span className="text-gold-light/50">Net chips this game</span>
        <span
          className={`font-bold ${
            netChips > 0 ? 'text-green-400' : netChips < 0 ? 'text-red-400' : 'text-gold-light/60'
          }`}
        >
          {netChips > 0 ? '+' : ''}{netChips.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
