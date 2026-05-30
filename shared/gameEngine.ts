import type { Card, Rank, GameState, PlayerState, RoundResult, ScoringSettings, PauseInfo } from './schema';
import { generateDeck, dealCards, NEW_FOUNDATION_INDEX, RANKS } from './deckUtils';
// Re-export for callers (engine is the public surface for game logic).
export { NEW_FOUNDATION_INDEX, RANKS } from './deckUtils';

// ── Move Types ──────────────────────────────────────────────────────────────

export type GameMove =
  | { type: 'bone-to-foundation'; foundationIndex: number } // NEW_FOUNDATION_INDEX = new pile
  | { type: 'bone-to-tableau'; targetColumn: number }
  | { type: 'tableau-to-foundation'; sourceColumn: number; cardIndex: number; foundationIndex: number }
  | { type: 'tableau-to-tableau'; sourceColumn: number; cardIndex: number; targetColumn: number }
  | { type: 'draw-to-foundation'; drawCardIndex: number; foundationIndex: number }
  | { type: 'draw-to-tableau'; drawCardIndex: number; targetColumn: number }
  | { type: 'draw-pile' }
  | { type: 'declare-out' }
  // Unstick action: take a card from currentDraw and put it back at the bottom
  // of the draw pile. Changes what the next flip-3 reveals. No vote, no penalty.
  | { type: 'burn-draw-card'; drawCardIndex: number }
  // Mid-game break. Any player can pause; any player can resume. While paused
  // every other move is rejected. AI timers stop. Auto-pause on disconnect is
  // applied via applyAutoPause/applyAutoResume below (not a move).
  | { type: 'pause-game' }
  | { type: 'resume-game' };

export interface MoveResult {
  newState: GameState;
  error?: string;
}

// ── Game Constants ──────────────────────────────────────────────────────────

/** Cards turned over from the draw pile on each "draw" action. */
export const DRAW_TURN_COUNT = 3;

/** fullHand: bonus added to the declarer's round score. */
export const DECLARE_OUT_SCORE_BONUS = 5;
/** fullHand: each leftover bone-pile card costs this many points. */
export const BONE_PILE_PENALTY = 2;

// ── Helpers ─────────────────────────────────────────────────────────────────

export function getRankValue(rank: string): number {
  return RANKS.indexOf(rank as Rank) + 1;
}

export function isRed(suit: string): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function canPlayOnFoundation(card: Card, foundation: Card[]): boolean {
  if (foundation.length === 0) {
    return card.rank === 'A';
  }
  const topCard = foundation[foundation.length - 1];
  return card.suit === topCard.suit && getRankValue(card.rank) === getRankValue(topCard.rank) + 1;
}

export function canPlayOnTableau(card: Card, tableau: Card[]): boolean {
  if (tableau.length === 0) {
    return true;
  }
  const topCard = tableau[tableau.length - 1];
  return isRed(card.suit) !== isRed(topCard.suit) &&
    getRankValue(card.rank) === getRankValue(topCard.rank) - 1;
}

// ── Deep clone helper (game state is plain JSON, no class instances) ────────

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

// ── Create initial game state ───────────────────────────────────────────────

