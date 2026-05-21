import { describe, it, expect } from 'vitest';
import { determineBetOutcome } from '../betSettlement';
import type { GameParticipant } from '../schema';

function participant(p: Partial<GameParticipant>): GameParticipant {
  return {
    id: 'p-' + Math.random().toString(36).slice(2, 8),
    gameId: 'g',
    userId: null,
    playerName: 'X',
    score: 0,
    placement: null,
    declaredOut: false,
    ...p,
  };
}

const PARTICIPANTS: GameParticipant[] = [
  participant({ userId: 'u-alice', playerName: 'Alice', placement: 1, declaredOut: true }),
  participant({ userId: 'u-bob', playerName: 'Bob', placement: 2 }),
  participant({ userId: null, playerName: 'Carol', placement: 3 }),
];

describe('determineBetOutcome', () => {
  it('winner bet wins when target is placement 1', () => {
    expect(
      determineBetOutcome(
        { betType: 'winner', targetUserId: 'u-alice', targetPlayerName: 'Alice', bettorUserId: null, bettorName: 'X' },
        PARTICIPANTS,
      ),
    ).toBe('won');
  });

  it('winner bet loses when target is not placement 1', () => {
    expect(
      determineBetOutcome(
        { betType: 'winner', targetUserId: 'u-bob', targetPlayerName: 'Bob', bettorUserId: null, bettorName: 'X' },
        PARTICIPANTS,
      ),
    ).toBe('lost');
  });

  it('declareOut bet wins when target declared out', () => {
    expect(
      determineBetOutcome(
        { betType: 'declareOut', targetUserId: 'u-alice', targetPlayerName: 'Alice', bettorUserId: null, bettorName: 'X' },
        PARTICIPANTS,
      ),
    ).toBe('won');
  });

  it('declareOut bet loses when target did not declare', () => {
    expect(
      determineBetOutcome(
        { betType: 'declareOut', targetUserId: 'u-bob', targetPlayerName: 'Bob', bettorUserId: null, bettorName: 'X' },
        PARTICIPANTS,
      ),
    ).toBe('lost');
  });

  it('confidence bet wins when bettor finished 1st', () => {
    expect(
      determineBetOutcome(
        { betType: 'confidence', targetUserId: null, targetPlayerName: null, bettorUserId: 'u-alice', bettorName: 'Alice' },
        PARTICIPANTS,
      ),
    ).toBe('won');
  });

  it('confidence bet loses when bettor did not finish 1st', () => {
    expect(
      determineBetOutcome(
        { betType: 'confidence', targetUserId: null, targetPlayerName: null, bettorUserId: 'u-bob', bettorName: 'Bob' },
        PARTICIPANTS,
      ),
    ).toBe('lost');
  });

  it('voids when the target is not in the participant list', () => {
    expect(
      determineBetOutcome(
        { betType: 'winner', targetUserId: 'u-ghost', targetPlayerName: 'Ghost', bettorUserId: null, bettorName: 'X' },
        PARTICIPANTS,
      ),
    ).toBe('void');
  });

  it('falls back to playerName when userId is missing', () => {
    expect(
      determineBetOutcome(
        { betType: 'winner', targetUserId: null, targetPlayerName: 'Carol', bettorUserId: null, bettorName: 'X' },
        PARTICIPANTS,
      ),
    ).toBe('lost');
  });

  it('voids sidebets (semantics undefined)', () => {
    expect(
      determineBetOutcome(
        { betType: 'sidebet', targetUserId: 'u-alice', targetPlayerName: 'Alice', bettorUserId: null, bettorName: 'X' },
        PARTICIPANTS,
      ),
    ).toBe('void');
  });
});
