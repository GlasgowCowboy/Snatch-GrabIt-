import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from '../storage';
import { MemoryStorage } from '../storage-memory';
import { recordHeartbeat, isOnline, filterOnline, _resetPresence } from '../presence';

async function makeUser(suffix: string) {
  return storage.createUser(
    { username: `friend-${suffix}-${Date.now()}`, password: 'x', email: null },
    `Friend ${suffix}`,
  );
}

describe('friends storage', () => {
  beforeEach(() => {
    if (!(storage instanceof MemoryStorage)) {
      throw new Error('Test requires MemoryStorage; do not set DATABASE_URL when running tests');
    }
  });

  it('sendFriendRequest creates a pending row and is idempotent', async () => {
    const a = await makeUser('a');
    const b = await makeUser('b');
    const r1 = await storage.sendFriendRequest(a.id, b.id);
    expect(r1.status).toBe('pending');
    expect(r1.userId).toBe(a.id);
    expect(r1.friendId).toBe(b.id);
    // Re-request returns the same row, doesn't duplicate.
    const r2 = await storage.sendFriendRequest(a.id, b.id);
    expect(r2.id).toBe(r1.id);
  });

  it("you can't friend yourself", async () => {
    const a = await makeUser('selfish');
    await expect(storage.sendFriendRequest(a.id, a.id)).rejects.toThrow(/yourself/i);
  });

  it("listFriends shows pending outbound for requester and pending inbound for target", async () => {
    const a = await makeUser('out');
    const b = await makeUser('in');
    await storage.sendFriendRequest(a.id, b.id);

    const aList = await storage.listFriends(a.id);
    expect(aList).toHaveLength(1);
    expect(aList[0].status).toBe('pending');
    expect(aList[0].incoming).toBe(false);

    const bList = await storage.listFriends(b.id);
    expect(bList).toHaveLength(1);
    expect(bList[0].status).toBe('pending');
    expect(bList[0].incoming).toBe(true);
  });

  it('acceptFriendRequest flips status + creates reciprocal row', async () => {
    const a = await makeUser('req');
    const b = await makeUser('acc');
    const row = await storage.sendFriendRequest(a.id, b.id);
    await storage.acceptFriendRequest(b.id, row.id);

    const aList = await storage.listFriends(a.id);
    const bList = await storage.listFriends(b.id);
    expect(aList).toHaveLength(1);
    expect(bList).toHaveLength(1);
    expect(aList[0].status).toBe('accepted');
    expect(bList[0].status).toBe('accepted');
    expect(aList[0].incoming).toBe(false);
    expect(bList[0].incoming).toBe(false);
  });

  it('rejects an accept by anyone except the target', async () => {
    const a = await makeUser('owner');
    const b = await makeUser('target');
    const c = await makeUser('imposter');
    const row = await storage.sendFriendRequest(a.id, b.id);
    await expect(storage.acceptFriendRequest(c.id, row.id)).rejects.toThrow(/not the target/i);
  });

  it('removeFriendship nukes both directions', async () => {
    const a = await makeUser('keepA');
    const b = await makeUser('keepB');
    const row = await storage.sendFriendRequest(a.id, b.id);
    await storage.acceptFriendRequest(b.id, row.id);
    expect((await storage.listFriends(a.id))).toHaveLength(1);
    await storage.removeFriendship(a.id, row.id);
    expect((await storage.listFriends(a.id))).toHaveLength(0);
    expect((await storage.listFriends(b.id))).toHaveLength(0);
  });

  it('removeFriendship requires you to be a party to it', async () => {
    const a = await makeUser('stranger1');
    const b = await makeUser('stranger2');
    const c = await makeUser('eavesdropper');
    const row = await storage.sendFriendRequest(a.id, b.id);
    await expect(storage.removeFriendship(c.id, row.id)).rejects.toThrow(/not your friendship/i);
  });
});

describe('presence', () => {
  beforeEach(() => _resetPresence());

  it('isOnline returns false for never-seen users', () => {
    expect(isOnline('nobody')).toBe(false);
  });

  it('isOnline returns true within the timeout window after a heartbeat', () => {
    recordHeartbeat('u1');
    expect(isOnline('u1')).toBe(true);
  });

  it('filterOnline returns the subset that have ping-ed', () => {
    recordHeartbeat('a');
    recordHeartbeat('c');
    expect(filterOnline(['a', 'b', 'c', 'd']).sort()).toEqual(['a', 'c']);
  });
});
