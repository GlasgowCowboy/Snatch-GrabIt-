import { Card, Suit } from '@shared/schema';
import PlayingCard from './PlayingCard';
import { Heart, Diamond, Spade as SpadeIcon, Club } from 'lucide-react';

interface FoundationPileProps {
  suit: Suit;
  cards: Card[];
  isHighlighted?: boolean;
  onClick?: () => void;
}

export default function FoundationPile({
  suit,
  cards,
  isHighlighted = false,
  onClick,
}: FoundationPileProps) {
  const getSuitIcon = () => {
    switch (suit) {
      case 'hearts':
        return <Heart className="w-12 h-12" />;
      case 'diamonds':
        return <Diamond className="w-12 h-12" />;
      case 'clubs':
        return <Club className="w-12 h-12" />;
      case 'spades':
        return <SpadeIcon className="w-12 h-12" />;
    }
  };

  const topCard = cards.length > 0 ? cards[cards.length - 1] : undefined;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        {topCard ? (
          <PlayingCard
            key={`${topCard.id}-${cards.length}`}
            card={topCard}
            onClick={onClick}
            isHighlighted={isHighlighted}
            animationType="pop"
          />
        ) : (
          <div
            onClick={onClick}
            className={`
              w-16 h-24 rounded-md border-2 border-dashed 
              flex items-center justify-center
              border-gold/40 text-gold/40
              ${isHighlighted ? 'ring-2 ring-gold animate-pulse' : ''}
              ${onClick ? 'cursor-pointer hover-elevate' : ''}
            `}
            data-testid={`foundation-${suit}-empty`}
          >
            {getSuitIcon()}
          </div>
        )}
      </div>
    </div>
  );
}
