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

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs font-medium text-gold/60">{label}</div>
      <div className="relative">
        {hasCards ? (
          <>
            <PlayingCard
              card={cards[cards.length - 1]}
              faceDown={!isBonePile}
              onClick={onClick}
              isHighlighted={isHighlighted}
              cardBackImage={cardBackImage}
            />
            {showCount && (
              <div
                className="absolute -top-2 -right-2 badge-gold rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-md"
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
