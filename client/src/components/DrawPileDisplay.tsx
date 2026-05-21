import { Card } from '@shared/schema';
import PlayingCard from './PlayingCard';

interface DrawPileDisplayProps {
  cards: Card[];
  onCardClick?: (cardIndex: number) => void;
  highlightedIndex?: number;
  drawPileCount?: number;
  cardBackImage?: string;
  onDrawPileClick?: () => void;
  isInteractive?: boolean;
}

export default function DrawPileDisplay({
  cards,
  onCardClick,
  highlightedIndex,
  drawPileCount = 0,
  cardBackImage,
  onDrawPileClick,
  isInteractive = true,
}: DrawPileDisplayProps) {
  const topCard = cards.length > 0 ? cards[cards.length - 1] : null;
  
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs font-medium text-gold">
        Draw Pile
      </div>
      <div className="flex gap-2">
        {/* Face-down draw pile */}
        {drawPileCount > 0 ? (
          <div className={`flex flex-col items-center gap-1 ${!isInteractive ? 'opacity-50' : ''}`}>
            <PlayingCard
              faceDown
              cardBackImage={cardBackImage}
              onClick={isInteractive ? onDrawPileClick : undefined}
              disabled={!isInteractive}
            />
            {isInteractive && onDrawPileClick && (
              <div className="text-xs text-gold/40 text-center">
                Click to turn 3
              </div>
            )}
          </div>
        ) : cards.length > 0 && onDrawPileClick ? (
          <div className={`flex flex-col items-center gap-1 ${!isInteractive ? 'opacity-50' : ''}`}>
            <PlayingCard
              isEmpty
              onClick={isInteractive ? onDrawPileClick : undefined}
              disabled={!isInteractive}
            />
            {isInteractive && (
              <div className="text-xs text-gold/40 text-center">
                Click to reset
              </div>
            )}
          </div>
        ) : null}
        
        {/* Face-up top card */}
        {topCard ? (
          <PlayingCard
            key={`${topCard.id}-flip`}
            card={topCard}
            onClick={() => onCardClick?.(cards.length - 1)}
            isHighlighted={highlightedIndex === cards.length - 1}
            animationType="flip"
          />
        ) : !drawPileCount ? (
          <PlayingCard isEmpty />
        ) : null}
      </div>
      {cards.length > 0 && (
        <div className="text-xs text-gold/40">
          (Top card only)
        </div>
      )}
    </div>
  );
}
