import { describe, it, expect } from 'vitest';
import {
  createInitialGameState,
  executeMove,
  startNewRound,
  getRankValue,
  isRed,
  canPlayOnFoundation,
  canPlayOnTableau,
  calculateRoundResults,
  GameMove,
} from '../gameEngine';
import { Card, GameState, PlayerState } from '../schema';

// ── Helper to build a minimal game state for testing ────────────────────────

function makeCard(suit: Card['suit'], rank: Card['rank'], playedBy?: string): Card {
  return { suit, rank, id: `test-${suit}-${rank}-${Math.random()}`, playedBy };
}

function twoPlayerState(): GameState {
  return createInitialGameState(
    [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ],
    { method: 'fullHand', targetScore: 50 },
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

describe('getRankValue', () => {
  it('maps Ace to 1 and King to 13', () => {
    expect(getRankValue('A')).toBe(1);
    expect(getRankValue('K')).toBe(13);
    expect(getRankValue('5')).toBe(5);
  });
});

describe('isRed', () => {
  it('hearts and diamonds are red', () => {
    expect(isRed('hearts')).toBe(true);
    expect(isRed('diamonds')).toBe(true);
    expect(isRed('clubs')).toBe(false);
    expect(isRed('spades')).toBe(false);
  });
});

// ── Foundation validation ───────────────────────────────────────────────────

describe('canPlayOnFoundation', () => {
  it('allows Ace on empty foundation', () => {
    expect(canPlayOnFoundation(makeCard('hearts', 'A'), [])).toBe(true);
  });

  it('rejects non-Ace on empty foundation', () => {
    expect(canPlayOnFoundation(makeCard('hearts', '2'), [])).toBe(false);
  });

  it('allows next rank same suit', () => {
    const foundation = [makeCard('hearts', 'A')];
    expect(canPlayOnFoundation(makeCard('hearts', '2'), foundation)).toBe(true);
  });

  it('rejects wrong suit', () => {
    const foundation = [makeCard('hearts', 'A')];
    expect(canPlayOnFoundation(makeCard('spades', '2'), foundation)).toBe(false);
  });

  it('rejects skip in rank', () => {
    const foundation = [makeCard('hearts', 'A')];
    expect(canPlayOnFoundation(makeCard('hearts', '3'), foundation)).toBe(false);
  });
});

// ── Tableau validation ──────────────────────────────────────────────────────

describe('canPlayOnTableau', () => {
  it('allows any card on empty column', () => {
    expect(canPlayOnTableau(makeCard('hearts', 'K'), [])).toBe(true);
  });

  it('allows descending alternating colors', () => {
    const column = [makeCard('spades', '5')]; // black
    expect(canPlayOnTableau(makeCard('hearts', '4'), column)).toBe(true); // red
  });

  it('rejects same color', () => {
    const column = [makeCard('spades', '5')]; // black
    expect(canPlayOnTableau(makeCard('clubs', '4'), column)).toBe(false); // also black
  });

  it('rejects ascending rank', () => {
    const column = [makeCard('spades', '5')];
    expect(canPlayOnTableau(makeCard('hearts', '6'), column)).toBe(false);
  });
});

// ── createInitialGameState ──────────────────────────────────────────────────

describe('createInitialGameState', () => {
  it('creates correct deck distribution', () => {
    const state = twoPlayerState();

    expect(state.players).toHaveLength(2);
    expect(state.foundations).toHaveLength(0);
    expect(state.status).toBe('playing');

    for (const player of state.players) {
      expect(player.bonePile).toHaveLength(13);
      expect(player.tableau).toHaveLength(4);
      for (const col of player.tableau) {
        expect(col).toHaveLength(1);
      }
      expect(player.drawPile).toHaveLength(35);
      expect(player.currentDraw).toHaveLength(0);
      expect(player.score).toBe(0);

      // Total = 13 + 4 + 35 = 52
      const total = player.bonePile.length +
        player.tableau.reduce((s, c) => s + c.length, 0) +
        player.drawPile.length;
      expect(total).toBe(52);
    }
  });

  it('preserves scoring settings', () => {
    const state = createInitialGameState(
      [{ id: 'p1', name: 'A' }],
      { method: 'round', targetScore: 5 },
    );
    expect(state.scoringSettings.method).toBe('round');
    expect(state.scoringSettings.targetScore).toBe(5);
  });
});

// ── executeMove: draw-pile ──────────────────────────────────────────────────

describe('executeMove - draw-pile', () => {
  it('draws up to 3 cards from draw pile', () => {
    const state = twoPlayerState();
    const result = executeMove(state, 'p1', { type: 'draw-pile' });

    expect(result.error).toBeUndefined();
    const player = result.newState.players.find(p => p.id === 'p1')!;
    expect(player.currentDraw.length).toBeLessThanOrEqual(3);
    expect(player.currentDraw.length).toBeGreaterThan(0);
    expect(player.drawPile.length).toBe(35 - player.currentDraw.length);
  });

  it('recycles when draw pile empty but current draw has cards', () => {
    const state = twoPlayerState();
    const player = state.players.find(p => p.id === 'p1')!;
    player.currentDraw = player.drawPile.splice(0);
    player.drawPile = [];

    const result = executeMove(state, 'p1', { type: 'draw-pile' });
    expect(result.error).toBeUndefined();
    const p = result.newState.players.find(p => p.id === 'p1')!;
    expect(p.drawPile.length).toBeGreaterThan(0);
    expect(p.currentDraw).toHaveLength(0);
  });
});

// ── executeMove: bone-to-foundation ─────────────────────────────────────────

describe('executeMove - bone-to-foundation', () => {
  it('creates new foundation with Ace from bone pile', () => {
    const state = twoPlayerState();
    const player = state.players.find(p => p.id === 'p1')!;
    // Place an Ace on top of bone pile
    player.bonePile.push(makeCard('hearts', 'A'));

    const result = executeMove(state, 'p1', { type: 'bone-to-foundation', foundationIndex: -1 });
    expect(result.error).toBeUndefined();
    expect(result.newState.foundations).toHaveLength(1);
    expect(result.newState.foundations[0].suit).toBe('hearts');
    expect(result.newState.foundations[0].cards[0].playedBy).toBe('p1');
  });

  it('rejects non-Ace for new foundation', () => {
    const state = twoPlayerState();
    const player = state.players.find(p => p.id === 'p1')!;
    player.bonePile.push(makeCard('hearts', '5'));

    const result = executeMove(state, 'p1', { type: 'bone-to-foundation', foundationIndex: -1 });
    expect(result.error).toBeDefined();
  });

  it('plays card on existing foundation', () => {
    const state = twoPlayerState();
    state.foundations.push({ suit: 'hearts', cards: [makeCard('hearts', 'A')] });
    const player = state.players.find(p => p.id === 'p1')!;
    player.bonePile.push(makeCard('hearts', '2'));

    const result = executeMove(state, 'p1', { type: 'bone-to-foundation', foundationIndex: 0 });
    expect(result.error).toBeUndefined();
    expect(result.newState.foundations[0].cards).toHaveLength(2);
  });
});

// ── executeMove: bone-to-tableau ────────────────────────────────────────────

describe('executeMove - bone-to-tableau', () => {
  it('places bone card on empty tableau column', () => {
    const state = twoPlayerState();
    const player = state.players.find(p => p.id === 'p1')!;
    player.tableau[0] = []; // empty column

    const bonePileLen = player.bonePile.length;
    const result = executeMove(state, 'p1', { type: 'bone-to-tableau', targetColumn: 0 });
    expect(result.error).toBeUndefined();
    const p = result.newState.players.find(p => p.id === 'p1')!;
    expect(p.tableau[0]).toHaveLength(1);
    expect(p.bonePile).toHaveLength(bonePileLen - 1);
  });
});

// ── executeMove: tableau-to-tableau ─────────────────────────────────────────

describe('executeMove - tableau-to-tableau', () => {
  it('moves stack of cards between columns', () => {
    const state = twoPlayerState();
    const player = state.players.find(p => p.id === 'p1')!;

    // Set up valid stack move: black 5, red 4 in col 0 → col 1 with red 6
    player.tableau[0] = [makeCard('spades', '5'), makeCard('hearts', '4')];
    player.tableau[1] = [makeCard('hearts', '6')];

    const result = executeMove(state, 'p1', {
      type: 'tableau-to-tableau',
      sourceColumn: 0,
      cardIndex: 0, // move both cards (5 and 4)
      targetColumn: 1,
    });

    expect(result.error).toBeUndefined();
    const p = result.newState.players.find(p => p.id === 'p1')!;
    expect(p.tableau[0]).toHaveLength(0);
    expect(p.tableau[1]).toHaveLength(3);
  });

  it('rejects move to same column', () => {
    const state = twoPlayerState();
    const result = executeMove(state, 'p1', {
      type: 'tableau-to-tableau',
      sourceColumn: 0,
      cardIndex: 0,
      targetColumn: 0,
    });
    expect(result.error).toBeDefined();
  });
});

// ── executeMove: declare-out ────────────────────────────────────────────────

describe('executeMove - declare-out', () => {
  it('ends round when bone pile is empty', () => {
    const state = twoPlayerState();
    const player = state.players.find(p => p.id === 'p1')!;
    player.bonePile = []; // empty bone pile

    const result = executeMove(state, 'p1', { type: 'declare-out' });
    expect(result.error).toBeUndefined();
    expect(result.newState.declaredOutId).toBe('p1');
    expect(['roundEnded', 'gameOver']).toContain(result.newState.status);
    expect(result.newState.roundResults).toBeDefined();
    expect(result.newState.roundResults!.length).toBe(2);
  });

  it('rejects declare-out with cards in bone pile', () => {
    const state = twoPlayerState();
    const result = executeMove(state, 'p1', { type: 'declare-out' });
    expect(result.error).toBeDefined();
  });

  it('triggers gameOver when target score reached', () => {
    const state = twoPlayerState();
    const player = state.players.find(p => p.id === 'p1')!;
    player.bonePile = [];
    player.score = 48; // close to 50 target

    // Add some foundation cards for scoring
    state.foundations.push({
      suit: 'hearts',
      cards: [
        makeCard('hearts', 'A', 'p1'),
        makeCard('hearts', '2', 'p1'),
        makeCard('hearts', '3', 'p1'),
      ],
    });

    const result = executeMove(state, 'p1', { type: 'declare-out' });
    expect(result.error).toBeUndefined();
    // 48 + 3 foundation cards + 5 declare out bonus = 56 >= 50
    expect(result.newState.status).toBe('gameOver');
    expect(result.newState.winnerId).toBe('p1');
  });
});

// ── Scoring ─────────────────────────────────────────────────────────────────

describe('calculateRoundResults', () => {
  it('fullHand: +1 per foundation card, -2 per bone, +5 declare-out bonus', () => {
    const state = twoPlayerState();
    const p1 = state.players.find(p => p.id === 'p1')!;
    const p2 = state.players.find(p => p.id === 'p2')!;
    p1.bonePile = [];
    // p2 still has 13 bone cards

    state.foundations.push({
      suit: 'hearts',
      cards: [
        makeCard('hearts', 'A', 'p1'),
        makeCard('hearts', '2', 'p1'),
        makeCard('hearts', '3', 'p2'),
      ],
    });

    const results = calculateRoundResults(state, 'p1');
    const r1 = results.find(r => r.playerId === 'p1')!;
    const r2 = results.find(r => r.playerId === 'p2')!;

    expect(r1.foundationCards).toBe(2);
    expect(r1.bonePileRemaining).toBe(0);
    expect(r1.declaredOut).toBe(true);
    expect(r1.roundScore).toBe(2 + 5); // 2 foundation + 5 bonus

    expect(r2.foundationCards).toBe(1);
    expect(r2.bonePileRemaining).toBe(13);
    expect(r2.declaredOut).toBe(false);
    expect(r2.roundScore).toBe(1 - 26); // 1 foundation - 26 bone penalty
  });

  it('round scoring: only declarer gets 1 point', () => {
    const state = createInitialGameState(
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
      { method: 'round', targetScore: 3 },
    );
    state.players.find(p => p.id === 'p1')!.bonePile = [];

    const results = calculateRoundResults(state, 'p1');
    expect(results.find(r => r.playerId === 'p1')!.roundScore).toBe(1);
    expect(results.find(r => r.playerId === 'p2')!.roundScore).toBe(0);
  });
});

// ── startNewRound ───────────────────────────────────────────────────────────

describe('startNewRound', () => {
  it('redeals fresh decks and preserves scores', () => {
    const state = twoPlayerState();
    state.players[0].score = 15;
    state.players[1].score = 10;
    state.foundations.push({ suit: 'hearts', cards: [makeCard('hearts', 'A')] });
    state.status = 'roundEnded';

    const newState = startNewRound(state);

    expect(newState.status).toBe('playing');
    expect(newState.foundations).toHaveLength(0);
    expect(newState.roundResults).toBeUndefined();
    expect(newState.declaredOutId).toBeUndefined();

    // Scores preserved
    expect(newState.players[0].score).toBe(15);
    expect(newState.players[1].score).toBe(10);

    // Fresh decks
    for (const player of newState.players) {
      expect(player.bonePile).toHaveLength(13);
      expect(player.drawPile).toHaveLength(35);
      expect(player.roundScore).toBe(0);
    }
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('rejects moves when game is not playing', () => {
    const state = twoPlayerState();
    state.status = 'roundEnded';

    const result = executeMove(state, 'p1', { type: 'draw-pile' });
    expect(result.error).toBeDefined();
  });

  it('rejects moves for unknown player', () => {
    const state = twoPlayerState();
    const result = executeMove(state, 'unknown', { type: 'draw-pile' });
    expect(result.error).toBeDefined();
  });

  it('does not mutate original state', () => {
    const state = twoPlayerState();
    const originalBoneLen = state.players[0].bonePile.length;

    const player = state.players[0];
    player.tableau[0] = []; // empty col for valid move

    executeMove(state, 'p1', { type: 'bone-to-tableau', targetColumn: 0 });

    // Original state unchanged
    expect(state.players[0].bonePile.length).toBe(originalBoneLen);
  });
});
