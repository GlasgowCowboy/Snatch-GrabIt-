import { describe, it, expect } from 'vitest';
import { createInitialGameState, executeMove } from '../gameEngine';
import type { Card, GameState } from '../schema';

function makeCard(suit: Card['suit'], rank: Card['rank']): Card {
  return { suit, rank, id: `t-${suit}-${rank}-${Math.random()}` };
}

function freshState(): GameState {
  return createInitialGameState(
    [
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
    ],
    { method: 'fullHand', targetScore: 50 },
  );
}

describe('burn-draw-card', () => {
  it('moves the selected currentDraw card to the bottom of the draw pile', () => {
    const state = freshState();
    const player = state.players.find((p) => p.id === 'p1')!;
    // Deterministic setup: 4-card draw pile, 2 face-up cards.
    const A = makeCard('hearts', 'A');
    const B = makeCard('spades', '2');
    const C = makeCard('diamonds', '3');
    const D = makeCard('clubs', '4');
    const Burn = makeCard('hearts', '7');
    const Other = makeCard('spades', '8');
    // drawPile is drawn from the end (top of pile). Top is D.
    player.drawPile = [A, B, C, D];
    player.currentDraw = [Other, Burn];

    const r = executeMove(state, 'p1', { type: 'burn-draw-card', drawCardIndex: 1 });
    expect(r.error).toBeUndefined();

    const p = r.newState.players.find((p) => p.id === 'p1')!;
    // Burned card removed from currentDraw
    expect(p.currentDraw.map((c) => c.rank)).toEqual(['8']);
    // Bottom-of-pile (index 0) is now the burned card.
    expect(p.drawPile[0].rank).toBe('7');
    // Next-up card (D, the previous top) was also shifted to the bottom — at
    // index 1 — so the next flip-3 reveals A/B/C instead of B/C/D.
    expect(p.drawPile[1].rank).toBe('4');
    // The new top of the pile is C (one step deeper than before).
    expect(p.drawPile[p.drawPile.length - 1].rank).toBe('3');
    // Total length preserved overall: -1 from currentDraw, +1 to drawPile (the
    // burned card); the "skipped" card just moved within drawPile.
    expect(p.drawPile.length).toBe(5);
  });

  it('rejects burn with an invalid draw card index', () => {
    const state = freshState();
    const player = state.players.find((p) => p.id === 'p1')!;
    player.currentDraw = [makeCard('hearts', '5')];

    const tooHigh = executeMove(state, 'p1', { type: 'burn-draw-card', drawCardIndex: 3 });
    expect(tooHigh.error).toMatch(/invalid draw card index/i);

    const negative = executeMove(state, 'p1', { type: 'burn-draw-card', drawCardIndex: -1 });
    expect(negative.error).toMatch(/invalid draw card index/i);
  });

  it('falls back to a simple move when the draw pile is empty (no skip-next)', () => {
    const state = freshState();
    const player = state.players.find((p) => p.id === 'p1')!;
    const Burn = makeCard('clubs', 'Q');
    player.drawPile = [];
    player.currentDraw = [Burn, makeCard('hearts', '9')];

    const r = executeMove(state, 'p1', { type: 'burn-draw-card', drawCardIndex: 0 });
    expect(r.error).toBeUndefined();

    const p = r.newState.players.find((p) => p.id === 'p1')!;
    expect(p.currentDraw.map((c) => c.rank)).toEqual(['9']);
    expect(p.drawPile.map((c) => c.rank)).toEqual(['Q']);
  });
});

describe('draw pile cycle preserves dealt order', () => {
  it('refills without reversing — same flip-3 order on every cycle', () => {
    const state = freshState();
    const player = state.players.find((p) => p.id === 'p1')!;
    // Tiny deterministic deck so we can verify the cycle.
    const a = makeCard('hearts', '2');
    const b = makeCard('hearts', '3');
    const c = makeCard('hearts', '4');
    const d = makeCard('hearts', '5');
    const e = makeCard('hearts', '6');
    const f = makeCard('hearts', '7');
    player.drawPile = [a, b, c, d, e, f];
    player.currentDraw = [];

    // First flip-3: takes [d, e, f] off the end.
    const r1 = executeMove(state, 'p1', { type: 'draw-pile' });
    const p1 = r1.newState.players.find((p) => p.id === 'p1')!;
    expect(p1.currentDraw.map((c) => c.rank)).toEqual(['5', '6', '7']);
    expect(p1.drawPile.map((c) => c.rank)).toEqual(['2', '3', '4']);

    // Second flip-3: empties the pile.
    const r2 = executeMove(r1.newState, 'p1', { type: 'draw-pile' });
    const p2 = r2.newState.players.find((p) => p.id === 'p1')!;
    expect(p2.currentDraw.map((c) => c.rank)).toEqual(['5', '6', '7', '2', '3', '4']);
    expect(p2.drawPile).toEqual([]);

    // Refill cycle: drawPile = [...currentDraw] (no reverse). currentDraw
    // is cleared; drawPile carries the same dealt order through the cycle.
    const r3 = executeMove(r2.newState, 'p1', { type: 'draw-pile' });
    const p3 = r3.newState.players.find((p) => p.id === 'p1')!;
    expect(p3.drawPile.map((c) => c.rank)).toEqual(['5', '6', '7', '2', '3', '4']);
    expect(p3.currentDraw).toEqual([]);

    // Next flip-3 after the refill: splice from the end again — same chunk
    // we drew on the very first flip in the previous cycle (preserved order).
    const r4 = executeMove(r3.newState, 'p1', { type: 'draw-pile' });
    const p4 = r4.newState.players.find((p) => p.id === 'p1')!;
    expect(p4.currentDraw.map((c) => c.rank)).toEqual(['2', '3', '4']);
    expect(p4.drawPile.map((c) => c.rank)).toEqual(['5', '6', '7']);
  });
});
