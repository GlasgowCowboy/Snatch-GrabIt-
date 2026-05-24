import type { Card, Rank, GameState, PlayerState, RoundResult, ScoringSettings, BurnVote } from './schema';
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
  | { type: 'propose-burn' }
  | { type: 'vote-burn'; vote: 'yes' | 'no' };

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
/** fullHand: burned cards are penalised the same as leftover bone-pile cards. */
export const BURNED_CARD_PENALTY = 2;

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
        burnPile: [],
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

  const newState = cloneState(state);
  const player = newState.players.find(p => p.id === playerId);
  if (!player) {
    return { newState: state, error: 'Player not found' };
  }

  switch (move.type) {
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

    case 'propose-burn':
      return executeProposeBurn(newState, player);

    case 'vote-burn':
      return executeVoteBurn(newState, player, move.vote);

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

  // Check for game winner
  const winner = state.players.find(p => p.score >= state.scoringSettings.targetScore);
  if (winner) {
    state.winnerId = winner.id;
    state.status = 'gameOver';
  } else {
    state.status = 'roundEnded';
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
    player.drawPile = [...player.currentDraw].reverse();
    player.currentDraw = [];
  } else {
    return { newState: state, error: 'No cards to draw' };
  }
  return { newState: state };
}

// ── Burn (voted unstick) ────────────────────────────────────────────────────

function resolveBurnIfReady(state: GameState): void {
  if (!state.burnProposal) return;
  const votes = Object.values(state.burnProposal.votes);
  if (votes.some(v => v === 'no')) {
    // Any "no" cancels the proposal.
    state.burnProposal = undefined;
    return;
  }
  if (votes.every(v => v === 'yes')) {
    // Unanimous → pop the proposer's bone-pile top into their burnPile.
    const proposer = state.players.find(p => p.id === state.burnProposal!.proposerId);
    if (proposer && proposer.bonePile.length > 0) {
      const card = proposer.bonePile.pop()!;
      proposer.burnPile.push(card);
    }
    state.burnProposal = undefined;
  }
}

function executeProposeBurn(state: GameState, player: PlayerState): MoveResult {
  if (state.burnProposal) {
    return { newState: state, error: 'Another burn vote is already in progress' };
  }
  if (player.bonePile.length === 0) {
    return { newState: state, error: 'No cards left to burn' };
  }
  const votes: Record<string, BurnVote> = {};
  for (const p of state.players) {
    if (p.id === player.id) votes[p.id] = 'yes'; // proposer implicitly agrees
    else if (p.isAI) votes[p.id] = 'yes'; // AI auto-yes
    else votes[p.id] = 'pending';
  }
  state.burnProposal = {
    proposerId: player.id,
    votes,
    createdAt: Date.now(),
  };
  // If we are the only human (e.g. solo vs AI), the vote resolves immediately.
  resolveBurnIfReady(state);
  return { newState: state };
}

function executeVoteBurn(state: GameState, player: PlayerState, vote: 'yes' | 'no'): MoveResult {
  const proposal = state.burnProposal;
  if (!proposal) {
    return { newState: state, error: 'No burn vote in progress' };
  }
  if (!(player.id in proposal.votes)) {
    return { newState: state, error: 'You are not eligible to vote on this burn' };
  }
  if (proposal.votes[player.id] !== 'pending') {
    return { newState: state, error: 'You have already voted on this burn' };
  }
  proposal.votes[player.id] = vote;
  resolveBurnIfReady(state);
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
    const burnedCards = player.burnPile.length;

    let roundScore = 0;
    if (state.scoringSettings.method === 'fullHand') {
      // Burned cards penalised the same as unplayed bone-pile cards — the burn
      // is a release valve, not a free pass.
      roundScore = foundationCards - (bonePileRemaining * BONE_PILE_PENALTY) - (burnedCards * BURNED_CARD_PENALTY);
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
      burnedCards,
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
      burnPile: [],
      roundScore: 0,
    };
  });

  newState.burnProposal = undefined;

  newState.foundations = [];
  newState.roundResults = undefined;
  newState.declaredOutId = undefined;
  newState.status = 'playing';

  return newState;
}
