import { GameState, PlayerState, Card } from './schema';
import { GameMove, canPlayOnFoundation, canPlayOnTableau } from './gameEngine';

export type AIDifficulty = 'easy' | 'medium' | 'hard';

export class AIPlayer {
  private difficulty: AIDifficulty;
  private random: () => number;

  constructor(difficulty: AIDifficulty, random: () => number = Math.random) {
    this.difficulty = difficulty;
    this.random = random;
  }

  // Find all possible moves for a player
  private findAllMoves(player: PlayerState, gameState: GameState): GameMove[] {
    const moves: GameMove[] = [];

    // Check if can declare out
    if (player.bonePile.length === 0) {
      moves.push({ type: 'declare-out' });
      return moves; // Prioritize declaring out
    }

    // Bone pile to foundation
    if (player.bonePile.length > 0) {
      const topBone = player.bonePile[player.bonePile.length - 1];

      gameState.foundations.forEach((foundation, index) => {
        if (canPlayOnFoundation(topBone, foundation.cards)) {
          moves.push({ type: 'bone-to-foundation', foundationIndex: index });
        }
      });

      if (topBone.rank === 'A') {
        moves.push({ type: 'bone-to-foundation', foundationIndex: -1 });
      }

      player.tableau.forEach((column, columnIndex) => {
        if (canPlayOnTableau(topBone, column)) {
          moves.push({ type: 'bone-to-tableau', targetColumn: columnIndex });
        }
      });
    }

    // Tableau to foundation
    player.tableau.forEach((column, columnIndex) => {
      if (column.length > 0) {
        const topCard = column[column.length - 1];

        gameState.foundations.forEach((foundation, foundationIndex) => {
          if (canPlayOnFoundation(topCard, foundation.cards)) {
            moves.push({ type: 'tableau-to-foundation', sourceColumn: columnIndex, cardIndex: column.length - 1, foundationIndex });
          }
        });

        if (topCard.rank === 'A') {
          moves.push({ type: 'tableau-to-foundation', sourceColumn: columnIndex, cardIndex: column.length - 1, foundationIndex: -1 });
        }
      }
    });

    // Tableau to tableau
    player.tableau.forEach((sourceColumn, sourceIndex) => {
      if (sourceColumn.length > 0) {
        const topCard = sourceColumn[sourceColumn.length - 1];

        player.tableau.forEach((targetColumn, targetIndex) => {
          if (sourceIndex !== targetIndex && canPlayOnTableau(topCard, targetColumn)) {
            moves.push({ type: 'tableau-to-tableau', sourceColumn: sourceIndex, cardIndex: sourceColumn.length - 1, targetColumn: targetIndex });
          }
        });
      }
    });

    // Draw to foundation
    player.currentDraw.forEach((card, index) => {
      gameState.foundations.forEach((foundation, foundationIndex) => {
        if (canPlayOnFoundation(card, foundation.cards)) {
          moves.push({ type: 'draw-to-foundation', drawCardIndex: index, foundationIndex });
        }
      });

      if (card.rank === 'A') {
        moves.push({ type: 'draw-to-foundation', drawCardIndex: index, foundationIndex: -1 });
      }
    });

    // Draw to tableau
    player.currentDraw.forEach((card, index) => {
      player.tableau.forEach((column, columnIndex) => {
        if (canPlayOnTableau(card, column)) {
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
  private scoreMove(move: GameMove, player: PlayerState): number {
    let score = 0;

    switch (this.difficulty) {
      case 'easy':
        return this.random();

      case 'medium':
        if (move.type.includes('foundation')) {
          score += 10;
        }
        if (move.type.startsWith('bone-')) {
          score += 5;
        }
        if (move.type === 'tableau-to-tableau') {
          score += 2;
        }
        return score + this.random();

      case 'hard':
        if (move.type === 'declare-out') {
          return 1000;
        }
        if (move.type.includes('foundation')) {
          score += 20;
        }
        if (move.type === 'bone-to-foundation') {
          score += 15;
        }
        if (move.type === 'bone-to-tableau') {
          score += 8;
        }
        if (move.type === 'tableau-to-tableau') {
          score += 3;
        }
        if (move.type === 'draw-pile') {
          score += 1;
        }
        return score + this.random() * 0.5;

      default:
        return this.random();
    }
  }

  // Get the best move for the AI player
  public getBestMove(playerId: string, gameState: GameState): GameMove | null {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return null;

    const possibleMoves = this.findAllMoves(player, gameState);
    if (possibleMoves.length === 0) return null;

    const scoredMoves = possibleMoves.map(move => ({
      move,
      score: this.scoreMove(move, player),
    }));

    scoredMoves.sort((a, b) => b.score - a.score);
    return scoredMoves[0].move;
  }
}
