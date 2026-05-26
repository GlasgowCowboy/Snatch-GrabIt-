import { useState, useEffect, useCallback } from 'react';
import { Card, UserProfile } from '@shared/schema';
import { GameMove, NEW_FOUNDATION_INDEX } from '@shared/gameEngine';
import PlayerArea from './PlayerArea';
import PlayingCard from './PlayingCard';
import FoundationArea from './FoundationArea';
import Scoreboard from './Scoreboard';
import GameChat from './GameChat';
import ScoreboardTicker from './ScoreboardTicker';
import AccountDropdown from './AccountDropdown';
import ThemeToggle from './ThemeToggle';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Trophy, LogOut, MessageSquare, Wifi, WifiOff, Flame } from 'lucide-react';
import Logo from './Logo';
import CreditBadge from './CreditBadge';
import ChipsBadge from './ChipsBadge';
import SponsorBadge from './SponsorBadge';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import type { GameState } from '@shared/schema';
import type { ConnectionState } from '@/hooks/use-game-sync';
import { useMousePosition } from '@/hooks/use-mouse-position';

interface GameBoardInteractiveProps {
  gameState: GameState;
  currentPlayerId: string;
  connectionState: ConnectionState;
  /** Other-player presence — playerIds whose WS is currently dropped. */
  disconnectedPlayerIds?: string[];
  sendMove: (move: GameMove) => void;
  sendChat: (message: string) => void;
  sendNextRound: () => void;
  onLeaveGame?: () => void;
  gameDbId?: string;
}

