import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Trophy, Coins, TrendingUp } from 'lucide-react';
import { getQueryFn } from '@/lib/queryClient';

interface LeaderboardEntry {
  userId: string;
  displayName: string;
  chips: number;
}

export default function ChipLeaderboard() {
  const { data: leaders, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ['/api/betting/leaderboard'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const getMedalColor = (position: number): string => {
    if (position === 0) return 'text-yellow-500 dark:text-yellow-400'; // Gold
    if (position === 1) return 'text-gray-400 dark:text-gray-300'; // Silver
    if (position === 2) return 'text-orange-600 dark:text-orange-400'; // Bronze
    return 'text-muted-foreground';
  };

  const getMedalIcon = (position: number) => {
    if (position < 3) {
      return <Trophy className={`w-5 h-5 ${getMedalColor(position)}`} />;
    }
    return <span className="text-sm font-medium text-muted-foreground">#{position + 1}</span>;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          <CardTitle>Chip Leaderboard</CardTitle>
        </div>
        <CardDescription>
          Top players by virtual chip balance (resets daily)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-md animate-pulse">
                <div className="w-24 h-5 bg-muted-foreground/20 rounded" />
                <div className="w-16 h-5 bg-muted-foreground/20 rounded" />
              </div>
            ))}
          </div>
        ) : leaders && leaders.length > 0 ? (
          <div className="space-y-2">
            {leaders.map((leader, index) => (
              <div
                key={leader.userId}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-md hover-elevate"
                data-testid={`leaderboard-entry-${index}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 flex justify-center">
                    {getMedalIcon(index)}
                  </div>
                  <span className="font-medium text-sm" data-testid={`text-leader-name-${index}`}>
                    {leader.displayName || 'Anonymous'}
                  </span>
                </div>
                <Badge variant="outline" className="gap-1" data-testid={`text-leader-chips-${index}`}>
                  <Coins className="w-3 h-3" />
                  {leader.chips.toLocaleString()}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No leaderboard data available</p>
          </div>
        )}
        
        <div className="mt-4 p-3 bg-muted/30 rounded-md">
          <p className="text-xs text-muted-foreground text-center">
            <strong>Note:</strong> Virtual chips have no real-world value and are for entertainment only. 
            Chips reset daily at midnight.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
