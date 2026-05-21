import ChipLeaderboard from '@/components/ChipLeaderboard';
import BettingHistory from '@/components/BettingHistory';
import GameHistory from '@/components/GameHistory';
import PlayerStats from '@/components/PlayerStats';
import AccountDropdown from '@/components/AccountDropdown';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

export default function StatsPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="absolute top-4 right-4">
        <AccountDropdown />
      </div>

      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/')}
            data-testid="button-back-home"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Stats &amp; Leaderboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track your performance and see top players
            </p>
          </div>
        </div>

        <PlayerStats />

        <div className="grid gap-6 md:grid-cols-2">
          <ChipLeaderboard />
          <BettingHistory />
        </div>

        <GameHistory />
      </div>
    </div>
  );
}
