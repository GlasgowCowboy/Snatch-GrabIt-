import { describe, it, expect } from 'vitest';
import { createInitialGameState, executeMove, applyTimeUp } from '../gameEngine';

describe('timed mode scoring', () => {
  it('uses fullHand point math per round', () => {
    const state = createInitialGameState(
      [
        { id: 'p1', name: 'P1' },
        { id: 'p2', name: 'P2' },
      ],
      { method: 'timed', targetScore: 1, durationSec: 300 },
    );
    // Same engine rule as fullHand: declare-out needs empty bone pile.
    state.players[0].bonePile = [];
    const r = executeMove(state, 'p1', { type: 'declare-out' });
    expect(r.error).toBeUndefined();
    const p1 = r.newState.roundResults!.find((x) => x.playerId === 'p1')!;
    // 0 foundation cards + declare-out bonus 5 = 5
    expect(p1.roundScore).toBe(5);
  });

  it('declare-out in timed mode does NOT end the game when no target hit', () => {
    const state = createInitialGameState(
      [
        { id: 'p1', name: 'P1' },
        { id: 'p2', name: 'P2' },
      ],
      // Tiny target deliberately — fullHand mode WOULD end here. timed mustn't.
      { method: 'timed', targetScore: 1, durationSec: 300 },
    );
    state.players[0].bonePile = [];
    const r = executeMove(state, 'p1', { type: 'declare-out' });
    expect(r.error).toBeUndefined();
    expect(r.newState.status).toBe('roundEnded'); // NOT 'gameOver'
    expect(r.newState.winnerId).toBeUndefined();
  });

  it('fullHand declare-out at target DOES end the game (control)', () => {
    const state = createInitialGameState(
      [
        { id: 'p1', name: 'P1' },
        { id: 'p2', name: 'P2' },
      ],
      { method: 'fullHand', targetScore: 1 },
    );
    state.players[0].bonePile = [];
    const r = executeMove(state, 'p1', { type: 'declare-out' });
    expect(r.newState.status).toBe('gameOver');
    expect(r.newState.winnerId).toBe('p1');
  });
});

describe('applyTimeUp', () => {
  it('freezes the game with the highest-score player as winner', () => {
    const state = createInitialGameState(
      [
        { id: 'p1', name: 'P1' },
        { id: 'p2', name: 'P2' },
        { id: 'p3', name: 'P3' },
      ],
      { method: 'timed', targetScore: 1, durationSec: 60 },
    );
    state.players[0].score = 12;
    state.players[1].score = 30;
    state.players[2].score = 8;

    const next = applyTimeUp(state);
    expect(next.status).toBe('gameOver');
    expect(next.winnerId).toBe('p2');
  });

  it('is a no-op when the game is already over', () => {
    const state = createInitialGameState(
      [
        { id: 'p1', name: 'P1' },
        { id: 'p2', name: 'P2' },
      ],
      { method: 'timed', targetScore: 1, durationSec: 60 },
    );
    state.status = 'gameOver';
    state.winnerId = 'p1';
    const next = applyTimeUp(state);
    expect(next).toBe(state);
  });
});
