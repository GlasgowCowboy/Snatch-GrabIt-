import { Card, Suit, Rank } from '@shared/schema';

const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function generateDeck(playerId: string): Card[] {
  const deck: Card[] = [];
  
  suits.forEach(suit => {
    ranks.forEach(rank => {
      deck.push({
        suit,
        rank,
        id: `${playerId}-${suit}-${rank}-${Math.random().toString(36).substr(2, 9)}`,
      });
    });
  });
  
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}

export function dealCards(deck: Card[]) {
  const shuffledDeck = shuffleDeck(deck);
  
  // Deal 13 cards to bone pile
  const bonePile = shuffledDeck.slice(0, 13);
  
  // Deal 4 cards to tableau (1 per column)
  const tableau = [
    [shuffledDeck[13]],
    [shuffledDeck[14]],
    [shuffledDeck[15]],
    [shuffledDeck[16]],
  ];
  
  // Remaining 35 cards go to draw pile
  const drawPile = shuffledDeck.slice(17);
  
  return {
    bonePile,
    tableau,
    drawPile,
    currentDraw: [] as Card[],
  };
}
