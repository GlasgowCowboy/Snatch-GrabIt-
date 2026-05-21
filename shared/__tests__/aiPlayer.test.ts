import { describe, it, expect } from 'vitest';
import { AIPlayer } from '../aiPlayer';
import { createInitialGameState } from '../gameEngine';
import { Card, GameState } from '../schema';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cardCounter = 0;
function makeCard(suit: Card['suit'], rank: Card['rank']): Card {
  return { suit, rank, id: `test-${suit}-${rank}-${cardCounter++}` };
}

function simpleState(): GameState {
  return createInitialGameState(
    [{ id: 'ai-1', name: 'Bot' }],
    { method: 'fullHand', targetScore: 50 },
  );
}

describe('AIPlayer', () => {
  it('finds declare-out move when bone pile is empty', () => {
    const state = simpleState();
    const player = state.players[0];
    player.bonePile = [];

    const ai = new AIPlayer('hard', seededRandom(1));
    const move = ai.getBestMove('ai-1', state);

    expect(move).not.toBeNull();
    expect(move!.type).toBe('declare-out');
  });

  it('finds foundation moves for Aces', () => {
    const state = simpleState();
    const player = state.players[0];
    // Put an Ace on top of bone pile
    player.bonePile.push(makeCard('hearts', 'A'));

    const ai = new AIPlayer('hard', seededRandom(2));
    const move = ai.getBestMove('ai-1', state);

    expect(move).not.toBeNull();
    // Hard AI should prioritize foundation play
    expect(move!.type).toBe('bone-to-foundation');
  });

  it('returns null for unknown player', () => {
    const state = simpleState();
    const ai = new AIPlayer('easy', seededRandom(3));
    const move = ai.getBestMove('nonexistent', state);
    expect(move).toBeNull();
  });

  it('always returns a move when cards are available', () => {
    const state = simpleState();
    const ai = new AIPlayer('medium', seededRandom(4));
    const move = ai.getBestMove('ai-1', state);

    // Fresh state always has cards to draw or play
    expect(move).not.toBeNull();
  });

  it('hard AI prioritizes foundation over tableau', () => {
    const state = simpleState();
    const player = state.players[0];

    // Set up: Ace on bone pile, empty foundation, also valid tableau move
    player.bonePile = [makeCard('hearts', 'A')];
    player.tableau = [
      [makeCard('spades', '5')],
      [],
      [makeCard('clubs', '3')],
      [makeCard('diamonds', '7')],
    ];

    const ai = new AIPlayer('hard', seededRandom(5));
    const move = ai.getBestMove('ai-1', state);

    expect(move).not.toBeNull();
    expect(move!.type).toBe('bone-to-foundation');
  });

  it('finds draw-to-foundation moves', () => {
    const state = simpleState();
    const player = state.players[0];

    // Control player state so draw-to-foundation is unambiguously the best move:
    // - bone pile top is not an Ace and not stackable on the draw Ace
    // - tableau has no Aces (otherwise tableau-to-foundation would tie at score 20)
    player.bonePile = [makeCard('hearts', '5')];
    player.tableau = [[], [], [], []];
    player.currentDraw = [makeCard('spades', 'A')];

    const ai = new AIPlayer('hard', seededRandom(6));
    const move = ai.getBestMove('ai-1', state);

    expect(move).not.toBeNull();
    // Should find the ace for foundation
    expect(['bone-to-foundation', 'draw-to-foundation']).toContain(move!.type);
  });
});
