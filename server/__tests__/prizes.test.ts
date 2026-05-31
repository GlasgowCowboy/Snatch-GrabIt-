import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from '../storage';
import { MemoryStorage } from '../storage-memory';
import { PRIZE_CATALOG, findPrize } from '@shared/prizes';

async function newUser(suffix: string) {
  return storage.createUser(
    { username: `prize-${suffix}-${Date.now()}`, password: 'x', email: null },
    `Prize ${suffix}`,
  );
}

describe('prize redemption', () => {
  beforeEach(() => {
    if (!(storage instanceof MemoryStorage)) {
      throw new Error('Test requires MemoryStorage');
    }
  });

  it('catalog is non-empty and every entry is well-formed', () => {
    expect(PRIZE_CATALOG.length).toBeGreaterThan(0);
    for (const p of PRIZE_CATALOG) {
      expect(p.id).toBeTruthy();
      expect(p.creditCost).toBeGreaterThan(0);
      expect(p.kind).toBe('extra_chips');
      expect(Number(p.payload.chips)).toBeGreaterThan(0);
    }
  });

  it('redeem deducts credits, applies payload, and records the redemption', async () => {
    const user = await newUser('happy');
    await storage.grantCredits(user.id, 250); // enough for the medium tier
    const profileBefore = (await storage.getUserProfile(user.id))!;
    const chipsBefore = profileBefore.virtualChips;

    const prize = findPrize('chips-1000')!;
    const r = await storage.redeemPrize(user.id, prize);

    const profileAfter = (await storage.getUserProfile(user.id))!;
    expect(profileAfter.earnedCredits).toBe(250 - prize.creditCost); // 150
    expect(profileAfter.virtualChips).toBe(chipsBefore + 1000);
    expect(r.creditsSpent).toBe(prize.creditCost);
    expect(r.prizeId).toBe('chips-1000');
    expect(r.fulfilledAt).toBeInstanceOf(Date);
  });

  it('rejects redemption when balance is insufficient — chips unchanged', async () => {
    const user = await newUser('broke');
    await storage.grantCredits(user.id, 50);
    const profileBefore = (await storage.getUserProfile(user.id))!;
    const chipsBefore = profileBefore.virtualChips;

    const prize = findPrize('chips-7500')!;
    await expect(storage.redeemPrize(user.id, prize)).rejects.toThrow(/insufficient/i);

    const profileAfter = (await storage.getUserProfile(user.id))!;
    expect(profileAfter.earnedCredits).toBe(50); // untouched
    expect(profileAfter.virtualChips).toBe(chipsBefore); // untouched
  });

  it('listUserRedemptions returns the user’s most recent redemptions first', async () => {
    const user = await newUser('history');
    await storage.grantCredits(user.id, 1000);

    await storage.redeemPrize(user.id, findPrize('chips-1000')!);
    // Tick the clock forward enough that the sort order is deterministic.
    await new Promise((r) => setTimeout(r, 5));
    await storage.redeemPrize(user.id, findPrize('chips-3000')!);

    const rows = await storage.listUserRedemptions(user.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].prizeId).toBe('chips-3000');
    expect(rows[1].prizeId).toBe('chips-1000');
  });

  it("a user only sees their own redemptions", async () => {
    const alice = await newUser('alice');
    const bob = await newUser('bob');
    await storage.grantCredits(alice.id, 200);
    await storage.grantCredits(bob.id, 200);

    await storage.redeemPrize(alice.id, findPrize('chips-1000')!);
    await storage.redeemPrize(bob.id, findPrize('chips-1000')!);

    const aliceRows = await storage.listUserRedemptions(alice.id);
    const bobRows = await storage.listUserRedemptions(bob.id);
    expect(aliceRows).toHaveLength(1);
    expect(bobRows).toHaveLength(1);
    expect(aliceRows[0].userId).toBe(alice.id);
    expect(bobRows[0].userId).toBe(bob.id);
  });
});
