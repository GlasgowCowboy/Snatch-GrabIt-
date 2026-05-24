import { describe, it, expect, beforeEach } from 'vitest';
import { finalizeFinishedGame, settleGameBets } from '../gameSocket';
import { storage } from '../storage';
import { MemoryStorage } from '../storage-memory';
import type { GameState } from '@shared/schema';

function makeGameOverState(): GameState {
  return {
    id: 'game-test',
    status: 'gameOver',
    winnerId: 'p1',
    declaredOutId: 'p1',
    scoringSettings: { method: 'fullHand', targetScore: 50 },
    foundations: [],
    players: [
      { id: 'p1', name: 'Alice', tableau: [[], [], [], []], bonePile: [], drawPile: [], currentDraw: [], burnPile: [], score: 50 },
      { id: 'p2', name: 'Bob', tableau: [[], [], [], []], bonePile: [], drawPile: [], currentDraw: [], burnPile: [], score: 30 },
      { id: 'p3', name: 'Carol', tableau: [[], [], [], []], bonePile: [], drawPile: [], currentDraw: [], burnPile: [], score: 10 },
    ],
  };
}

describe('finalizeFinishedGame', () => {
  beforeEach(() => {
    if (!(storage instanceof MemoryStorage)) {
      throw new Error('Test requires MemoryStorage; do not set DATABASE_URL when running tests');
    }
  });

  it('updates an existing game row and adds one participant per player', async () => {
    const initial = await storage.createGame({ scoringMethod: 'fullHand', targetScore: 50 });
    expect(initial.finishedAt).toBeNull();
    expect(initial.winnerId).toBeNull();

    const state = makeGameOverState();
    await finalizeFinishedGame(initial.id, state);

    const games = (storage as MemoryStorage)['gamesList'];
    const game = games.get(initial.id)!;
    expect(game.scoringMethod).toBe('fullHand');
    expect(game.targetScore).toBe(50);
    expect(game.winnerId).toBeNull(); // no userId map → null
    expect(game.finishedAt).toBeInstanceOf(Date);

    const participants = (storage as MemoryStorage)['participants'].filter(
      (p) => p.gameId === initial.id,
    );
    expect(participants).toHaveLength(3);
    const byPlacement = [...participants].sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0));
    expect(byPlacement.map((p) => p.playerName)).toEqual(['Alice', 'Bob', 'Carol']);
    expect(byPlacement.map((p) => p.score)).toEqual([50, 30, 10]);
    expect(byPlacement[0].declaredOut).toBe(true);
  });

  it('resolves winnerId and per-player userId from the auth mapping', async () => {
    const initial = await storage.createGame({ scoringMethod: 'fullHand', targetScore: 50 });
    const state = makeGameOverState();
    const userIdMap = new Map<string, string | null>([
      ['p1', 'user-alice'],
      ['p2', null],
      ['p3', 'user-carol'],
    ]);
    await finalizeFinishedGame(initial.id, state, userIdMap);

    const game = (storage as MemoryStorage)['gamesList'].get(initial.id)!;
    expect(game.winnerId).toBe('user-alice');

    const participants = (storage as MemoryStorage)['participants']
      .filter((p) => p.gameId === initial.id)
      .sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0));
    expect(participants.map((p) => p.userId)).toEqual(['user-alice', null, 'user-carol']);
  });

  it('grants earned credits per placement + declare-out, skipping non-auth players', async () => {
    // Real users with profiles — credits land in their persistent balance.
    const alice = await storage.createUser({ username: 'alice-credits-' + Date.now(), password: 'x', email: null }, 'Alice');
    const carol = await storage.createUser({ username: 'carol-credits-' + Date.now(), password: 'x', email: null }, 'Carol');
    const initial = await storage.createGame({ scoringMethod: 'fullHand', targetScore: 50 });
    const state = makeGameOverState(); // p1 (Alice) wins + declares out, p3 (Carol) 3rd, p2 anonymous
    const userIdMap = new Map<string, string | null>([
      ['p1', alice.id],
      ['p2', null],          // guest / AI — no grant
      ['p3', carol.id],
    ]);
    await finalizeFinishedGame(initial.id, state, userIdMap);

    const aliceProfile = (await storage.getUserProfile(alice.id))!;
    const carolProfile = (await storage.getUserProfile(carol.id))!;
    // Alice: 100 (1st) + 25 (declared out) = 125
    expect(aliceProfile.earnedCredits).toBe(125);
    // Carol: 10 (3rd) + 0 (didn't declare) = 10
    expect(carolProfile.earnedCredits).toBe(10);
  });
});

