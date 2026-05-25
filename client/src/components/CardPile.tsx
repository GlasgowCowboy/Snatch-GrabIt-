import { Card } from '@shared/schema';
import PlayingCard from './PlayingCard';

interface CardPileProps {
  cards: Card[];
  label: string;
  showCount?: boolean;
  onClick?: () => void;
  isHighlighted?: boolean;
  cardBackImage?: string;
}

export default function CardPile({
  cards,
  label,
  showCount = false,
  onClick,
  isHighlighted = false,
  cardBackImage,
}: CardPileProps) {
  const hasCards = cards.length > 0;
  const isBonePile = label.toLowerCase().includes('bone');

  // Visible stack: render up to 2 face-down "layer" cards behind the top card
  // when there are multiple cards, offset by a few pixels so the pile reads
  // as a *pile* and not a single card. Layers are non-interactive — only the
  // top card receives clicks.
  const layerCount = Math.min(2, Math.max(0, cards.length - 1));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs font-medium text-gold/60">{label}</div>
      <div className="relative">
        {hasCards ? (
          <>
            {/* Face-down stack layers behind the top card (rendered first so
                they sit underneath in stacking order; absolute positioning
                with offsets gives the staggered pile look). */}
            {Array.from({ length: layerCount }).map((_, i) => (
              <div
                key={`layer-${i}`}
                aria-hidden
                className="absolute pointer-events-none"
                style={{
                  // Each deeper layer steps down + right by a few pixels.
                  top: `${(i + 1) * 3}px`,
                  left: `${(i + 1) * 3}px`,
                  zIndex: -1 - i,
                }}
              >
                <PlayingCard faceDown cardBackImage={cardBackImage} />
              </div>
            ))}
            <PlayingCard
              card={cards[cards.length - 1]}
              faceDown={!isBonePile}
              onClick={onClick}
              isHighlighted={isHighlighted}
              cardBackImage={cardBackImage}
            />
            {showCount && (
              <div
                className="absolute -top-2 -right-2 badge-gold rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-md z-10"
                data-testid="pile-count"
              >
                {cards.length}
              </div>
            )}
          </>
        ) : (
          <PlayingCard isEmpty />
        )}
      </div>
    </div>
  );
}
