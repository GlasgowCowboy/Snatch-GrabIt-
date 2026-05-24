import { describe, it, expect } from 'vitest';
import { createInitialGameState, executeMove } from '../gameEngine';
import type { GameState } from '../schema';

function freshState(extras: { isAI?: boolean }[] = [{}, {}]): GameState {
  const players = extras.map((p, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    isAI: p.isAI,
  }));
  return createInitialGameState(players, { method: 'fullHand', targetScore: 50 });
}

describe('burn vote', () => {
  it('solo-vs-AI: propose-burn resolves immediately because AI auto-yes', () => {
    const state = freshState([{}, { isAI: true }]);
    const before = state.players[0].bonePile.length;

    const result = executeMove(state, 'p1', { type: 'propose-burn' });
    expect(result.error).toBeUndefined();

    // Proposal already resolved → cleared from state, top of bonePile moved to burnPile
    expect(result.newState.burnProposal).toBeUndefined();
    const proposer = result.newState.players.find((p) => p.id === 'p1')!;
    expect(proposer.bonePile.length).toBe(before - 1);
    expect(proposer.burnPile.length).toBe(1);
  });

  it('multi-human: proposal stays pending until other human votes', () => {
    const state = freshState([{}, {}]);
    const r1 = executeMove(state, 'p1', { type: 'propose-burn' });
    expect(r1.error).toBeUndefined();
    expect(r1.newState.burnProposal).toBeDefined();
    expect(r1.newState.burnProposal!.votes).toEqual({ p1: 'yes', p2: 'pending' });
    // Bone pile is unchanged until the vote resolves
    expect(r1.newState.players[0].bonePile.length).toBe(state.players[0].bonePile.length);
  });

  it('multi-human: second human voting "yes" executes the burn', () => {
    const state = freshState([{}, {}]);
    const r1 = executeMove(state, 'p1', { type: 'propose-burn' });
    const r2 = executeMove(r1.newState, 'p2', { type: 'vote-burn', vote: 'yes' });
    expect(r2.error).toBeUndefined();
    expect(r2.newState.burnProposal).toBeUndefined();
    const proposer = r2.newState.players.find((p) => p.id === 'p1')!;
    expect(proposer.burnPile.length).toBe(1);
  });

  it('multi-human: second human voting "no" cancels without burning', () => {
    const state = freshState([{}, {}]);
    const before = state.players[0].bonePile.length;
    const r1 = executeMove(state, 'p1', { type: 'propose-burn' });
    const r2 = executeMove(r1.newState, 'p2', { type: 'vote-burn', vote: 'no' });
    expect(r2.error).toBeUndefined();
    expect(r2.newState.burnProposal).toBeUndefined();
    const proposer = r2.newState.players.find((p) => p.id === 'p1')!;
    expect(proposer.burnPile.length).toBe(0);
    expect(proposer.bonePile.length).toBe(before); // untouched
  });

  it('rejects propose-burn when bone pile is empty', () => {
    const state = freshState([{}, { isAI: true }]);
    state.players[0].bonePile = [];
    const r = executeMove(state, 'p1', { type: 'propose-burn' });
    expect(r.error).toMatch(/no cards left/i);
  });

  it('rejects propose-burn while a vote is already in progress', () => {
    const state = freshState([{}, {}]);
    const r1 = executeMove(state, 'p1', { type: 'propose-burn' });
    const r2 = executeMove(r1.newState, 'p1', { type: 'propose-burn' });
    expect(r2.error).toMatch(/already in progress/i);
  });

  it('rejects vote-burn with no active proposal', () => {
    const state = freshState([{}, {}]);
    const r = executeMove(state, 'p2', { type: 'vote-burn', vote: 'yes' });
    expect(r.error).toMatch(/no burn vote/i);
  });

  it('rejects double-vote from the same player', () => {
    const state = freshState([{}, {}, {}]);
    const r1 = executeMove(state, 'p1', { type: 'propose-burn' });
    const r2 = executeMove(r1.newState, 'p2', { type: 'vote-burn', vote: 'yes' });
    // p3 still pending; p2 voting again should be rejected
    const r3 = executeMove(r2.newState, 'p2', { type: 'vote-burn', vote: 'no' });
    expect(r3.error).toMatch(/already voted/i);
  });

  it('burned cards count as -2 in fullHand scoring', () => {
    const state = freshState([{}, { isAI: true }]);
    // Burn one card via the solo-vs-AI fast path
    const r1 = executeMove(state, 'p1', { type: 'propose-burn' });
    // Empty p1's bone pile so they can declare out, and zero out tableau / draw
    // pile too so the score isolates the burn penalty.
    const p1 = r1.newState.players.find((p) => p.id === 'p1')!;
    p1.bonePile = [];
    p1.tableau = [[], [], [], []];
    p1.drawPile = [];
    p1.currentDraw = [];
    const r2 = executeMove(r1.newState, 'p1', { type: 'declare-out' });
    expect(r2.error).toBeUndefined();
    const result = r2.newState.roundResults!.find((r) => r.playerId === 'p1')!;
    // foundationCards 0 - bonePile 0 - burnPile(1)*2 + declareOut bonus 5 = +3
    expect(result.burnedCards).toBe(1);
    expect(result.roundScore).toBe(3);
  });
});
