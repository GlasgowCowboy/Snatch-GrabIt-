import { GameState, PlayerState, Card, FoundationPile } from '@shared/schema';

export type AIDifficulty = 'easy' | 'medium' | 'hard';

interface AIMove {
  type: 'bone-to-foundation' | 'bone-to-tableau' | 'tableau-to-foundation' | 'tableau-to-tableau' | 'draw-to-foundation' | 'draw-to-tableau' | 'draw-pile' | 'declare-out';
  sourceColumn?: number;
  targetColumn?: number;
  foundationIndex?: number;
  drawCardIndex?: number;
}

export class AIPlayer {
  private difficulty: AIDifficulty;

  constructor(difficulty: AIDifficulty) {
    this.difficulty = difficulty;
  }

  // Get rank value for comparison
  private getRankValue(rank: string): number {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    return ranks.indexOf(rank) + 1;
  }

  // Check if card is red
  private isRed(suit: string): boolean {
    return suit === 'hearts' || suit === 'diamonds';
  }

  // Check if card can play on foundation
  private canPlayOnFoundation(card: Card, foundation: Card[]): boolean {
    if (foundation.length === 0) {
      return card.rank === 'A';
    }
    const topCard = foundation[foundation.length - 1];
    return card.suit === topCard.suit && this.getRankValue(card.rank) === this.getRankValue(topCard.rank) + 1;
  }

  // Check if card can play on tableau
  private canPlayOnTableau(card: Card, tableau: Card[]): boolean {
    if (tableau.length === 0) {
      return true;
    }
    const topCard = tableau[tableau.length - 1];
    return this.isRed(card.suit) !== this.isRed(topCard.suit) && 
           this.getRankValue(card.rank) === this.getRankValue(topCard.rank) - 1;
  }

  // Find all possible moves for a player
  private findAllMoves(player: PlayerState, gameState: GameState): AIMove[] {
    const moves: AIMove[] = [];

    // Check if can declare out
    if (player.bonePile.length === 0) {
      moves.push({ type: 'declare-out' });
      return moves; // Prioritize declaring out
    }

    // Bone pile to foundation
    if (player.bonePile.length > 0) {
      const topBone = player.bonePile[player.bonePile.length - 1];
      
      // Check each foundation
      gameState.foundations.forEach((foundation, index) => {
        if (this.canPlayOnFoundation(topBone, foundation.cards)) {
          moves.push({ type: 'bone-to-foundation', foundationIndex: index });
        }
      });

      // Check if Ace (can ALWAYS create new foundation - shared foundations!)
      if (topBone.rank === 'A') {
        moves.push({ type: 'bone-to-foundation', foundationIndex: -1 }); // -1 means new foundation
      }

      // Bone pile to tableau
      player.tableau.forEach((column, columnIndex) => {
        if (this.canPlayOnTableau(topBone, column)) {
          moves.push({ type: 'bone-to-tableau', targetColumn: columnIndex });
        }
      });
    }

    // Tableau to foundation
    player.tableau.forEach((column, columnIndex) => {
      if (column.length > 0) {
        const topCard = column[column.length - 1];
        
        gameState.foundations.forEach((foundation, foundationIndex) => {
          if (this.canPlayOnFoundation(topCard, foundation.cards)) {
            moves.push({ type: 'tableau-to-foundation', sourceColumn: columnIndex, foundationIndex });
          }
        });

        // Check if Ace (can ALWAYS create new foundation - shared foundations!)
        if (topCard.rank === 'A') {
          moves.push({ type: 'tableau-to-foundation', sourceColumn: columnIndex, foundationIndex: -1 });
        }
      }
    });

    // Tableau to tableau
    player.tableau.forEach((sourceColumn, sourceIndex) => {
      if (sourceColumn.length > 0) {
        const topCard = sourceColumn[sourceColumn.length - 1];
        
        player.tableau.forEach((targetColumn, targetIndex) => {
          if (sourceIndex !== targetIndex && this.canPlayOnTableau(topCard, targetColumn)) {
            moves.push({ type: 'tableau-to-tableau', sourceColumn: sourceIndex, targetColumn: targetIndex });
          }
        });
      }
    });

    // Draw pile to foundation
    player.currentDraw.forEach((card, index) => {
      gameState.foundations.forEach((foundation, foundationIndex) => {
        if (this.canPlayOnFoundation(card, foundation.cards)) {
          moves.push({ type: 'draw-to-foundation', drawCardIndex: index, foundationIndex });
        }
      });

      // Check if Ace (can ALWAYS create new foundation - shared foundations!)
      if (card.rank === 'A') {
        moves.push({ type: 'draw-to-foundation', drawCardIndex: index, foundationIndex: -1 });
      }
    });

    // Draw pile to tableau
    player.currentDraw.forEach((card, index) => {
      player.tableau.forEach((column, columnIndex) => {
        if (this.canPlayOnTableau(card, column)) {
          moves.push({ type: 'draw-to-tableau', drawCardIndex: index, targetColumn: columnIndex });
        }
      });
    });

    // Draw from pile
    if (player.drawPile.length > 0 || player.currentDraw.length > 0) {
      moves.push({ type: 'draw-pile' });
    }

    return moves;
  }

  // Score a move based on difficulty strategy
  private scoreMove(move: AIMove, player: PlayerState): number {
    let score = 0;

    switch (this.difficulty) {
      case 'easy':
        // Random scoring
        return Math.random();

      case 'medium':
        // Prefer foundation moves
        if (move.type.includes('foundation')) {
          score += 10;
        }
        // Prefer bone pile moves (to empty it)
        if (move.type.startsWith('bone-')) {
          score += 5;
        }
        // Slight preference for organizing tableau
        if (move.type === 'tableau-to-tableau') {
          score += 2;
        }
        return score + Math.random();

      case 'hard':
        // Strategic play
        if (move.type === 'declare-out') {
          return 1000; // Always declare out when possible
        }
        // Highest priority: foundation moves
        if (move.type.includes('foundation')) {
          score += 20;
        }
        // High priority: bone pile to foundation
        if (move.type === 'bone-to-foundation') {
          score += 15;
        }
        // Medium priority: bone pile to tableau
        if (move.type === 'bone-to-tableau') {
          score += 8;
        }
        // Lower priority: tableau organization
        if (move.type === 'tableau-to-tableau') {
          score += 3;
        }
        // Low priority: draw pile
        if (move.type === 'draw-pile') {
          score += 1;
        }
        return score + Math.random() * 0.5; // Small randomness for variety

      default:
        return Math.random();
    }
  }

  // Get the best move for the AI player
  public getBestMove(playerId: string, gameState: GameState): AIMove | null {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return null;

    const possibleMoves = this.findAllMoves(player, gameState);
    if (possibleMoves.length === 0) return null;

    // Score all moves and pick the best one
    const scoredMoves = possibleMoves.map(move => ({
      move,
      score: this.scoreMove(move, player),
    }));

    scoredMoves.sort((a, b) => b.score - a.score);
    return scoredMoves[0].move;
  }
}
