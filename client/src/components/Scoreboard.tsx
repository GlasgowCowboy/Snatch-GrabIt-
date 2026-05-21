import { memo } from 'react';
import { RoundResult, ScoringSettings } from '@shared/schema';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Trophy, Crown, Home } from 'lucide-react';
import SponsorBanner from './SponsorBanner';

interface ScoreboardProps {
  roundResults: RoundResult[];
  scoringSettings: ScoringSettings;
  onNextRound?: () => void;
  gameOver?: boolean;
  winnerId?: string;
}

function ScoreboardComponent({
  roundResults,
  scoringSettings,
  onNextRound,
  gameOver = false,
  winnerId,
}: ScoreboardProps) {
  const winner = roundResults.find(r => r.playerId === winnerId);
  const isFullHand = scoringSettings.method === 'fullHand';

  // Sort by total score descending
  const sortedResults = [...roundResults].sort((a, b) => b.totalScore - a.totalScore);

  // Explicitly render portal to body for guaranteed top-level rendering
  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
      role="dialog"
      aria-modal="true"
      data-testid="scoreboard-modal"
    >
      <div className="glass-strong border border-gold/30 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-auto">
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
        </div>

        <div className="p-6 space-y-6">
          {/* Scores Table */}
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
                  <div className="flex items-center gap-3">
                    <Badge variant={index === 0 ? 'default' : 'outline'} className={index === 0 ? 'badge-gold' : ''}>
                      #{index + 1}
                    </Badge>
                    <span className="font-bold text-lg text-gold-light">{result.playerName}</span>
                    {result.declaredOut && (
                      <Badge variant="secondary" className="text-xs">
                        Declared Out
                      </Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`text-3xl font-bold ${result.totalScore >= 0 ? 'text-gold' : 'text-red-400'}`} data-testid={`score-total-${result.playerId}`}>
                      {result.totalScore}
                    </div>
                    <div className="text-xs text-gold-light/50">Total Score</div>
                  </div>
                </div>

                {/* Score Breakdown */}
                <div className="mt-3 pt-3 border-t border-gold/10">
                  {isFullHand ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-gold-light/50">Foundation</div>
                        <div className="font-semibold text-cyan-light">
                          +{result.foundationCards}
                        </div>
                      </div>
                      <div>
                        <div className="text-gold-light/50">Bone Pile</div>
                        <div className="font-semibold text-red-400">
                          -{result.bonePileRemaining * 2}
                        </div>
                      </div>
                      {result.declaredOut && (
                        <div>
                          <div className="text-gold-light/50">Declared Out</div>
                          <div className="font-semibold text-cyan-light">
                            +5
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="text-gold-light/50">Round Score</div>
                        <div className={`font-bold ${
                          result.roundScore >= 0
                            ? 'text-gold'
                            : 'text-red-400'
                        }`}>
                          {result.roundScore >= 0 ? '+' : ''}{result.roundScore}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <div className="text-gold-light/50">Round Score</div>
                        <div className="font-bold text-gold">
                          {result.roundScore > 0 ? '+1' : '0'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Target Info */}
          <div className="p-4 glass rounded-lg text-center border border-gold/10">
            <div className="text-sm text-gold-light/60">
              {isFullHand
                ? `First to ${scoringSettings.targetScore} points wins!`
                : `First to ${scoringSettings.targetScore} rounds wins!`
              }
            </div>
          </div>

          {/* Sponsor Banner */}
          <SponsorBanner />

          {/* Action Button */}
          <div className="flex justify-center relative" style={{ zIndex: 10000 }}>
            {gameOver ? (
              <Button
                size="lg"
                onClick={onNextRound}
                data-testid="button-back-to-lobby"
                className="btn-gold pointer-events-auto cursor-pointer text-lg px-8 py-3 gap-2"
              >
                <Home className="w-5 h-5" />
                Back to Lobby
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={onNextRound}
                data-testid="button-next-round"
                className="btn-gold pointer-events-auto cursor-pointer text-lg px-8 py-3"
              >
                Next Round
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Wrap in memo to prevent unnecessary re-renders
export default memo(ScoreboardComponent);
