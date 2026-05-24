import { Card, Suit, Rank } from './schema';

/** All four suits in their canonical order. */
export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
/** All thirteen ranks in ascending order (Ace = 1, King = 13). */
export const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Cards per standard deck (52). */
export const DECK_SIZE = SUITS.length * RANKS.length;
/** Sentinel passed in GameMove.foundationIndex to request a new foundation. */
export const NEW_FOUNDATION_INDEX = -1;

/** Cards dealt face-down to each player's bone pile at the start of a round. */
export const BONE_PILE_SIZE = 13;
/** Number of tableau columns dealt face-up to each player. */
export const TABLEAU_COLUMN_COUNT = 4;
/** Remaining cards (52 - 13 - 4 = 35) form the draw pile. */
export const DRAW_PILE_SIZE = DECK_SIZE - BONE_PILE_SIZE - TABLEAU_COLUMN_COUNT;

function randomCardSuffix(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function generateDeck(playerId: string): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        id: `${playerId}-${suit}-${rank}-${randomCardSuffix()}`,
      });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export interface DealtCards {
  bonePile: Card[];
  tableau: Card[][];
  drawPile: Card[];
  currentDraw: Card[];
}

export function dealCards(deck: Card[]): DealtCards {
  const shuffled = shuffleDeck(deck);

  const bonePile = shuffled.slice(0, BONE_PILE_SIZE);

  const tableauStart = BONE_PILE_SIZE;
  const tableau: Card[][] = [];
  for (let i = 0; i < TABLEAU_COLUMN_COUNT; i++) {
    tableau.push([shuffled[tableauStart + i]]);
  }

  const drawPile = shuffled.slice(tableauStart + TABLEAU_COLUMN_COUNT);

  return { bonePile, tableau, drawPile, currentDraw: [] };
}
