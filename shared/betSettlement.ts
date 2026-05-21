import type { GameParticipant, VirtualBet } from "./schema";

export type BetOutcome = 'won' | 'lost' | 'void';

function findParticipant(
  participants: GameParticipant[],
  userId: string | null | undefined,
  playerName: string | null | undefined,
): GameParticipant | null {
  if (userId) {
    const byUser = participants.find((p) => p.userId === userId);
    if (byUser) return byUser;
  }
  if (playerName) {
    const byName = participants.find((p) => p.playerName === playerName);
    if (byName) return byName;
  }
  return null;
}

/**
 * Pure function: given a bet and the final list of participants, decide whether
 * it won, lost, or should be voided (target missing / unsupported bet type).
 *
 * Bet semantics:
 *   - winner:     bet wins if the targeted player finished 1st
 *   - declareOut: bet wins if the targeted player declared out
 *   - confidence: bet wins if the bettor themselves finished 1st (1.5x payout)
 *   - sidebet:    semantics undefined → void & refund the stake
 */
export function determineBetOutcome(
  bet: Pick<
    VirtualBet,
    'betType' | 'targetUserId' | 'targetPlayerName' | 'bettorUserId' | 'bettorName'
  >,
  participants: GameParticipant[],
): BetOutcome {
  switch (bet.betType) {
    case 'winner': {
      const target = findParticipant(participants, bet.targetUserId, bet.targetPlayerName);
      if (!target) return 'void';
      return target.placement === 1 ? 'won' : 'lost';
    }
    case 'declareOut': {
      const target = findParticipant(participants, bet.targetUserId, bet.targetPlayerName);
      if (!target) return 'void';
      return target.declaredOut ? 'won' : 'lost';
    }
    case 'confidence': {
      const bettor = findParticipant(participants, bet.bettorUserId, bet.bettorName);
      if (!bettor) return 'void';
      return bettor.placement === 1 ? 'won' : 'lost';
    }
    case 'sidebet':
    default:
      return 'void';
  }
}