export default function GameBoardInteractive({
  gameState,
  currentPlayerId,
  connectionState,
  disconnectedPlayerIds = [],
  sendMove,
  sendChat,
  sendNextRound,
  onLeaveGame,
  gameDbId,
}: GameBoardInteractiveProps) {
  const { toast } = useToast();

  const [selectedCard, setSelectedCard] = useState<{
    source: 'bone' | 'tableau' | 'draw';
    playerId: string;
    columnIndex?: number;
    cardIndex?: number;
  } | null>(null);
  const [showTutorial, setShowTutorial] = useState(true);

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['/api/profile'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const effectiveState = gameState;
  const currentPlayer = effectiveState.players.find((p) => p.id === currentPlayerId);
  const otherPlayers = effectiveState.players.filter((p) => p.id !== currentPlayerId);
  const winner = effectiveState.players.find((p) => p.id === effectiveState.winnerId);
  const canDeclareOut = currentPlayer?.bonePile.length === 0 && effectiveState.status === 'playing';
  // New burn is per-player: enabled when a draw card is selected (that's the
  // card you're choosing to push to the bottom of the pile to unstick the flip).
  const canBurnSelectedDraw =
    effectiveState.status === 'playing' &&
    !!selectedCard &&
    selectedCard.source === 'draw' &&
    selectedCard.playerId === currentPlayerId;

  useEffect(() => {
    if (showTutorial && effectiveState.status === 'playing') {
      toast({
        title: 'How to Play',
        description:
          "Click any card (glows yellow), then click destination to move it. Build foundations (A-K same suit) or tableau (descending, alternating colors)!",
        duration: 10000,
      });
      setShowTutorial(false);
    }
  }, [effectiveState.status, showTutorial, toast]);

  // Clear stale selection if the underlying state changes (e.g. another player moved)
  useEffect(() => {
    if (!selectedCard) return;
    const player = effectiveState.players.find((p) => p.id === selectedCard.playerId);
    if (!player) {
      setSelectedCard(null);
      return;
    }
    if (selectedCard.source === 'bone' && player.bonePile.length === 0) {
      setSelectedCard(null);
    }
  }, [effectiveState, selectedCard]);

  const handleDeclareOut = useCallback(() => {
    sendMove({ type: 'declare-out' });
  }, [sendMove]);

  const handleTableauClick = useCallback(
    (columnIndex: number) => {
      if (!selectedCard) return;
      if (selectedCard.source === 'tableau' && selectedCard.columnIndex === columnIndex) return;

      let move: GameMove | null = null;
      if (selectedCard.source === 'bone') {
        move = { type: 'bone-to-tableau', targetColumn: columnIndex };
      } else if (
        selectedCard.source === 'tableau' &&
        selectedCard.columnIndex !== undefined &&
        selectedCard.cardIndex !== undefined
      ) {
        move = {
          type: 'tableau-to-tableau',
          sourceColumn: selectedCard.columnIndex,
          cardIndex: selectedCard.cardIndex,
          targetColumn: columnIndex,
        };
      } else if (selectedCard.source === 'draw' && selectedCard.cardIndex !== undefined) {
        move = {
          type: 'draw-to-tableau',
          drawCardIndex: selectedCard.cardIndex,
          targetColumn: columnIndex,
        };
      }
      if (!move) return;

      sendMove(move);
      setSelectedCard(null);
    },
    [selectedCard, sendMove],
  );

  const handleCardClick = useCallback(
    (source: 'bone' | 'tableau' | 'draw', playerId: string, columnIndex?: number, cardIndex?: number) => {
      if (playerId !== currentPlayerId) return;

      const player = effectiveState.players.find((p) => p.id === playerId);
      if (!player) return;

      let clickedCard: Card | undefined;
      if (source === 'bone' && player.bonePile.length > 0) {
        clickedCard = player.bonePile[player.bonePile.length - 1];
      } else if (source === 'tableau' && columnIndex !== undefined && cardIndex !== undefined) {
        const column = player.tableau[columnIndex];
        if (cardIndex < column.length) clickedCard = column[cardIndex];
      } else if (source === 'draw' && cardIndex !== undefined) {
        clickedCard = player.currentDraw[cardIndex];
      }

      const isSameCard =
        selectedCard &&
        selectedCard.source === source &&
        selectedCard.playerId === playerId &&
        selectedCard.columnIndex === columnIndex &&
        selectedCard.cardIndex === cardIndex;

      // Ace shortcut: clicking an Ace with nothing else selected auto-plays it
      // to a new foundation pile (Aces can always start a new pile). Saves the
      // extra click on the "new foundation" slot.
      if (clickedCard?.rank === 'A' && !selectedCard) {
        if (source === 'bone') {
          sendMove({ type: 'bone-to-foundation', foundationIndex: NEW_FOUNDATION_INDEX });
          return;
        }
        if (source === 'tableau' && columnIndex !== undefined && cardIndex !== undefined) {
          const column = player.tableau[columnIndex];
          // Only the top card of a tableau column can play to foundation.
          if (cardIndex === column.length - 1) {
            sendMove({
              type: 'tableau-to-foundation',
              sourceColumn: columnIndex,
              cardIndex,
              foundationIndex: NEW_FOUNDATION_INDEX,
            });
            return;
          }
        }
        if (source === 'draw' && cardIndex !== undefined) {
          sendMove({ type: 'draw-to-foundation', drawCardIndex: cardIndex, foundationIndex: NEW_FOUNDATION_INDEX });
          return;
        }
      }

      if (isSameCard) {
        setSelectedCard(null);
      } else if (selectedCard && source === 'tableau' && columnIndex !== undefined) {
        handleTableauClick(columnIndex);
      } else if (clickedCard && source === 'bone' && !selectedCard) {
        const emptyColumnIndex = player.tableau.findIndex((col) => col.length === 0);
        if (emptyColumnIndex !== -1) {
          sendMove({ type: 'bone-to-tableau', targetColumn: emptyColumnIndex });
        } else {
          setSelectedCard({ source, playerId, columnIndex, cardIndex });
        }
      } else if (clickedCard) {
        setSelectedCard({ source, playerId, columnIndex, cardIndex });
      }
    },
    [effectiveState, selectedCard, currentPlayerId, sendMove, handleTableauClick],
  );

  const handleFoundationClick = useCallback(
    (pileIndex: number) => {
      if (!selectedCard) return;
      const player = effectiveState.players.find((p) => p.id === selectedCard.playerId);
      if (!player) return;

      let move: GameMove | null = null;
      if (selectedCard.source === 'bone') {
        move = { type: 'bone-to-foundation', foundationIndex: pileIndex };
      } else if (
        selectedCard.source === 'tableau' &&
        selectedCard.columnIndex !== undefined &&
        selectedCard.cardIndex !== undefined
      ) {
        const column = player.tableau[selectedCard.columnIndex];
        if (selectedCard.cardIndex !== column.length - 1) {
          toast({
            title: 'Invalid move',
            description: 'Can only play single cards to foundation (not stacks)',
            variant: 'destructive',
          });
          return;
        }
        move = {
          type: 'tableau-to-foundation',
          sourceColumn: selectedCard.columnIndex,
          cardIndex: selectedCard.cardIndex,
          foundationIndex: pileIndex,
        };
      } else if (selectedCard.source === 'draw' && selectedCard.cardIndex !== undefined) {
        move = { type: 'draw-to-foundation', drawCardIndex: selectedCard.cardIndex, foundationIndex: pileIndex };
      }

      if (!move) return;
      sendMove(move);
      setSelectedCard(null);
    },
    [selectedCard, effectiveState, sendMove, toast],
  );

  const handleFoundationAreaClick = useCallback(() => {
    if (!selectedCard) return;
    const player = effectiveState.players.find((p) => p.id === selectedCard.playerId);
    if (!player) return;

    let card: Card | undefined;
    if (selectedCard.source === 'bone' && player.bonePile.length > 0) {
      card = player.bonePile[player.bonePile.length - 1];
    } else if (
      selectedCard.source === 'tableau' &&
      selectedCard.columnIndex !== undefined &&
      selectedCard.cardIndex !== undefined
    ) {
      const column = player.tableau[selectedCard.columnIndex];
      if (selectedCard.cardIndex !== column.length - 1) {
        toast({
          title: 'Invalid move',
          description: 'Can only play single cards to foundation (not stacks)',
          variant: 'destructive',
        });
        return;
      }
      card = column[selectedCard.cardIndex];
    } else if (selectedCard.source === 'draw' && selectedCard.cardIndex !== undefined) {
      card = player.currentDraw[selectedCard.cardIndex];
    }

    if (!card) return;

    let move: GameMove;
    if (card.rank === 'A') {
      if (selectedCard.source === 'bone') {
        move = { type: 'bone-to-foundation', foundationIndex: -1 };
      } else if (selectedCard.source === 'tableau') {
        move = {
          type: 'tableau-to-foundation',
          sourceColumn: selectedCard.columnIndex!,
          cardIndex: selectedCard.cardIndex!,
          foundationIndex: -1,
        };
      } else {
        move = { type: 'draw-to-foundation', drawCardIndex: selectedCard.cardIndex!, foundationIndex: -1 };
      }
    } else {
      let foundIndex = -1;
      const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      for (let i = 0; i < effectiveState.foundations.length; i++) {
        const topCards = effectiveState.foundations[i].cards;
        const topCard = topCards[topCards.length - 1];
        if (card.suit === topCard.suit && ranks.indexOf(card.rank) === ranks.indexOf(topCard.rank) + 1) {
          foundIndex = i;
          break;
        }
      }
      if (foundIndex === -1) {
        toast({
          title: 'Invalid move',
          description: "Can't play that card on any foundation",
          variant: 'destructive',
        });
        return;
      }
      if (selectedCard.source === 'bone') {
        move = { type: 'bone-to-foundation', foundationIndex: foundIndex };
      } else if (selectedCard.source === 'tableau') {
        move = {
          type: 'tableau-to-foundation',
          sourceColumn: selectedCard.columnIndex!,
          cardIndex: selectedCard.cardIndex!,
          foundationIndex: foundIndex,
        };
      } else {
        move = { type: 'draw-to-foundation', drawCardIndex: selectedCard.cardIndex!, foundationIndex: foundIndex };
      }
    }

    sendMove(move);
    setSelectedCard(null);
  }, [selectedCard, effectiveState, sendMove, toast]);

  const handleBonePileClick = useCallback(() => {
    handleCardClick('bone', currentPlayerId);
  }, [handleCardClick, currentPlayerId]);

  const handleTableauCardClick = useCallback(
    (col: number, card: number) => {
      handleCardClick('tableau', currentPlayerId, col, card);
    },
    [handleCardClick, currentPlayerId],
  );

  const handleDrawCardClick = useCallback(
    (index: number) => {
      handleCardClick('draw', currentPlayerId, undefined, index);
    },
    [handleCardClick, currentPlayerId],
  );

  const handleDrawPileClick = useCallback(() => {
    sendMove({ type: 'draw-pile' });
    setSelectedCard(null);
  }, [sendMove]);

  const handleNextRound = useCallback(() => {
    setSelectedCard(null);
    if (effectiveState.status === 'gameOver') {
      onLeaveGame?.();
      return;
    }
    sendNextRound();
  }, [effectiveState.status, onLeaveGame, sendNextRound]);

  const handleSendMessage = (message: string) => {
    sendChat(message);
  };

  const shouldShowScoreboard =
    (effectiveState.status === 'roundEnded' || effectiveState.status === 'gameOver') && effectiveState.roundResults;

  // Resolve the selectedCard descriptor to the actual Card object so we can
  // render a ghost copy pinned to the cursor.
  const ghostCard: Card | undefined = (() => {
    if (!selectedCard) return undefined;
    const player = effectiveState.players.find((p) => p.id === selectedCard.playerId);
    if (!player) return undefined;
    if (selectedCard.source === 'bone') {
      return player.bonePile[player.bonePile.length - 1];
    }
    if (
      selectedCard.source === 'tableau' &&
      selectedCard.columnIndex !== undefined &&
      selectedCard.cardIndex !== undefined
    ) {
      return player.tableau[selectedCard.columnIndex]?.[selectedCard.cardIndex];
    }
    if (selectedCard.source === 'draw' && selectedCard.cardIndex !== undefined) {
      return player.currentDraw[selectedCard.cardIndex];
    }
    return undefined;
  })();
  const mouse = useMousePosition(ghostCard !== undefined);

  return (
    <div className="min-h-screen felt-bg p-4">
      {ghostCard && mouse && (
        <div
          className="fixed pointer-events-none z-[9998] opacity-90"
          style={{
            // Offset slightly so the cursor sits at the top-left of the card,
            // not dead-center where it would block view of the destination.
            left: mouse.x + 12,
            top: mouse.y + 12,
            transform: 'rotate(-4deg)',
          }}
          data-testid="ghost-card"
        >
          <PlayingCard card={ghostCard} className="shadow-2xl ring-2 ring-yellow-400/80" />
        </div>
      )}
      {shouldShowScoreboard && (
        <Scoreboard
          roundResults={effectiveState.roundResults!}
          scoringSettings={effectiveState.scoringSettings}
          onNextRound={handleNextRound}
          gameOver={effectiveState.status === 'gameOver'}
          winnerId={effectiveState.winnerId}
          gameDbId={gameDbId}
        />
      )}
      <div className="max-w-7xl mx-auto space-y-4">
        <ScoreboardTicker
          players={effectiveState.players}
          scoringMethod={effectiveState.scoringSettings.method}
        />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 glass rounded-xl p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Logo size={26} className="text-gold" />
            <h1 className="text-xl md:text-2xl font-bold text-gradient-gold">Snatch&GrabIt!</h1>
            <SponsorBadge />
            {winner && (
              <Badge variant="default" className="flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                {winner.name} wins!
              </Badge>
            )}
            <span className="text-xs text-gold/40 hidden md:inline">Powered by AppSmith</span>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {connectionState !== 'open' && (
              <Badge
                variant="outline"
                className="border-amber-500/40 text-amber-300 flex items-center gap-1"
                data-testid="badge-connection-state"
              >
                {connectionState === 'reconnecting' ? (
                  <>
                    <WifiOff className="w-3 h-3" />
                    Reconnecting…
                  </>
                ) : connectionState === 'connecting' ? (
                  <>
                    <Wifi className="w-3 h-3" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3" />
                    Disconnected
                  </>
                )}
              </Badge>
            )}
            <ChipsBadge />
            <CreditBadge />
            <ThemeToggle />
            <AccountDropdown />
            {canDeclareOut && (
              <Button size="sm" onClick={handleDeclareOut} data-testid="button-declare-out" className="btn-gold">
                <Trophy className="w-4 h-4 mr-2" />
                Declare Out!
              </Button>
            )}
            {canBurnSelectedDraw && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (selectedCard?.source !== 'draw' || selectedCard.cardIndex === undefined) return;
                  sendMove({ type: 'burn-draw-card', drawCardIndex: selectedCard.cardIndex });
                  setSelectedCard(null);
                }}
                data-testid="button-burn-draw-card"
                className="border-orange-500/40 text-orange-300 hover:bg-orange-500/10"
                title="Move the selected draw card to the bottom of your draw pile (skips one card too, so your next flip-3 is different)."
              >
                <Flame className="w-4 h-4 mr-2" />
                Burn
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onLeaveGame}
              data-testid="button-leave-game"
              className="glass border-white/10 hover:border-gold/30"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Leave Game
            </Button>
          </div>
        </div>

        {/* Two-column layout at lg+: game on the left, chat as a sticky side panel
            on the right. Below lg the chat drops underneath the player area in
            natural document flow so mobile users get the full board width. */}
        <div className="lg:flex lg:gap-4 lg:items-start">
          {/* Game column */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Sticky on mobile so the foundations are always reachable as a
                drop target, even when the player has scrolled down to interact
                with their bone pile / tableau / draw row. Drops back to normal
                flow at lg+ where the whole board fits in the viewport. */}
            <div className="sticky top-0 z-30 -mx-4 px-4 py-2 bg-background/85 backdrop-blur-sm lg:static lg:bg-transparent lg:backdrop-blur-none lg:mx-0 lg:px-0 lg:py-0">
              <FoundationArea
                foundations={effectiveState.foundations}
                onFoundationClick={handleFoundationClick}
                onFoundationAreaClick={handleFoundationAreaClick}
                showMoveHint={selectedCard !== null}
              />
            </div>

            {currentPlayer && (
              <PlayerArea
                player={currentPlayer}
                isCurrentPlayer
                bonePilePosition={(profile?.bonePilePosition as 'left' | 'right') || 'left'}
                selectedCard={selectedCard}
                onBonePileClick={handleBonePileClick}
                onTableauCardClick={handleTableauCardClick}
                onTableauColumnClick={handleTableauClick}
                onDrawCardClick={handleDrawCardClick}
                onDrawPileClick={handleDrawPileClick}
              />
            )}

            {otherPlayers.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground">Other Players</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {otherPlayers.map((player) => (
                    <PlayerArea
                      key={player.id}
                      player={player}
                      isDisconnected={disconnectedPlayerIds.includes(player.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chat side rail (sticky on lg+, stacks naturally below on smaller widths) */}
          {currentPlayer && (
            <aside
              className="mt-4 lg:mt-0 lg:w-[340px] lg:shrink-0 lg:sticky lg:top-4 lg:self-start"
              data-testid="chat-side-rail"
            >
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Chat
                </h2>
                <div
                  className="glass border border-gold/10 rounded-lg p-4 h-[350px] lg:h-[calc(100vh-8rem)] lg:max-h-[640px]"
                  data-testid="chat-container"
                >
                  <GameChat
                    messages={effectiveState.chatMessages || []}
                    currentPlayerId={currentPlayerId}
                    currentPlayerName={currentPlayer?.name || 'Unknown'}
                    onSendMessage={handleSendMessage}
                  />
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
