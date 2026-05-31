import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Trophy, Coins, Sparkles, Hash, Users, Clock, History as HistoryIcon, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '@/hooks/use-auth';
import { getQueryFn } from '@/lib/queryClient';
import type { UserProfile } from '@shared/schema';
import PendingInvites from './PendingInvites';
import FriendsPanel from './FriendsPanel';
import MatchmakingButton from './MatchmakingButton';

/**
 * Logged-in home dashboard. Surfaces the things a returning player wants on
 * arrival: how much they have, where they rank, what they just played, who
 * wants to play with them. Big buttons drop them into the multi-step flow
 * (`onNewGame` / `onJoinCode` are wired into LandingScreen's setStep).
 */

interface UserGameSummary {
  gameId: string;
  scoringMethod: string;
  targetScore: number;
  startedAt: string | null;
  finishedAt: string | null;
  placement: number | null;
  score: number | null;
  playerName: string;
  declaredOut: boolean;
  totalPlayers: number;
  earnedCredits: number;
}

interface LeaderboardEntry {
  userId: string;
  displayName: string;
  gamesPlayed: number;
  wins: number;
  winPct: number;
  avgPlacement: number;
  earnedCredits: number;
}

interface MyRank {
  rank: number | null;
  totalPlayers: number;
  wins: number;
  gamesPlayed: number;
  winPct: number;
  avgPlacement: number;
}

interface PlayerDashboardProps {
  onNewGame: () => void;
  onJoinCode: () => void;
  onAcceptInvite: (code: string) => void;
  /** Hand-off from matchmaking — drop the dashboard, jump to the new room. */
  onMatched?: (code: string, playerId: string) => void;
}