export function createInitialGameState(
  players: { id: string; name: string; cardBackImage?: string; isAI?: boolean }[],
  scoringSettings: ScoringSettings,
): GameState {
  return {
    id: `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    players: players.map(p => {
      const deck = generateDeck(p.id);
      const cards = dealCards(deck);
      return {
        id: p.id,
        name: p.name,
        cardBackImage: p.cardBackImage,
        isAI: p.isAI ?? false,
        score: 0,
        ...cards,
      };
    }),
    foundations: [],
    scoringSettings,
    status: 'playing',
  };
}

// ── Execute a move ──────────────────────────────────────────────────────────

export function executeMove(state: GameState, playerId: string, move: GameMove): MoveResult {
  if (state.status !== 'playing') {
    return { newState: state, error: 'Game is not in playing state' };
  }

  // Gate: while the game is paused only the resume move is allowed.
  if (state.pause && move.type !== 'resume-game') {
    return { newState: state, error: 'Game is paused' };
  }

  const newState = cloneState(state);
  const player = newState.players.find(p => p.id === playerId);
  if (!player) {
    return { newState: state, error: 'Player not found' };
  }

  switch (move.type) {
    case 'pause-game':
      newState.pause = { reason: 'manual', by: player.id, at: Date.now() };
      return { newState };

    case 'resume-game':
      newState.pause = undefined;
      return { newState };

    case 'declare-out':
      return executeDeclareOut(newState, player);

    case 'bone-to-foundation':
      return executeBoneToFoundation(newState, player, move.foundationIndex);

    case 'bone-to-tableau':
      return executeBoneToTableau(newState, player, move.targetColumn);

    case 'tableau-to-foundation':
      return executeTableauToFoundation(newState, player, move.sourceColumn, move.cardIndex, move.foundationIndex);

    case 'tableau-to-tableau':
      return executeTableauToTableau(newState, player, move.sourceColumn, move.cardIndex, move.targetColumn);

    case 'draw-to-foundation':
      return executeDrawToFoundation(newState, player, move.drawCardIndex, move.foundationIndex);

    case 'draw-to-tableau':
      return executeDrawToTableau(newState, player, move.drawCardIndex, move.targetColumn);

    case 'draw-pile':
      return executeDrawPile(newState, player);

    case 'burn-draw-card':
      return executeBurnDrawCard(newState, player, move.drawCardIndex);

    default:
      return { newState: state, error: 'Unknown move type' };
  }
}

// ── Individual move executors ───────────────────────────────────────────────

function executeDeclareOut(state: GameState, player: PlayerState): MoveResult {
  if (player.bonePile.length !== 0) {
    return { newState: state, error: 'Cannot declare out with cards in bone pile' };
  }

  state.declaredOutId = player.id;

  const roundResults = calculateRoundResults(state, player.id);
  state.roundResults = roundResults;

  // Apply scores
  for (const result of roundResults) {
    const p = state.players.find(pl => pl.id === result.playerId)!;
    p.score = result.totalScore;
    p.roundScore = result.roundScore;
  }

  // Check for game winner.
  // - 'timed' games never end on a target score — only the clock ends them.
  // - 'fullHand' and 'round' end as soon as anyone hits the target.
  if (state.scoringSettings.method === 'timed') {
    state.status = 'roundEnded';
  } else {
    const winner = state.players.find(p => p.score >= state.scoringSettings.targetScore);
    if (winner) {
      state.winnerId = winner.id;
      state.status = 'gameOver';
    } else {
      state.status = 'roundEnded';
    }
  }

  return { newState: state };
}

function executeBoneToFoundation(state: GameState, player: PlayerState, foundationIndex: number): MoveResult {
  if (player.bonePile.length === 0) {
    return { newState: state, error: 'Bone pile is empty' };
  }

  const card = player.bonePile[player.bonePile.length - 1];

  if (foundationIndex === NEW_FOUNDATION_INDEX) {
    if (card.rank !== 'A') {
      return { newState: state, error: 'Only Aces can start new foundation piles' };
    }
    card.playedBy = player.id;
    state.foundations.push({ suit: card.suit, cards: [card] });
    player.bonePile.pop();
    return { newState: state };
  }

  const foundation = state.foundations[foundationIndex];
  if (!foundation) {
    return { newState: state, error: 'Foundation pile not found' };
  }

  if (!canPlayOnFoundation(card, foundation.cards)) {
    return { newState: state, error: "Can't play that card on this foundation" };
  }

  card.playedBy = player.id;
  foundation.cards.push(card);
  player.bonePile.pop();
  return { newState: state };
}

function executeBoneToTableau(state: GameState, player: PlayerState, targetColumn: number): MoveResult {
  if (player.bonePile.length === 0) {
    return { newState: state, error: 'Bone pile is empty' };
  }

  const column = player.tableau[targetColumn];
  if (!column) {
    return { newState: state, error: 'Invalid tableau column' };
  }

  const card = player.bonePile[player.bonePile.length - 1];
  if (!canPlayOnTableau(card, column)) {
    return { newState: state, error: 'Invalid tableau placement' };
  }

  column.push(card);
  player.bonePile.pop();
  return { newState: state };
}

function executeTableauToFoundation(
  state: GameState, player: PlayerState,
  sourceColumn: number, cardIndex: number, foundationIndex: number,
): MoveResult {
  const column = player.tableau[sourceColumn];
  if (!column || column.length === 0) {
    return { newState: state, error: 'Source column is empty' };
  }

  // Only top card can go to foundation
  if (cardIndex !== column.length - 1) {
    return { newState: state, error: 'Only the top card can be played to foundation' };
  }

  const card = column[cardIndex];

  if (foundationIndex === NEW_FOUNDATION_INDEX) {
    if (card.rank !== 'A') {
      return { newState: state, error: 'Only Aces can start new foundation piles' };
    }
    card.playedBy = player.id;
    state.foundations.push({ suit: card.suit, cards: [card] });
    column.pop();
    return { newState: state };
  }

  const foundation = state.foundations[foundationIndex];
  if (!foundation) {
    return { newState: state, error: 'Foundation pile not found' };
  }

  if (!canPlayOnFoundation(card, foundation.cards)) {
    return { newState: state, error: "Can't play that card on this foundation" };
  }

  card.playedBy = player.id;
  foundation.cards.push(card);
  column.pop();
  return { newState: state };
}

function executeTableauToTableau(
  state: GameState, player: PlayerState,
  sourceColumn: number, cardIndex: number, targetColumn: number,
): MoveResult {
  if (sourceColumn === targetColumn) {
    return { newState: state, error: 'Cannot move to same column' };
  }

  const source = player.tableau[sourceColumn];
  const target = player.tableau[targetColumn];
  if (!source || !target) {
    return { newState: state, error: 'Invalid column' };
  }

  if (cardIndex < 0 || cardIndex >= source.length) {
    return { newState: state, error: 'Invalid card index' };
  }

  const cardsToMove = source.slice(cardIndex);
  const topCard = cardsToMove[0];

  if (!canPlayOnTableau(topCard, target)) {
    return { newState: state, error: 'Invalid tableau placement' };
  }

  target.push(...cardsToMove);
  source.splice(cardIndex);
  return { newState: state };
}

function executeDrawToFoundation(
  state: GameState, player: PlayerState,
  drawCardIndex: number, foundationIndex: number,
): MoveResult {
  if (drawCardIndex < 0 || drawCardIndex >= player.currentDraw.length) {
    return { newState: state, error: 'Invalid draw card index' };
  }

  const card = player.currentDraw[drawCardIndex];

  if (foundationIndex === NEW_FOUNDATION_INDEX) {
    if (card.rank !== 'A') {
      return { newState: state, error: 'Only Aces can start new foundation piles' };
    }
    card.playedBy = player.id;
    state.foundations.push({ suit: card.suit, cards: [card] });
    player.currentDraw.splice(drawCardIndex, 1);
    return { newState: state };
  }

  const foundation = state.foundations[foundationIndex];
  if (!foundation) {
    return { newState: state, error: 'Foundation pile not found' };
  }

  if (!canPlayOnFoundation(card, foundation.cards)) {
    return { newState: state, error: "Can't play that card on this foundation" };
  }

  card.playedBy = player.id;
  foundation.cards.push(card);
  player.currentDraw.splice(drawCardIndex, 1);
  return { newState: state };
}

function executeDrawToTableau(
  state: GameState, player: PlayerState,
  drawCardIndex: number, targetColumn: number,
): MoveResult {
  if (drawCardIndex < 0 || drawCardIndex >= player.currentDraw.length) {
    return { newState: state, error: 'Invalid draw card index' };
  }

  const column = player.tableau[targetColumn];
  if (!column) {
    return { newState: state, error: 'Invalid tableau column' };
  }

  const card = player.currentDraw[drawCardIndex];
  if (!canPlayOnTableau(card, column)) {
    return { newState: state, error: 'Invalid tableau placement' };
  }

  column.push(card);
  player.currentDraw.splice(drawCardIndex, 1);
  return { newState: state };
}

function executeDrawPile(state: GameState, player: PlayerState): MoveResult {
  if (player.drawPile.length > 0) {
    const numToDraw = Math.min(DRAW_TURN_COUNT, player.drawPile.length);
    const cardsToTurn = player.drawPile.splice(-numToDraw);
    player.currentDraw.push(...cardsToTurn);
  } else if (player.currentDraw.length > 0) {
    // Refill without reversing: preserves the dealt order across cycles so the
    // pile rotates predictably rather than re-shuffling every lap.
    player.drawPile = [...player.currentDraw];
    player.currentDraw = [];
  } else {
    return { newState: state, error: 'No cards to draw' };
  }
  return { newState: state };
}

// ── Time-up (server-driven, timed games only) ───────────────────────────────

/**
 * Called by the server when a timed game's clock hits zero. Freezes the game
 * with the current cumulative scores. Winner = player with highest totalScore
 * (ties broken by playerId order, deterministic).
 *
 * If the game is mid-round when the clock fires, the in-progress round is
 * NOT scored — only fully-completed rounds count. This is the simpler rule
 * and avoids "I was about to declare!" complaints from a partial calculation.
 */
export function applyTimeUp(state: GameState): GameState {
  if (state.status === 'gameOver') return state;
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  return {
    ...state,
    status: 'gameOver',
    winnerId: winner?.id,
  };
}

// ── Auto-pause (server-driven, not a player move) ───────────────────────────

/**
 * Server calls this when a previously-connected human player drops their WS.
 * Pure function — returns the same state with a pause attached. If the game
 * is already paused (manual or otherwise) we don't stomp on the existing
 * pause record.
 */
export function applyAutoPause(state: GameState): GameState {
  if (state.pause) return state;
  if (state.status !== 'playing') return state;
  return {
    ...state,
    pause: { reason: 'auto-disconnect', by: 'system', at: Date.now() },
  };
}

/**
 * Server calls this when the disconnected player comes back. We ONLY lift an
 * auto-disconnect pause — if a human pressed Pause manually, only a manual
 * Resume move clears it.
 */
export function applyAutoResume(state: GameState): GameState {
  if (!state.pause) return state;
  if (state.pause.reason !== 'auto-disconnect') return state;
  return { ...state, pause: undefined };
}

// ── Burn (per-player unstick) ───────────────────────────────────────────────

/**
 * Burn the selected currentDraw card: it goes to the bottom of the drawPile,
 * AND the very next card in the pile gets pushed down one step too. Net effect:
 * the next flip-3 reveals cards from one step deeper, "unsticking" the player
 * when their current 3 are unplayable. No vote, no penalty.
 */
function executeBurnDrawCard(state: GameState, player: PlayerState, drawCardIndex: number): MoveResult {
  if (drawCardIndex < 0 || drawCardIndex >= player.currentDraw.length) {
    return { newState: state, error: 'Invalid draw card index' };
  }
  const [burned] = player.currentDraw.splice(drawCardIndex, 1);
  // drawPile is drawn from the END (top of pile), so the "bottom" is index 0.
  if (player.drawPile.length > 0) {
    // Skip-next: move what would have come up next (drawPile top) to the
    // bottom too. This is what makes the next flip-3 genuinely different.
    const skipped = player.drawPile.pop()!;
    player.drawPile.unshift(burned, skipped);
  } else {
    // Empty pile — burned card just becomes the only card (becomes the new top).
    player.drawPile.push(burned);
  }
  return { newState: state };
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export function calculateRoundResults(state: GameState, declarerId: string): RoundResult[] {
  return state.players.map(player => {
    let foundationCards = 0;
    state.foundations.forEach(foundation => {
      foundationCards += foundation.cards.filter(card => card.playedBy === player.id).length;
    });

    const bonePileRemaining = player.bonePile.length;
    const tableauRemaining = player.tableau.reduce((sum, col) => sum + col.length, 0);

    let roundScore = 0;
    if (state.scoringSettings.method === 'fullHand' || state.scoringSettings.method === 'timed') {
      // Timed games use the fullHand point math — what changes for timed is
      // the *game end* condition (clock, not target). Per-round scoring is
      // identical so the running totalScore is meaningful at any tick.
      roundScore = foundationCards - (bonePileRemaining * BONE_PILE_PENALTY);
      if (player.id === declarerId) {
        roundScore += DECLARE_OUT_SCORE_BONUS;
      }
    } else {
      roundScore = player.id === declarerId ? 1 : 0;
    }

    return {
      playerId: player.id,
      playerName: player.name,
      foundationCards,
      bonePileRemaining,
      tableauRemaining,
      declaredOut: player.id === declarerId,
      roundScore,
      totalScore: player.score + roundScore,
    };
  });
}

// ── Round management ────────────────────────────────────────────────────────

export function startNewRound(state: GameState): GameState {
  const newState = cloneState(state);

  newState.players = newState.players.map(player => {
    const deck = generateDeck(player.id);
    const dealt = dealCards(deck);
    return {
      ...player,
      ...dealt,
      roundScore: 0,
    };
  });

  newState.foundations = [];
  newState.roundResults = undefined;
  newState.declaredOutId = undefined;
  newState.pause = undefined;
  newState.status = 'playing';

  return newState;
}
