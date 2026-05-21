import { Suit, Card } from '@shared/schema';
import FoundationPile from './FoundationPile';

interface FoundationPileData {
  suit: Suit;
  cards: Card[];
}

interface FoundationAreaProps {
  foundations: FoundationPileData[];
  onFoundationClick?: (pileIndex: number) => void;
  onFoundationAreaClick?: () => void;
  highlightedPileIndex?: number;
  showMoveHint?: boolean;
}

export default function FoundationArea({
  foundations,
  onFoundationClick,
  onFoundationAreaClick,
  highlightedPileIndex,
  showMoveHint = false,
}: FoundationAreaProps) {
  return (
    <div className="glass-strong rounded-xl p-6 border border-gold/20">
      <h2 className="text-sm font-semibold text-center mb-4 text-gold/80">
        Foundation Piles (Shared - Build Ace to King by Suit)
      </h2>
      {showMoveHint && (
        <div className="text-center mb-2 text-xs text-gold font-medium animate-pulse">
          ↑ Click a foundation pile or empty space to move your selected card
        </div>
      )}
      <div 
        className="flex gap-3 justify-center flex-wrap min-h-[100px] items-center glow-gold"
        data-testid="foundation-area"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onFoundationAreaClick?.();
          }
        }}
      >
        {foundations.length === 0 && (
          <div className="text-muted-foreground text-sm">
            Play an Ace to create a foundation
          </div>
        )}
        {foundations.map((pile, index) => (
          <FoundationPile
            key={`${pile.suit}-${index}`}
            suit={pile.suit}
            cards={pile.cards}
            onClick={() => onFoundationClick?.(index)}
            isHighlighted={highlightedPileIndex === index}
          />
        ))}
      </div>
    </div>
  );
}
