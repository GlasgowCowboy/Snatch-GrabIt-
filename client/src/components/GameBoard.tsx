import { useState } from 'react';
import { GameState, Card, Suit } from '@shared/schema';
import PlayerArea from './PlayerArea';
import FoundationArea from './FoundationArea';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Trophy, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface GameBoardProps {
  gameState: GameState;
  currentPlayerId: string;
  onLeaveGame?: () => void;
}

export default function GameBoard({
  gameState,
  currentPlayerId,
  onLeaveGame,
}: GameBoardProps) {
  const [selectedCard, setSelectedCard] = useState<{
    source: 'bone' | 'tableau' | 'draw';
    playerId: string;
    columnIndex?: number;
    cardIndex?: number;
  } | null>(null);
  const { toast } = useToast();

  const currentPlayer = gameState.players.find(p => p.id === currentPlayerId);
  const otherPlayers = gameState.players.filter(p => p.id !== currentPlayerId);
  const winner = gameState.players.find(p => p.id === gameState.winnerId);

  const handleCardClick = (
    source: 'bone' | 'tableau' | 'draw',
    playerId: string,
    columnIndex?: number,
    cardIndex?: number
  ) => {
    if (playerId !== currentPlayerId) return;

    if (selectedCard) {
      setSelectedCard(null);
      toast({
        title: "Card deselected",
        description: "Click another card to select it",
      });
    } else {
      setSelectedCard({ source, playerId, columnIndex, cardIndex });
      toast({
        title: "Card selected",
        description: "Click foundation or tableau to move (build down alternating colors on tableau)",
      });
    }
  };

  const handleTableauClick = (columnIndex: number) => {
    if (!selectedCard) {
      toast({
        title: "No card selected",
        description: "Select a card first by clicking on it",
      });
      return;
    }

    toast({
      title: "Move attempted",
      description: `Trying to play card to tableau column ${columnIndex + 1} (demo - full logic coming in implementation)`,
    });
    setSelectedCard(null);
  };

  const handleFoundationClick = (pileId: number) => {
    if (!selectedCard) {
      toast({
        title: "No card selected",
        description: "Select a card first by clicking on it",
      });
      return;
    }

    toast({
      title: "Move attempted",
      description: `Trying to play card to foundation pile #${pileId} (demo - full logic coming in implementation phase)`,
    });
    setSelectedCard(null);
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Snatch&GrabIt!</h1>
            {winner && (
              <Badge variant="default" className="flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                {winner.name} wins!
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Powered by AppSmith
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onLeaveGame}
            data-testid="button-leave-game"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Leave Game
          </Button>
        </div>

        <FoundationArea
          foundations={gameState.foundations}
          onFoundationClick={handleFoundationClick}
        />

        {currentPlayer && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Your Area</h2>
            <PlayerArea
              player={currentPlayer}
              isCurrentPlayer
              onBonePileClick={() => handleCardClick('bone', currentPlayerId)}
              onTableauCardClick={(col, card) =>
                handleCardClick('tableau', currentPlayerId, col, card)
              }
              onTableauColumnClick={handleTableauClick}
              onDrawCardClick={(index) => handleCardClick('draw', currentPlayerId, undefined, index)}
            />
          </div>
        )}

        {otherPlayers.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Other Players
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {otherPlayers.map((player) => (
                <PlayerArea
                  key={player.id}
                  player={player}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
