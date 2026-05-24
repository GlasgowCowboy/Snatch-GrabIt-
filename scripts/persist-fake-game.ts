// One-shot script: create a synthetic finished game in the configured database
// for manual verification of the persistence + history path without driving a
// full multiplayer game.
//
// Usage:
//   DATABASE_URL=postgresql://... tsx scripts/persist-fake-game.ts <userId>

import { finalizeFinishedGame } from '../server/gameSocket';
import { storage } from '../server/storage';
import type { GameState } from '../shared/schema';

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error('usage: tsx scripts/persist-fake-game.ts <userId>');
    process.exit(1);
  }

  const state: GameState = {
    id: 'game-fake-' + Date.now(),
    status: 'gameOver',
    winnerId: 'p1',
    declaredOutId: 'p1',
    scoringSettings: { method: 'fullHand', targetScore: 50 },
    foundations: [],
    players: [
      { id: 'p1', name: 'Alice', tableau: [[], [], [], []], bonePile: [], drawPile: [], currentDraw: [], burnPile: [], score: 55 },
      { id: 'p2', name: 'Bob (AI)', tableau: [[], [], [], []], bonePile: [], drawPile: [], currentDraw: [], burnPile: [], score: 22 },
    ],
  };

  const userIdMap = new Map<string, string | null>([
    ['p1', userId],
    ['p2', null],
  ]);

  const game = await storage.createGame({
    scoringMethod: state.scoringSettings.method,
    targetScore: state.scoringSettings.targetScore,
  });
  // Mirror the real lifecycle: lobby createGame → startGame stamps started_at →
  // game ends → finalizeFinishedGame stamps finished_at.
  await storage.updateGame(game.id, { startedAt: new Date() });
  await finalizeFinishedGame(game.id, state, userIdMap);
  console.log('persisted', game.id);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
