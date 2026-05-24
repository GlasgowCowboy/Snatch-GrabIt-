// End-to-end smoke for bet settlement against a real DB.
// Assumes the dev server is NOT running (so this script owns the storage).
//
// Usage:
//   DATABASE_URL=postgresql://... tsx scripts/smoke-settlement.ts <bettorUserId> <gameDbId> <winnerUserId>
//
// - bettorUserId: who places the bet
// - gameDbId:     existing games.id (e.g. created via POST /api/rooms)
// - winnerUserId: the auth user id assigned to p1 in the synthetic finished state

import { finalizeFinishedGame, settleGameBets } from '../server/gameSocket';
import { storage } from '../server/storage';
import type { GameState } from '../shared/schema';

async function main() {
  const [bettorUserId, gameDbId, winnerUserId] = process.argv.slice(2);
  if (!bettorUserId || !gameDbId || !winnerUserId) {
    console.error('usage: tsx scripts/smoke-settlement.ts <bettorUserId> <gameDbId> <winnerUserId>');
    process.exit(1);
  }

  const profile = await storage.getUserProfile(bettorUserId);
  if (!profile) throw new Error('bettor profile not found');
  console.log('bettor chips before:', profile.virtualChips);

  // Place a "winner" bet on Alice (the eventual winner) — 50 chips, payout 100.
  const winBet = await storage.placeBet({
    gameId: gameDbId,
    bettorUserId,
    bettorName: 'Bettor',
    betType: 'winner',
    targetUserId: winnerUserId,
    targetPlayerName: 'Alice',
    chipAmount: 50,
    payout: 100,
    status: 'pending',
  });
  console.log('placed winner-on-Alice bet:', winBet.id);

  // And a losing bet on Bob — 20 chips, payout 40.
  const loseBet = await storage.placeBet({
    gameId: gameDbId,
    bettorUserId,
    bettorName: 'Bettor',
    betType: 'winner',
    targetUserId: null,
    targetPlayerName: 'Bob',
    chipAmount: 20,
    payout: 40,
    status: 'pending',
  });
  console.log('placed winner-on-Bob bet:', loseBet.id);

  const profileMid = await storage.getUserProfile(bettorUserId);
  console.log('bettor chips after bets placed:', profileMid!.virtualChips);

  // Finalize the game with Alice (p1) as the winner.
  const state: GameState = {
    id: 'game-fake-' + Date.now(),
    status: 'gameOver',
    winnerId: 'p1',
    declaredOutId: 'p1',
    scoringSettings: { method: 'fullHand', targetScore: 50 },
    foundations: [],
    players: [
      { id: 'p1', name: 'Alice', tableau: [[], [], [], []], bonePile: [], drawPile: [], currentDraw: [], burnPile: [], score: 55 },
      { id: 'p2', name: 'Bob', tableau: [[], [], [], []], bonePile: [], drawPile: [], currentDraw: [], burnPile: [], score: 22 },
    ],
  };
  // Stamp started_at so the row mirrors a real lifecycle (createRoom → startGame
  // → finalize), not just a finalized stub. Without this the row leaves started_at
  // NULL and trips up analytics + ordering invariants.
  await storage.updateGame(gameDbId, { startedAt: new Date() });
  await finalizeFinishedGame(gameDbId, state, new Map([['p1', winnerUserId], ['p2', null]]));
  await settleGameBets(gameDbId);

  const profileEnd = await storage.getUserProfile(bettorUserId);
  console.log('bettor chips after settlement:', profileEnd!.virtualChips);

  const bets = await storage.getUserBets(bettorUserId, 5);
  for (const b of bets.slice(0, 2)) {
    console.log(`  bet ${b.id.slice(0, 8)} on ${b.targetPlayerName}: status=${b.status} payout=${b.payout} stake=${b.chipAmount}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
