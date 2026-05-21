import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Trophy, Flag, Target, Gamepad2, Lock } from 'lucide-react';
import { getQueryFn } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import type { Game, GameParticipant } from '@shared/schema';

interface GameHistoryEntry {
  game: Game;
  participant: GameParticipant;
}

interface Stat {
  label: string;
  value: string;
  icon: React.ReactNode;
  testId: string;
}

export default function PlayerStats() {
  const { user } = useAuth();
  const isPaid = user?.tier === 'paid';

  const { data: games, isLoading } = useQuery<GameHistoryEntry[]>({
    queryKey: ['/api/games/history'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user && isPaid,
  });

  if (!user || !isPaid) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Your Stats
          </CardTitle>
          <CardDescription>
            {!user ? 'Log in to see your performance' : 'Available with a paid account'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground space-y-2">
            <Lock className="w-8 h-8 mx-auto opacity-50" />
            <p className="text-sm">Win rate, placements, and declare-outs across every game.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = games?.length ?? 0;
  const wins = games?.filter((g) => g.participant.placement === 1).length ?? 0;
  const declaredOuts = games?.filter((g) => g.participant.declaredOut).length ?? 0;
  const totalScore = games?.reduce((sum, g) => sum + (g.participant.score ?? 0), 0) ?? 0;
  const avgScore = total > 0 ? Math.round(totalScore / total) : 0;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  const stats: Stat[] = [
    {
      label: 'Games played',
      value: String(total),
      icon: <Gamepad2 className="w-4 h-4 text-muted-foreground" />,
      testId: 'stat-games-played',
    },
    {
      label: 'Wins',
      value: total > 0 ? `${wins} (${winRate}%)` : '0',
      icon: <Trophy className="w-4 h-4 text-yellow-500" />,
      testId: 'stat-wins',
    },
    {
      label: 'Declared out',
      value: String(declaredOuts),
      icon: <Flag className="w-4 h-4 text-muted-foreground" />,
      testId: 'stat-declared-outs',
    },
    {
      label: 'Avg score',
      value: String(avgScore),
      icon: <Target className="w-4 h-4 text-muted-foreground" />,
      testId: 'stat-avg-score',
    },
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          Your Stats
        </CardTitle>
        <CardDescription>Performance across all finished games</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="stats-loading">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 bg-muted rounded-md animate-pulse">
                <div className="w-full h-12 bg-muted-foreground/20 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="p-4 bg-muted/50 rounded-md space-y-1"
                data-testid={s.testId}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {s.icon}
                  {s.label}
                </div>
                <div className="text-2xl font-semibold">{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
