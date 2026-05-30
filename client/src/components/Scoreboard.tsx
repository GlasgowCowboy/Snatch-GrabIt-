import { memo, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { RoundResult, ScoringSettings } from '@shared/schema';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Trophy, Crown, Home, Sparkles, TrendingUp, LogOut } from 'lucide-react';
import SponsorBanner from './SponsorBanner';
import BetResultsPanel from './BetResultsPanel';
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';

interface RankData {
  rank: number | null;
  totalPlayers: number;
  wins: number;
  gamesPlayed: number;
  winPct: number;
  avgPlacement: number;
}

interface ScoreboardProps {
  roundResults: RoundResult[];
  scoringSettings: ScoringSettings;
  onNextRound?: () => void;
  /** Step out of the game cleanly. Shown between rounds + on game-over. */
  onLeaveGame?: () => void;
  gameOver?: boolean;
  winnerId?: string;
  gameDbId?: string;
}

function ScoreboardComponent({
  roundResults,
  scoringSettings,
  onNextRound,
  onLeaveGame,
  gameOver = false,
  winnerId,
  gameDbId,
}: ScoreboardProps) {
  const { user } = useAuth();
  const winner = roundResults.find(r => r.playerId === winnerId);
  const isFullHand = scoringSettings.method === 'fullHand';
  const sortedResults = [...roundResults].sort((a, b) => b.totalScore - a.totalScore);
  const hasConfettiFired = useRef(false);
  const hasRoundConfettiFired = useRef(false);

  // Fetch the authenticated player's updated global rank after game ends
  const { data: rankData } = useQuery<RankData>({
    queryKey: ['/api/leaderboard/my-rank'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user && gameOver,
    refetchOnMount: true,
    staleTime: 0,
  });

  // Fire confetti once when the winner's scoreboard appears (game over).
  useEffect(() => {
    if (!gameOver || hasConfettiFired.current) return;
    hasConfettiFired.current = true;

    const end = Date.now() + 2500;
    const colors = ['#f5c542', '#e2a300', '#ffffff', '#ffe87c'];

    (function frame() {
      confetti({
        particleCount: 6,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
        zIndex: 10100,
      });
      confetti({
        particleCount: 6,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
        zIndex: 10100,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }, [gameOver]);

  // Smaller confetti burst on round-end declare-out (between rounds). Lighter
  // than game-over so it doesn't feel out of proportion to the moment.
  useEffect(() => {
    if (gameOver || hasRoundConfettiFired.current) return;
    const declarer = roundResults.find((r) => r.declaredOut);
    if (!declarer) return;
    hasRoundConfettiFired.current = true;
    confetti({
      particleCount: 40,
      spread: 70,
      origin: { y: 0.4 },
      colors: ['#f5c542', '#ffd700', '#ffffff'],
      zIndex: 10100,
    });
  }, [gameOver, roundResults]);

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
      role="dialog"
      aria-modal="true"
      data-testid="scoreboard-modal"
    >
      <div className="glass-strong border border-gold/30 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-auto">
        {/* ── Header ── */}
        <div className="p-6 pb-0 text-center">
          <h2 className="text-3xl font-bold text-center flex items-center justify-center gap-3 text-gradient-gold">
            {gameOver ? (
              <>
                <Crown className="w-8 h-8 text-gold" />
                Game Over!
              </>
            ) : (
              <>
                <Trophy className="w-8 h-8 text-gold" />
                Round Complete!
              </>
            )}
          </h2>
          <p className="text-center text-lg text-gold-light/70 mt-2">
            {gameOver
              ? `${winner?.playerName} wins the game!`
              : `${roundResults.find(r => r.declaredOut)?.playerName} declared out!`
            }
          </p>

          {/* Global rank pill — shown only to authenticated players after game ends */}
          {gameOver && rankData && rankData.rank != null && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <div className="flex items-center gap-2 px-4 py-2 glass rounded-full border border-gold/20 text-sm">
                <TrendingUp className="w-4 h-4 text-gold" />
                <span className="text-gold-light/70">Global rank</span>
                <span className="font-bold text-gold">
                  #{rankData.rank}
                </span>
                <span className="text-gold-light/40">of {rankData.totalPlayers}</span>
                <span className="text-gold-light/40">·</span>
                <span className="text-gold-light/70">{rankData.wins}W / {rankData.gamesPlayed}G</span>
                <span className="text-gold-light/40">·</span>
                <span className="text-gold-light/70">{rankData.winPct}% wins</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 space-y-6">
          {/* ── Scores Table ── */}
          <div className="space-y-3">
            {sortedResults.map((result, index) => (
              <div
                key={result.playerId}
                className={`p-4 rounded-lg border ${
                  result.playerId === winnerId
                    ? 'bg-gradient-to-r from-gold/20 via-gold/10 to-transparent border-gold/40'
                    : 'glass border-gold/10'
                }`}
                data-testid={`scoreboard-player-${result.playerId}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant={index === 0 ? 'default' : 'outline'} className={index === 0 ? 'badge-gold' : ''}>
                      #{index + 1}
                    </Badge>
                    <span className="font-bold text-lg text-gold-light">{result.playerName}</span>
                    {result.declaredOut && (
                      <Badge variant="secondary" className="text-xs">
                        Declared Out
                      </Badge>
                    )}
                    {gameOver && result.creditsEarned != null && result.creditsEarned > 0 && (
                      <Badge
                        variant="outline"
                        className="border-gold/50 text-gold-light gap-1 text-xs animate-pulse"
                        title="Earned credits added to your balance"
                      >
                        <Sparkles className="w-3 h-3 text-gold" />
                        +{result.creditsEarned} credits
                      </Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-3xl font-bold ${result.totalScore >= 0 ? 'text-gold' : 'text-red-400'}`}
                      data-testid={`score-total-${result.playerId}`}
                    >
                      {result.totalScore}
                    </div>
                    <div className="text-xs text-gold-light/50">Total Score</div>
                  </div>
                </div>

                {/* Progress bar towards the game target — visceral sense of
                    how close everyone is to winning. fullHand games race to
                    a positive score; round games race to a number of rounds
                    won so the bar maps the running roundScore→target. */}
                <div className="mb-2">
                  {(() => {
                    const target = scoringSettings.targetScore;
                    const pct = Math.max(0, Math.min(100, (result.totalScore / target) * 100));
                    const won = result.totalScore >= target;
                    return (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-gold-light/50">
                          <span>Toward {target}</span>
                          <span>{Math.round(pct)}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gold/10 overflow-hidden">
                          <div
                            className={`h-full transition-all ${won ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-gold/70 to-gold'}`}
                            style={{ width: `${pct}%` }}
                            data-testid={`progress-${result.playerId}`}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Score Breakdown */}
                <div className="mt-3 pt-3 border-t border-gold/10">
                  {isFullHand ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-gold-light/50">Foundation</div>
                        <div className="font-semibold text-cyan-light">+{result.foundationCards}</div>
                      </div>
                      <div>
                        <div className="text-gold-light/50">Bone Pile</div>
                        <div className="font-semibold text-red-400">-{result.bonePileRemaining * 2}</div>
                      </div>
                      {result.declaredOut && (
                        <div>
                          <div className="text-gold-light/50">Declared Out</div>
                          <div className="font-semibold text-cyan-light">+5</div>
                        </div>
                      )}
                      <div>
                        <div className="text-gold-light/50">Round Score</div>
                        <div className={`font-bold ${result.roundScore >= 0 ? 'text-gold' : 'text-red-400'}`}>
                          {result.roundScore >= 0 ? '+' : ''}{result.roundScore}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <div className="text-gold-light/50">Round Score</div>
                        <div className="font-bold text-gold">{result.roundScore > 0 ? '+1' : '0'}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Target Info ── */}
          <div className="p-4 glass rounded-lg text-center border border-gold/10">
            <div className="text-sm text-gold-light/60">
              {isFullHand
                ? `First to ${scoringSettings.targetScore} points wins!`
                : `First to ${scoringSettings.targetScore} rounds wins!`}
            </div>
          </div>

          {/* ── Bet results (game-over only) ── */}
          {gameOver && gameDbId && (
            <div className="p-4 glass rounded-lg border border-cyan/10">
              <BetResultsPanel gameDbId={gameDbId} />
            </div>
          )}

          {/* ── Sponsor Banner ── */}
          <SponsorBanner />

          {/* ── Action buttons ── */}
          <div className="relative" style={{ zIndex: 10000 }}>
            {gameOver ? (
              <div className="flex flex-col items-center gap-2">
                <Button
                  size="lg"
                  onClick={onNextRound}
                  data-testid="button-back-to-lobby"
                  className="btn-gold pointer-events-auto cursor-pointer text-lg px-8 py-3 gap-2"
                >
                  <Home className="w-5 h-5" />
                  Back to home
                </Button>
                <p className="text-xs text-gold-light/30">Review your results above before leaving</p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pointer-events-auto">
                {/* Leaving between rounds shouldn't be hidden behind a "X" —
                    surface it as a real choice next to Next Round. */}
                {onLeaveGame && (
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={onLeaveGame}
                    data-testid="button-leave-game-from-scoreboard"
                    className="glass border-white/15 text-gold-light/80 hover:border-gold/30 hover:bg-gold/5 gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Leave game
                  </Button>
                )}
                <Button
                  size="lg"
                  onClick={onNextRound}
                  data-testid="button-next-round"
                  className="btn-gold cursor-pointer text-lg px-8 py-3"
                >
                  Next round
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(ScoreboardComponent);