export default function PlayerDashboard({ onNewGame, onJoinCode, onAcceptInvite, onMatched }: PlayerDashboardProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['/api/profile'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });
  const { data: chipsRes } = useQuery<{ chips: number }>({
    queryKey: ['/api/betting/balance'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });
  const { data: creditsRes } = useQuery<{ credits: number }>({
    queryKey: ['/api/credits/balance'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });
  const { data: myRank } = useQuery<MyRank>({
    queryKey: ['/api/leaderboard/my-rank'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });
  const { data: history } = useQuery<UserGameSummary[]>({
    queryKey: ['/api/games/history'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });
  const { data: topPlayers } = useQuery<LeaderboardEntry[]>({
    queryKey: ['/api/leaderboard'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const displayName = profile?.displayName ?? user?.username ?? 'Player';
  const chips = chipsRes?.chips ?? 0;
  const credits = creditsRes?.credits ?? 0;
  const recentGames = (history ?? []).slice(0, 3);
  const top5 = (topPlayers ?? []).slice(0, 5);
  const myInTop5 = top5.some((p) => p.userId === user?.id);

  return (
    <div className="space-y-5">
      {/* Welcome + your-stats hero */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-gold-light/50">Welcome back</p>
        <h2 className="text-2xl font-bold text-gradient-gold">{displayName}</h2>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatChip
          icon={<Coins className="w-4 h-4" />}
          label="Chips"
          value={chips.toLocaleString()}
          accent="gold"
        />
        <StatChip
          icon={<Sparkles className="w-4 h-4" />}
          label="Credits"
          value={credits.toLocaleString()}
          accent="emerald"
        />
        <StatChip
          icon={<Trophy className="w-4 h-4" />}
          label="Rank"
          value={myRank?.rank ? `#${myRank.rank}` : '—'}
          sub={myRank?.gamesPlayed ? `${myRank.wins}W · ${myRank.gamesPlayed}G` : 'no games yet'}
          accent="cyan"
        />
      </div>

      <PendingInvites onAccept={onAcceptInvite} />

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="btn-gold h-12"
          onClick={onNewGame}
          data-testid="dashboard-new-game"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          New game
        </Button>
        <Button
          variant="outline"
          className="h-12 glass border-cyan-500/40 text-cyan-300 hover:border-cyan-500/60 hover:bg-cyan-500/5"
          onClick={onJoinCode}
          data-testid="dashboard-join-code"
        >
          <Hash className="w-4 h-4 mr-2" />
          Join with code
        </Button>
        {onMatched && (
          <MatchmakingButton
            onMatched={(roomCode, playerId) => onMatched(roomCode, playerId)}
          />
        )}
      </div>

      {/* Recent games */}
      {recentGames.length > 0 && (
        <Section
          title="Recent games"
          actionLabel="View all"
          onAction={() => navigate('/history')}
        >
          <div className="space-y-2">
            {recentGames.map((g) => (
              <RecentGameRow key={g.gameId} game={g} />
            ))}
          </div>
        </Section>
      )}

      {/* Friends */}
      <Section title="Friends">
        <FriendsPanel limit={5} />
      </Section>

      {/* Mini-leaderboard */}
      {top5.length > 0 && (
        <Section title="Top players">
          <div className="space-y-1">
            {top5.map((p, idx) => (
              <LeaderboardRow
                key={p.userId}
                position={idx + 1}
                entry={p}
                isMe={p.userId === user?.id}
              />
            ))}
            {!myInTop5 && myRank?.rank && (
              <>
                <div className="text-center text-xs text-gold-light/30 py-1">⋯</div>
                <LeaderboardRow
                  position={myRank.rank}
                  entry={{
                    userId: user?.id ?? '',
                    displayName,
                    gamesPlayed: myRank.gamesPlayed,
                    wins: myRank.wins,
                    winPct: myRank.winPct,
                    avgPlacement: myRank.avgPlacement,
                    earnedCredits: credits,
                  }}
                  isMe
                />
              </>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatChip({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: 'gold' | 'emerald' | 'cyan';
}) {
  const accentText =
    accent === 'gold' ? 'text-gold' : accent === 'emerald' ? 'text-emerald-300' : 'text-cyan-300';
  return (
    <div className="glass border border-gold/15 rounded-lg p-3 flex flex-col gap-1">
      <div className={`flex items-center gap-1.5 text-xs uppercase tracking-wide ${accentText}`}>
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold text-gold-light">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({
  title,
  children,
  actionLabel,
  onAction,
}: {
  title: string;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gold-light/60">{title}</h3>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="text-xs text-gold-light/60 hover:text-gold flex items-center gap-0.5"
          >
            {actionLabel}
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function RecentGameRow({ game }: { game: UserGameSummary }) {
  const placement = game.placement;
  const finishedAt = game.finishedAt ? new Date(game.finishedAt) : null;
  const placementBadge =
    placement === 1
      ? { label: '🏆 1st', cls: 'bg-gold/15 text-gold border-gold/40' }
      : placement === 2
      ? { label: '🥈 2nd', cls: 'bg-slate-400/15 text-slate-300 border-slate-400/40' }
      : placement === 3
      ? { label: '🥉 3rd', cls: 'bg-amber-700/15 text-amber-400 border-amber-700/40' }
      : placement
      ? { label: `#${placement}`, cls: 'bg-muted/30 text-muted-foreground border-muted/40' }
      : { label: '—', cls: 'bg-muted/20 text-muted-foreground border-muted/30' };

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-md glass border border-gold/10" data-testid={`recent-game-${game.gameId}`}>
      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${placementBadge.cls}`}>
        {placementBadge.label}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gold-light truncate">
          {game.scoringMethod === 'fullHand' ? 'Full Hand' : 'Round'} · {game.totalPlayers} players
        </div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
          <Clock className="w-3 h-3" />
          {finishedAt ? finishedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'in progress'}
          {game.declaredOut && <span className="text-gold/70">· declared out</span>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-mono font-semibold text-gold-light">{game.score ?? 0}</div>
        {game.earnedCredits > 0 && (
          <div className="text-[10px] text-emerald-400">+{game.earnedCredits} credits</div>
        )}
      </div>
    </div>
  );
}

function LeaderboardRow({
  position,
  entry,
  isMe,
}: {
  position: number;
  entry: LeaderboardEntry;
  isMe: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md ${
        isMe ? 'glass border border-gold/40 bg-gold/5' : ''
      }`}
      data-testid={`leaderboard-row-${entry.userId}`}
    >
      <span className="w-6 text-right text-xs font-mono text-gold-light/60">{position}</span>
      <span className="flex-1 text-sm text-gold-light truncate">
        {entry.displayName}
        {isMe && <span className="ml-1.5 text-[10px] text-gold">(you)</span>}
      </span>
      <span className="text-xs text-muted-foreground flex items-center gap-2">
        <span title={`${entry.wins} wins, ${entry.gamesPlayed} games`}>
          {entry.wins}W
        </span>
        <span className="text-gold/70" title="Total earned credits">
          {entry.earnedCredits.toLocaleString()}
        </span>
      </span>
    </div>
  );
}