describe('settleGameBets', () => {
  beforeEach(() => {
    if (!(storage instanceof MemoryStorage)) {
      throw new Error('Test requires MemoryStorage');
    }
  });

  async function setupFinishedGame() {
    // A pre-existing user with a chip balance so updateBetStatus can credit them
    const user = await storage.createUser({ username: 'bettor-' + Date.now(), password: 'x', email: null }, 'Bettor');
    const game = await storage.createGame({ scoringMethod: 'fullHand', targetScore: 50 });
    const state = makeGameOverState();
    const userIdMap = new Map<string, string | null>([
      ['p1', 'user-alice'],
      ['p2', null],
      ['p3', 'user-carol'],
    ]);
    await finalizeFinishedGame(game.id, state, userIdMap);
    return { gameId: game.id, bettorUserId: user.id };
  }

  it('pays out a winning "winner" bet and marks a losing one lost', async () => {
    const { gameId, bettorUserId } = await setupFinishedGame();
    const profileBefore = (await storage.getUserProfile(bettorUserId))!;
    const startingChips = profileBefore.virtualChips;

    // Wager on Alice (placement 1) — should win
    const aliceBet = await storage.placeBet({
      gameId, bettorUserId, bettorName: 'Bettor',
      betType: 'winner', targetUserId: 'user-alice', targetPlayerName: 'Alice',
      chipAmount: 50, payout: 100, status: 'pending',
    });
    // Wager on Carol (placement 3) — should lose
    const carolBet = await storage.placeBet({
      gameId, bettorUserId, bettorName: 'Bettor',
      betType: 'winner', targetUserId: 'user-carol', targetPlayerName: 'Carol',
      chipAmount: 20, payout: 40, status: 'pending',
    });

    await settleGameBets(gameId);

    const settled = await storage.getUserBets(bettorUserId, 10);
    const aliceSettled = settled.find((b) => b.id === aliceBet.id)!;
    const carolSettled = settled.find((b) => b.id === carolBet.id)!;
    expect(aliceSettled.status).toBe('won');
    expect(carolSettled.status).toBe('lost');

    const profileAfter = (await storage.getUserProfile(bettorUserId))!;
    // Wagered 50+20=70, won 100 back → net +30
    expect(profileAfter.virtualChips).toBe(startingChips + 30);
  });

  it('is idempotent: pending bets only', async () => {
    const { gameId, bettorUserId } = await setupFinishedGame();
    const bet = await storage.placeBet({
      gameId, bettorUserId, bettorName: 'Bettor',
      betType: 'winner', targetUserId: 'user-alice', targetPlayerName: 'Alice',
      chipAmount: 10, payout: 20, status: 'pending',
    });

    await settleGameBets(gameId);
    const profileMid = (await storage.getUserProfile(bettorUserId))!;
    const chipsMid = profileMid.virtualChips;

    await settleGameBets(gameId); // second pass — no-op
    const profileEnd = (await storage.getUserProfile(bettorUserId))!;
    expect(profileEnd.virtualChips).toBe(chipsMid);

    const settled = await storage.getUserBets(bettorUserId, 10);
    expect(settled.find((b) => b.id === bet.id)!.status).toBe('won');
  });
});
