import { PlayerState } from '@shared/schema';
import CardPile from './CardPile';
import TableauColumn from './TableauColumn';
import DrawPileDisplay from './DrawPileDisplay';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface SelectedCard {
  source: 'bone' | 'tableau' | 'draw';
  playerId: string;
  columnIndex?: number;
  cardIndex?: number;
}

interface PlayerAreaProps {
  player: PlayerState;
  isCurrentPlayer?: boolean;
  /** True when this player's WS has dropped — shows a badge to other players. */
  isDisconnected?: boolean;
  bonePilePosition?: 'left' | 'right';
  onBonePileClick?: () => void;
  onTableauCardClick?: (columnIndex: number, cardIndex: number) => void;
  onTableauColumnClick?: (columnIndex: number) => void;
  onDrawCardClick?: (cardIndex: number) => void;
  onDrawPileClick?: () => void;
  selectedCard?: SelectedCard | null;
}

export default function PlayerArea({
  player,
  isCurrentPlayer = false,
  isDisconnected = false,
  bonePilePosition = 'left',
  onBonePileClick,
  onTableauCardClick,
  onTableauColumnClick,
  onDrawCardClick,
  onDrawPileClick,
  selectedCard,
}: PlayerAreaProps) {
  const isBonePileSelected = selectedCard?.source === 'bone' && selectedCard?.playerId === player.id;
  const selectedDrawIndex = selectedCard?.source === 'draw' && selectedCard?.playerId === player.id ? selectedCard.cardIndex : undefined;
  
  return (
    <div
      className={`
        ${isCurrentPlayer ? 'glass-strong rounded-xl p-4 border-2 border-gold/30 glow-gold' : 'glass rounded-xl p-4 border border-white/10'}
      `}
      data-testid={`player-area-${player.id}`}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gold/70">
          {isCurrentPlayer ? 'Your Area' : 'Player Area'}
        </h2>
        <div className="flex items-center gap-2">
          {isDisconnected && (
            <span
              className="text-[10px] uppercase font-bold tracking-wide px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"
              title="This player has lost their connection. The game will continue."
              data-testid={`player-disconnected-${player.id}`}
            >
              ● Offline
            </span>
          )}
          <span className="text-sm font-semibold" data-testid={`player-name-${player.id}`}>
            {player.name}
          </span>
        </div>
      </div>

      {/* Mobile Layout: Bone pile left, tableau right */}
      <div className="flex gap-3 md:hidden">
        {/* Bone Pile on left side - closer to foundations */}
        <div className="flex flex-col gap-1 items-center flex-shrink-0">
          <CardPile
            cards={player.bonePile}
            label="Bone"
            showCount
            onClick={onBonePileClick}
            cardBackImage={player.cardBackImage}
            isHighlighted={isBonePileSelected}
          />
          <div className="text-xs text-center text-gold/50 max-w-[70px]">
            Play top
          </div>
        </div>

        {/* Right side: Tableau and Draw pile stacked */}
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          {/* Tableau */}
          <div className="flex flex-col gap-1">
            <div className="relative py-4">
              <div className="flex gap-1 justify-start overflow-x-auto">
                {player.tableau.map((column, columnIndex) => {
                  const highlightedCardIndex = selectedCard?.source === 'tableau' && 
                                               selectedCard?.playerId === player.id && 
                                               selectedCard?.columnIndex === columnIndex
                                               ? selectedCard?.cardIndex
                                               : undefined;
                  return (
                    <div key={columnIndex} className="flex-shrink-0">
                      <TableauColumn
                        cards={column}
                        onCardClick={(cardIndex) =>
                          onTableauCardClick?.(columnIndex, cardIndex)
                        }
                        onEmptyClick={() => onTableauColumnClick?.(columnIndex)}
                        highlightedCardIndex={highlightedCardIndex}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="text-xs text-gold/50">
              Tableau
            </div>
          </div>

          {/* Draw Pile below tableau */}
          <div className="flex justify-end">
            <DrawPileDisplay
              cards={player.currentDraw}
              onCardClick={onDrawCardClick}
              highlightedIndex={selectedDrawIndex}
              drawPileCount={player.drawPile.length}
              cardBackImage={player.cardBackImage}
              onDrawPileClick={onDrawPileClick}
              isInteractive={isCurrentPlayer}
            />
          </div>
        </div>
      </div>

      {/* Desktop Layout: Horizontal */}
      <div className="hidden md:flex gap-4 items-start">
        {bonePilePosition === 'left' ? (
          <>
            <div className="flex flex-col gap-1">
              <CardPile
                cards={player.bonePile}
                label="Bone Pile"
                showCount
                onClick={onBonePileClick}
                cardBackImage={player.cardBackImage}
                isHighlighted={isBonePileSelected}
              />
              <div className="text-xs text-center text-gold/50 max-w-[80px]">
                (Face up - play top card)
              </div>
            </div>

            <div className="flex flex-col gap-1 flex-1">
              <div className="relative py-4">
                <div className="flex gap-2 justify-center">
                  {player.tableau.map((column, columnIndex) => {
                    const highlightedCardIndex = selectedCard?.source === 'tableau' && 
                                                 selectedCard?.playerId === player.id && 
                                                 selectedCard?.columnIndex === columnIndex
                                                 ? selectedCard?.cardIndex
                                                 : undefined;
                    return (
                      <div key={columnIndex}>
                        <TableauColumn
                          cards={column}
                          onCardClick={(cardIndex) =>
                            onTableauCardClick?.(columnIndex, cardIndex)
                          }
                          onEmptyClick={() => onTableauColumnClick?.(columnIndex)}
                          highlightedCardIndex={highlightedCardIndex}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="text-xs text-center text-gold/50">
                Tableau (Play bottom card only - move between columns)
                {selectedCard && selectedCard.playerId === player.id && (
                  <span className="block text-gold font-medium animate-pulse mt-1">
                    ↓ Click a column to move here
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 items-center">
              <DrawPileDisplay
                cards={player.currentDraw}
                onCardClick={onDrawCardClick}
                highlightedIndex={selectedDrawIndex}
                drawPileCount={player.drawPile.length}
                cardBackImage={player.cardBackImage}
                onDrawPileClick={onDrawPileClick}
                isInteractive={isCurrentPlayer}
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1 flex-1">
              <div className="relative py-4">
                <div className="flex gap-2 justify-center">
                  {player.tableau.map((column, columnIndex) => {
                    const highlightedCardIndex = selectedCard?.source === 'tableau' && 
                                                 selectedCard?.playerId === player.id && 
                                                 selectedCard?.columnIndex === columnIndex
                                                 ? selectedCard?.cardIndex
                                                 : undefined;
                    return (
                      <div key={columnIndex}>
                        <TableauColumn
                          cards={column}
                          onCardClick={(cardIndex) =>
                            onTableauCardClick?.(columnIndex, cardIndex)
                          }
                          onEmptyClick={() => onTableauColumnClick?.(columnIndex)}
                          highlightedCardIndex={highlightedCardIndex}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="text-xs text-center text-gold/50">
                Tableau (Play bottom card only - move between columns)
                {selectedCard && selectedCard.playerId === player.id && (
                  <span className="block text-gold font-medium animate-pulse mt-1">
                    ↓ Click a column to move here
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <CardPile
                cards={player.bonePile}
                label="Bone Pile"
                showCount
                onClick={onBonePileClick}
                cardBackImage={player.cardBackImage}
                isHighlighted={isBonePileSelected}
              />
              <div className="text-xs text-center text-gold/50 max-w-[80px]">
                (Face up - play top card)
              </div>
            </div>

            <div className="flex flex-col gap-2 items-center">
              <DrawPileDisplay
                cards={player.currentDraw}
                onCardClick={onDrawCardClick}
                highlightedIndex={selectedDrawIndex}
                drawPileCount={player.drawPile.length}
                cardBackImage={player.cardBackImage}
                onDrawPileClick={onDrawPileClick}
                isInteractive={isCurrentPlayer}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
