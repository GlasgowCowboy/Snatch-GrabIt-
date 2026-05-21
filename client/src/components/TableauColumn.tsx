import { Card } from '@shared/schema';
import PlayingCard from './PlayingCard';

interface TableauColumnProps {
  cards: Card[];
  onCardClick?: (cardIndex: number) => void;
  onEmptyClick?: () => void;
  highlightedCardIndex?: number;
}

export default function TableauColumn({
  cards,
  onCardClick,
  onEmptyClick,
  highlightedCardIndex,
}: TableauColumnProps) {
  return (
    <div className="flex flex-col pt-2">
      {cards.length === 0 ? (
        <PlayingCard isEmpty onClick={onEmptyClick} />
      ) : (
        cards.map((card, index) => {
          // Note: This inline function is necessary for passing the index
          // The parent should memoize the onCardClick handler to minimize impact
          return (
            <div
              key={card.id}
              className={`${index > 0 ? '-mt-14' : ''}`}
              style={{ filter: index > 0 ? `drop-shadow(0 ${1 + index}px ${2 + index}px rgba(0,0,0,${0.15 + index * 0.05}))` : undefined }}
            >
              <PlayingCard
                card={card}
                onClick={() => onCardClick?.(index)}
                isHighlighted={highlightedCardIndex !== undefined && index >= highlightedCardIndex}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
