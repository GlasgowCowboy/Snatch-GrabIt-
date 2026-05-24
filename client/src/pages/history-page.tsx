import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { Link, useSearch } from 'wouter';
import { Badge } from '@/components/ui/badge';
import {
  Trophy, Medal, Sparkles, BarChart3, Crown,
  TrendingUp, CalendarDays, Users, ChevronLeft,
} from 'lucide-react';
import Logo from '@/components/Logo';
import AccountDropdown from '@/components/AccountDropdown';
import CreditBadge from '@/components/CreditBadge';
import ChipsBadge from '@/components/ChipsBadge';
import type { UserGameSummary, LeaderboardEntry } from '../../../server/storage';

type Tab = 'games' | 'leaderboard';

function placementLabel(n: number | null): string {
  if (!n) return '—';
  return n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : `#${n}`;
}

function placementColor(n: number | null): string {
  if (n === 1) return 'text-gold';
  if (n === 2) return 'text-slate-300';
  if (n === 3) return 'text-amber-600';
  return 'text-gold-light/60';
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── My Games tab ──────────────────────────────────────────────────────────────
function MyGames() {
  const { data: games = [], isLoading } = useQuery<UserGameSummary[]>({
    queryKey: ['/api/games/history'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gold-light/50">
        Loading your games…
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gold-light/50">
        <BarChart3 className="w-12 h-12 opacity-30" />
        <p>No games yet — finish your first game to see results here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {games.map((g, i) => (
        <div
          key={`${g.gameId}-${i}`}
          className="glass border border-gold/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
        >
          {/* Placement medal */}
          <div className={`text-3xl font-bold w-12 text-center shrink-0 ${placementColor(g.placement)}`}>
            {placementLabel(g.placement)}
          </div>

          {/* Game info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-semibold text-gold-light">
                {g.scoringMethod === 'fullHand' ? 'Full Hand' : 'Round'} · {g.targetScore} pts
              </span>
              <Badge variant="outline" className="text-xs border-gold/20 text-gold-light/50 gap-1">
                <Users className="w-3 h-3" />
                {g.totalPlayers} players
              </Badge>
              {g.declaredOut && (
                <Badge variant="secondary" className="text-xs">Declared Out</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gold-light/50">
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {formatDate(g.finishedAt)}
              </span>
              <span>
                Score: <strong className="text-gold-light/80">{g.score ?? '—'}</strong>
              </span>
            </div>
          </div>

          {/* Credits earned */}
          {g.earnedCredits > 0 && (
            <div className="flex items-center gap-1 text-sm font-semibold text-gold shrink-0">
              <Sparkles className="w-4 h-4" />
              +{g.earnedCredits} credits
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────
function Leaderboard() {
  const { user } = useAuth();
  const { data: leaders = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ['/api/leaderboard'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gold-light/50">
        Loading leaderboard…
      </div>
    );
  }

  if (leaders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gold-light/50">
        <Trophy className="w-12 h-12 opacity-30" />
        <p>No ranked players yet — be the first to finish a game!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="hidden sm:grid grid-cols-[2.5rem_1fr_4rem_4rem_4rem_5.5rem] gap-2 px-3 text-xs text-gold-light/40 uppercase tracking-wider mb-1">
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Games</span>
        <span className="text-right">Wins</span>
        <span className="text-right">Win%</span>
        <span className="text-right">Credits</span>
      </div>

      {leaders.map((entry, idx) => {
        const isMe = entry.userId === user?.id;
        return (
          <div
            key={entry.userId}
            className={`flex sm:grid sm:grid-cols-[2.5rem_1fr_4rem_4rem_4rem_5.5rem] gap-2 items-center px-3 py-3 rounded-lg border ${
              idx === 0
                ? 'bg-gradient-to-r from-gold/20 via-gold/10 to-transparent border-gold/40'
                : isMe
                ? 'glass border-cyan/30'
                : 'glass border-gold/10'
            }`}
          >
            {/* Rank */}
            <span className={`font-bold text-sm flex items-center justify-center w-6 ${idx === 0 ? 'text-gold' : 'text-gold-light/60'}`}>
              {idx === 0 ? <Crown className="w-4 h-4 text-gold" /> : idx + 1}
            </span>

            {/* Name */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={`font-semibold truncate ${isMe ? 'text-cyan-300' : 'text-gold-light'}`}>
                {entry.displayName}
                {isMe && <span className="text-xs text-cyan-400/70 ml-1">(you)</span>}
              </span>
            </div>

            {/* Stats — hidden on mobile, shown inline as badges */}
            <span className="hidden sm:block text-right text-sm text-gold-light/60">{entry.gamesPlayed}</span>
            <span className="hidden sm:block text-right text-sm font-semibold text-gold">{entry.wins}</span>
            <span className="hidden sm:block text-right text-sm text-gold-light/60">{entry.winPct}%</span>

            {/* Mobile compact stats */}
            <div className="flex sm:hidden items-center gap-2 text-xs text-gold-light/50 ml-auto">
              <span>{entry.wins}W / {entry.gamesPlayed}G</span>
            </div>

            <div className="hidden sm:flex items-center justify-end gap-1 text-sm text-gold">
              <Sparkles className="w-3 h-3" />
              {entry.earnedCredits.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const { user } = useAuth();
  const search = useSearch();
  const initialTab: Tab = new URLSearchParams(search).get('tab') === 'leaderboard' ? 'leaderboard' : 'games';
  const [tab, setTab] = useState<Tab>(initialTab);

  if (!user) {
    return (
      <div className="min-h-screen felt-bg flex items-center justify-center text-gold-light">
        <p>
          Please{' '}
          <Link href="/auth" className="underline text-gold">
            sign in
          </Link>{' '}
          to view your history.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen felt-bg p-4">
      {/* Top bar */}
      <div className="max-w-3xl mx-auto mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="flex items-center gap-1 text-gold-light/60 hover:text-gold transition-colors text-sm">
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          </Link>
          <Logo size={22} className="text-gold" />
          <span className="text-gold font-bold text-lg hidden sm:inline">Snatch&amp;GrabIt!</span>
        </div>
        <div className="flex items-center gap-2">
          <ChipsBadge />
          <CreditBadge />
          <AccountDropdown />
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-4">
        {/* Tab switcher */}
        <div className="glass-strong border border-gold/20 rounded-xl p-1 flex gap-1">
          <button
            onClick={() => setTab('games')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'games'
                ? 'bg-gold/20 text-gold border border-gold/30'
                : 'text-gold-light/50 hover:text-gold-light'
            }`}
          >
            <Medal className="w-4 h-4" />
            My Games
          </button>
          <button
            onClick={() => setTab('leaderboard')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'leaderboard'
                ? 'bg-gold/20 text-gold border border-gold/30'
                : 'text-gold-light/50 hover:text-gold-light'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Leaderboard
          </button>
        </div>

        {/* Tab content */}
        <div>
          {tab === 'games' ? <MyGames /> : <Leaderboard />}
        </div>
      </div>
    </div>
  );
}
