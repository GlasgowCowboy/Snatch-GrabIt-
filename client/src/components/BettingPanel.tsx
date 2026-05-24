import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Coins, TrendingUp, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation } from '@tanstack/react-query';
import { UserProfile } from '@shared/schema';
import { apiRequest, getQueryFn, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface Player {
  id: string;
  name: string;
  isReady: boolean;
  /** Real auth user.id (when logged-in); null for AI / guest. Used as target_user_id on the bet. */
  userId?: string | null;
}

interface BettingPanelProps {
  players: Player[];
  currentPlayerId: string;
  /**
   * games.id UUID. Required to actually place a bet — virtual_bets.game_id is
   * an FK so anything that's not a real games row will be rejected by Postgres.
   * Pass undefined while the room state is still loading; the panel will render
   * but the place-bet button stays disabled.
   */
  gameId?: string;
}

// Quick check: any non-empty string that *looks* UUID-shaped. Belt-and-braces
// guard so a stale prop or rogue caller can't smuggle a roomCode in here.
function looksLikeUuid(s: string | undefined): boolean {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export default function BettingPanel({ players, currentPlayerId, gameId }: BettingPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [betType, setBetType] = useState<string>('');
  const [targetPlayer, setTargetPlayer] = useState<string>('');
  const [betAmount, setBetAmount] = useState<string>('');
  
  // Fetch chip balance with auto-refresh
  const { data: balanceData, isLoading: balanceLoading } = useQuery<{ chips: number }>({
    queryKey: ['/api/betting/balance'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const chipBalance = balanceData?.chips ?? 1000;
  const otherPlayers = players.filter(p => p.id !== currentPlayerId);

  // Place bet mutation
  const placeBetMutation = useMutation({
    mutationFn: async (betData: {
      gameId: string;
      betType: string;
      targetUserId?: string;
      targetPlayerName?: string;
      chipAmount: number;
    }) => {
      const response = await apiRequest('POST', '/api/betting/place', betData);
      return await response.json();
    },
    onSuccess: (data: any) => {
      // Refetch balance after placing bet
      queryClient.invalidateQueries({ queryKey: ['/api/betting/balance'] });
      toast({
        title: "Bet Placed!",
        description: `Your bet of ${data.chipAmount} chips has been placed successfully. Potential payout: ${data.payout} chips.`,
      });
      // Reset form
      setBetType('');
      setTargetPlayer('');
      setBetAmount('');
    },
    onError: (error: Error) => {
      // apiRequest now extracts the server's `{ message }` into error.message
      // directly, so we no longer need to re-parse it.
      toast({
        title: "Couldn't place bet",
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const gameIdReady = looksLikeUuid(gameId);

  const handlePlaceBet = () => {
    if (!gameIdReady || !gameId) {
      toast({
        title: "Couldn't place bet",
        description: 'Game is still being set up — try again in a second.',
        variant: 'destructive',
      });
      return;
    }
    const amount = parseInt(betAmount);
    if (!betType || !amount || amount <= 0 || amount > chipBalance) return;

    // Resolve target → real auth user.id (or undefined for AI / guest). The
    // synthetic room player.id is NOT valid because virtual_bets.target_user_id
    // is an FK to users.id; passing the room id triggers a Postgres FK error
    // and chips wouldn't move (the storage transaction rolls back), but the
    // user still sees an ugly toast. Pipe the real id through instead.
    const me = players.find(p => p.id === currentPlayerId);
    const targetPlayerData = players.find(p => p.id === targetPlayer);

    if (betType === 'confidence') {
      placeBetMutation.mutate({
        gameId,
        betType,
        targetUserId: me?.userId ?? user?.id ?? undefined,
        targetPlayerName: me?.name ?? 'You',
        chipAmount: amount,
      });
    } else if (targetPlayer && targetPlayerData) {
      placeBetMutation.mutate({
        gameId,
        betType,
        // Real auth id when the target is a registered user; undefined for AI /
        // guest. Settlement falls back to matching by playerName for those.
        targetUserId: targetPlayerData.userId ?? undefined,
        targetPlayerName: targetPlayerData.name,
        chipAmount: amount,
      });
    }
  };

  const betTypes = [
    { value: 'winner', label: 'Round Winner', description: 'Who will win this round?' },
    { value: 'declareOut', label: 'First Out', description: 'Who will declare out first?' },
    { value: 'confidence', label: 'Self Confidence', description: 'Bet on yourself to win!' },
  ];

  const calculatePotentialPayout = () => {
    const amount = parseInt(betAmount);
    if (!amount || !betType) return 0;
    
    if (betType === 'confidence') return amount * 1.5; // 1.5x for self-bet
    return amount * 2; // 2x for betting on others
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-yellow-500" />
              Virtual Betting
            </CardTitle>
            <CardDescription>
              Place bets before the round starts
            </CardDescription>
          </div>
          <Badge variant="outline" className="gap-1" data-testid="badge-chip-balance">
            <Coins className="w-3 h-3 text-yellow-500" />
            {chipBalance.toLocaleString()} chips
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Legal Disclaimer */}
        <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md">
          <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
          <p className="text-xs text-muted-foreground">
            For entertainment only. Virtual chips have <strong>no real-world value</strong> and cannot be exchanged for money or prizes.
          </p>
        </div>

        {/* Bet Type Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Bet Type</label>
          <Select value={betType} onValueChange={setBetType}>
            <SelectTrigger data-testid="select-bet-type">
              <SelectValue placeholder="Choose bet type..." />
            </SelectTrigger>
            <SelectContent>
              {betTypes.map(type => (
                <SelectItem key={type.value} value={type.value}>
                  <div>
                    <p className="font-medium">{type.label}</p>
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Player Selection (for non-confidence bets) */}
        {betType && betType !== 'confidence' && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Player</label>
            <Select value={targetPlayer} onValueChange={setTargetPlayer}>
              <SelectTrigger data-testid="select-target-player">
                <SelectValue placeholder="Choose a player..." />
              </SelectTrigger>
              <SelectContent>
                {otherPlayers.map(player => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Bet Amount */}
        {betType && (betType === 'confidence' || targetPlayer) && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Bet Amount</label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                max={chipBalance}
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                placeholder="Enter chip amount..."
                data-testid="input-bet-amount"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBetAmount(Math.floor(chipBalance / 2).toString())}
                data-testid="button-bet-half"
              >
                Half
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBetAmount(chipBalance.toString())}
                data-testid="button-bet-all"
              >
                All In
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Available: {chipBalance.toLocaleString()} chips
            </p>
          </div>
        )}

        {/* Potential Payout */}
        {betAmount && parseInt(betAmount) > 0 && (
          <div className="p-3 bg-primary/10 rounded-md">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Potential Payout:</span>
              <span className="text-lg font-bold text-primary flex items-center gap-1">
                <TrendingUp className="w-4 h-4" />
                {calculatePotentialPayout().toLocaleString()} chips
              </span>
            </div>
          </div>
        )}

        {/* Place Bet Button — disabled until the room delivers a real gameId */}
        <Button
          onClick={handlePlaceBet}
          disabled={
            !gameIdReady ||
            !betType ||
            (!targetPlayer && betType !== 'confidence') ||
            !betAmount ||
            parseInt(betAmount) <= 0 ||
            parseInt(betAmount) > chipBalance ||
            placeBetMutation.isPending
          }
          className="w-full"
          data-testid="button-place-bet"
          title={!gameIdReady ? 'Waiting for the game to be ready' : undefined}
        >
          <Coins className="w-4 h-4 mr-2" />
          {placeBetMutation.isPending ? 'Placing…' : 'Place Bet'}
        </Button>

        {/* Daily Reset Info */}
        <p className="text-xs text-center text-muted-foreground">
          Chips reset daily at midnight. Start fresh every day!
        </p>
      </CardContent>
    </Card>
  );
}
