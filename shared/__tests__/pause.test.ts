import { describe, it, expect } from 'vitest';
import {
  createInitialGameState,
  executeMove,
  applyAutoPause,
  applyAutoResume,
  startNewRound,
} from '../gameEngine';
import type { GameState } from '../schema';

function freshState(): GameState {
  return createInitialGameState(
    [
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
    ],
    { method: 'fullHand', targetScore: 50 },
  );
}

describe('pause-game / resume-game', () => {
  it('any player can pause; pause record carries player + reason + timestamp', () => {
    const state = freshState();
    const r = executeMove(state, 'p1', { type: 'pause-game' });
    expect(r.error).toBeUndefined();
    expect(r.newState.pause).toBeDefined();
    expect(r.newState.pause!.by).toBe('p1');
    expect(r.newState.pause!.reason).toBe('manual');
    expect(typeof r.newState.pause!.at).toBe('number');
  });

  it('rejects every non-resume move while paused', () => {
    const paused = executeMove(freshState(), 'p1', { type: 'pause-game' }).newState;
    const tried = executeMove(paused, 'p2', { type: 'draw-pile' });
    expect(tried.error).toMatch(/paused/i);
    // State unchanged (no resume happened).
    expect(tried.newState).toBe(paused);
  });

  it('any player can resume — both manual and auto-disconnect pauses lift', () => {
    const paused = executeMove(freshState(), 'p1', { type: 'pause-game' }).newState;
    const resumed = executeMove(paused, 'p2', { type: 'resume-game' });
    expect(resumed.error).toBeUndefined();
    expect(resumed.newState.pause).toBeUndefined();
  });

  it('rejects pause when the game is already in a non-playing state', () => {
    const state = { ...freshState(), status: 'roundEnded' as const };
    const r = executeMove(state, 'p1', { type: 'pause-game' });
    expect(r.error).toMatch(/not in playing state/i);
  });
});

describe('applyAutoPause / applyAutoResume', () => {
  it('auto-pause sets the pause record with reason auto-disconnect', () => {
    const next = applyAutoPause(freshState());
    expect(next.pause).toBeDefined();
    expect(next.pause!.reason).toBe('auto-disconnect');
    expect(next.pause!.by).toBe('system');
  });

  it('auto-pause is a no-op when a manual pause is already active', () => {
    const manual = executeMove(freshState(), 'p1', { type: 'pause-game' }).newState;
    const next = applyAutoPause(manual);
    expect(next).toBe(manual); // unchanged reference
    expect(next.pause!.reason).toBe('manual');
  });

  it('auto-resume lifts an auto-disconnect pause', () => {
    const paused = applyAutoPause(freshState());
    const resumed = applyAutoResume(paused);
    expect(resumed.pause).toBeUndefined();
  });

  it('auto-resume DOES NOT lift a manual pause — only a manual resume can', () => {
    const manual = executeMove(freshState(), 'p1', { type: 'pause-game' }).newState;
    const tried = applyAutoResume(manual);
    expect(tried).toBe(manual);
    expect(tried.pause).toBeDefined();
    expect(tried.pause!.reason).toBe('manual');
  });

  it('auto-pause is a no-op when game is not in playing state', () => {
    const ended = { ...freshState(), status: 'roundEnded' as const };
    const next = applyAutoPause(ended);
    expect(next).toBe(ended);
    expect(next.pause).toBeUndefined();
  });
});

describe('pause state across round transitions', () => {
  it('startNewRound clears any active pause', () => {
    const paused = executeMove(freshState(), 'p1', { type: 'pause-game' }).newState;
    const nextRound = startNewRound({ ...paused, status: 'roundEnded' });
    expect(nextRound.pause).toBeUndefined();
  });
});
