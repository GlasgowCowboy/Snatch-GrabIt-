import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordImpression,
  recordClick,
  getEngagementSnapshot,
  revertImpressionAward,
  isKnownSlot,
  _resetAdEngagement,
} from '../ad-engagement';

describe('ad-engagement', () => {
  beforeEach(() => _resetAdEngagement());

  it('first impression of a slot awards 1 credit', () => {
    const result = recordImpression('u-alice', 'slot-banner-top');
    expect(result.creditsAwarded).toBe(1);
    expect(result.dailyCreditsEarned).toBe(1);
    expect(result.dailyCreditsCap).toBe(25);
  });

  it('a second impression of the same slot by the same user awards nothing', () => {
    recordImpression('u-alice', 'slot-banner-top');
    const result = recordImpression('u-alice', 'slot-banner-top');
    expect(result.creditsAwarded).toBe(0);
    // Daily-total still reflects the earlier award.
    expect(result.dailyCreditsEarned).toBe(1);
  });

  it('different slots each award their own credit', () => {
    recordImpression('u-alice', 'slot-a');
    const r = recordImpression('u-alice', 'slot-b');
    expect(r.creditsAwarded).toBe(1);
    expect(r.dailyCreditsEarned).toBe(2);
  });

  it('hard-caps at 25 credits per user per day', () => {
    for (let i = 0; i < 25; i++) {
      recordImpression('u-alice', `slot-${i}`);
    }
    const overCap = recordImpression('u-alice', 'slot-26');
    expect(overCap.creditsAwarded).toBe(0);
    expect(overCap.dailyCreditsEarned).toBe(25);
  });

  it('counts impressions on the slot regardless of credit eligibility', () => {
    recordImpression('u-alice', 'slot-x');
    recordImpression('u-alice', 'slot-x'); // dup for credits, still counts as impression
    recordImpression('u-bob', 'slot-x');
    const rows = getEngagementSnapshot();
    const x = rows.find((r) => r.slotId === 'slot-x');
    expect(x?.impressions).toBe(3);
  });

  it('recordClick only increments clicks, never credits', () => {
    recordClick('slot-x');
    recordClick('slot-x');
    const rows = getEngagementSnapshot();
    const x = rows.find((r) => r.slotId === 'slot-x');
    expect(x?.clicks).toBe(2);
    expect(x?.impressions).toBe(0);
    expect(x?.ctr).toBe(0); // 0 impressions → 0 CTR (we don't divide by 0)
  });

  it('CTR is reported as a percentage rounded to 2 dp', () => {
    // 1 click / 4 impressions = 25%
    recordImpression('u-a', 's');
    recordImpression('u-b', 's');
    recordImpression('u-c', 's');
    recordImpression('u-d', 's');
    recordClick('s');
    const rows = getEngagementSnapshot();
    expect(rows[0].ctr).toBe(25);
  });

  it('snapshot is sorted by impressions descending', () => {
    recordImpression('u-a', 'low');
    recordImpression('u-a', 'high');
    recordImpression('u-b', 'high');
    recordImpression('u-c', 'high');
    const rows = getEngagementSnapshot();
    expect(rows[0].slotId).toBe('high');
    expect(rows[1].slotId).toBe('low');
  });

  it('different users earn credits independently', () => {
    const a = recordImpression('u-alice', 'slot-x');
    const b = recordImpression('u-bob', 'slot-x');
    expect(a.creditsAwarded).toBe(1);
    expect(b.creditsAwarded).toBe(1);
    expect(a.dailyCreditsEarned).toBe(1);
    expect(b.dailyCreditsEarned).toBe(1);
  });

  it('isKnownSlot only accepts the three live slot IDs', () => {
    expect(isKnownSlot('0000000001')).toBe(true);
    expect(isKnownSlot('0000000002')).toBe(true);
    expect(isKnownSlot('0000000003')).toBe(true);
    expect(isKnownSlot('not-a-real-slot')).toBe(false);
    expect(isKnownSlot('')).toBe(false);
    // Whitespace, similar-looking IDs, etc.
    expect(isKnownSlot('0000000001 ')).toBe(false);
    expect(isKnownSlot('00000000010')).toBe(false);
  });

  it('revertImpressionAward undoes a credit so the user can retry', () => {
    const award = recordImpression('u-alice', 'slot-x');
    expect(award.creditsAwarded).toBe(1);

    revertImpressionAward('u-alice', 'slot-x', 1);

    // Now a fresh impression should award again (the seen-set was cleared).
    const retry = recordImpression('u-alice', 'slot-x');
    expect(retry.creditsAwarded).toBe(1);
    expect(retry.dailyCreditsEarned).toBe(1);
  });

  it('revertImpressionAward is idempotent / safe to call on un-awarded state', () => {
    // No prior impression — should not crash or go negative.
    revertImpressionAward('u-alice', 'slot-x', 1);
    revertImpressionAward('u-alice', 'slot-x', 1);
    const after = recordImpression('u-alice', 'slot-x');
    expect(after.dailyCreditsEarned).toBe(1);
  });
});
