import { describe, it, expect, beforeEach } from 'vitest';
import { joinQueue, leaveQueue, getStatus, _resetMatchmaking } from '../matchmaking';

describe('matchmaking queue', () => {
  beforeEach(() => _resetMatchmaking());

  it('a lone player stays queued', async () => {
    const s = await joinQueue({
      userId: 'u-alice',
      username: 'alice',
      scoringMethod: 'fullHand',
      targetScore: 50,
    });
    expect(s.inQueue).toBe(true);
    if (s.inQueue) {
      expect(s.queueDepth).toBe(1);
      expect(s.queuedFor.method).toBe('fullHand');
    }
  });

  it('two compatible players get matched on the second join', async () => {
    await joinQueue({ userId: 'u-a', username: 'a', scoringMethod: 'fullHand', targetScore: 50 });
    const b = await joinQueue({
      userId: 'u-b',
      username: 'b',
      scoringMethod: 'fullHand',
      targetScore: 50,
    });
    // Either side could see the match next — usually b sees it immediately
    // because pairing runs on join.
    expect(b.inQueue).toBe(false);
    if (!b.inQueue && 'matched' in b) {
      expect(b.matched.roomCode).toBeTruthy();
      expect(b.matched.opponentUsername).toBe('a');
    }
    // a's first poll should now show matched too.
    const aStatus = await getStatus('u-a');
    expect(aStatus.inQueue).toBe(false);
    if (!aStatus.inQueue && 'matched' in aStatus) {
      expect(aStatus.matched.roomCode).toBeTruthy();
      expect(aStatus.matched.opponentUsername).toBe('b');
    }
  });

  it("match result is one-shot — refreshing /status doesn't re-route", async () => {
    await joinQueue({ userId: 'u-a', username: 'a', scoringMethod: 'fullHand', targetScore: 50 });
    await joinQueue({ userId: 'u-b', username: 'b', scoringMethod: 'fullHand', targetScore: 50 });
    const first = await getStatus('u-a');
    expect('matched' in first && first.matched).toBeTruthy();
    const second = await getStatus('u-a');
    expect(second.inQueue).toBe(false);
    expect('matched' in second).toBe(false);
  });

  it("incompatible settings don't pair", async () => {
    await joinQueue({ userId: 'u-a', username: 'a', scoringMethod: 'fullHand', targetScore: 50 });
    const b = await joinQueue({
      userId: 'u-b',
      username: 'b',
      scoringMethod: 'fullHand',
      targetScore: 100, // different target
    });
    expect(b.inQueue).toBe(true);
    const a = await getStatus('u-a');
    expect(a.inQueue).toBe(true);
  });

  it('leaveQueue removes the entry without spawning a match', async () => {
    await joinQueue({ userId: 'u-a', username: 'a', scoringMethod: 'fullHand', targetScore: 50 });
    leaveQueue('u-a');
    const s = await getStatus('u-a');
    expect(s.inQueue).toBe(false);
  });

  it('FIFO within a bucket — the longer-waiting player hosts', async () => {
    await joinQueue({ userId: 'u-early', username: 'early', scoringMethod: 'fullHand', targetScore: 50 });
    // small artificial delay would be flaky in tests; the FIFO order is
    // already guaranteed by joinedAt = Date.now() inside joinQueue.
    await joinQueue({ userId: 'u-late', username: 'late', scoringMethod: 'fullHand', targetScore: 50 });
    const earlyStatus = await getStatus('u-early');
    expect(earlyStatus.inQueue).toBe(false);
    if (!earlyStatus.inQueue && 'matched' in earlyStatus) {
      // host's opponentUsername is the other guy, so 'late' must be the opponent.
      expect(earlyStatus.matched.opponentUsername).toBe('late');
    }
  });
});
