/**
 * Ad engagement tracking — slot-level. Powers both:
 *   #44 — passive-view credit rewards (you watched ads, here's a tip).
 *   #45 — direct-sponsor outreach pipeline (which slots accumulate the most
 *         engagement; what categories should we try to sell directly).
 *
 * Why slot-level and not advertiser-level? Google AdSense doesn't expose the
 * advertiser identity to publishers — only aggregated revenue reports. So
 * the most we can analyse without scraping the AdSense dashboard is "slot X
 * received Y impressions / clicks today on our site." That signal is enough
 * to (a) reward viewers, (b) decide which slot to pitch a direct sponsor on.
 *
 * State is in-memory and resets daily (server boot + midnight UTC tick). Real
 * persistence would land in a `ad_events` table — added when we have data
 * worth keeping.
 */

const PASSIVE_CREDIT_CAP_PER_DAY = 25; // max credits a user can earn from
//                                          passive views in a single UTC day.
const PASSIVE_CREDIT_PER_VIEW = 1; // 1 credit per first-view per slot per day.

/**
 * Only these slot IDs are accepted by recordImpression / recordClick.
 * Must match the hardcoded `data-ad-slot` values in client/src/components/AdSlot.tsx.
 * Anything else is treated as a forged client request — otherwise an authed
 * user could POST 25 distinct fake slot IDs and farm the daily credit cap
 * without ever rendering an ad.
 */
export const KNOWN_AD_SLOTS = new Set<string>([
  '0000000001', // top banner
  '0000000002', // bottom banner
  '0000000003', // desktop skyscraper
]);

export function isKnownSlot(slotId: string): boolean {
  return KNOWN_AD_SLOTS.has(slotId);
}

interface SlotStats {
  impressions: number;
  clicks: number;
}

const slotStats = new Map<string, SlotStats>();
const dailyCreditsByUser = new Map<string, number>(); // userId → credits earned today
const seenSlotsToday = new Map<string, Set<string>>(); // userId → set of slotIds seen today
let currentDayKey = utcDayKey();

function utcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function maybeRollDay(): void {
  const today = utcDayKey();
  if (today === currentDayKey) return;
  currentDayKey = today;
  slotStats.clear();
  dailyCreditsByUser.clear();
  seenSlotsToday.clear();
}

export interface ImpressionResult {
  /** Credits awarded for THIS specific impression (0 if cap hit / dup). */
  creditsAwarded: number;
  /** User's total daily passive credits after this call. */
  dailyCreditsEarned: number;
  /** Hard cap for the day, for client display. */
  dailyCreditsCap: number;
}

/**
 * Record a slot impression and decide if it earns a passive credit.
 * Returns the credit awarded (0 if duplicate or cap hit).
 *
 * Credit policy: 1 credit per slot per user per day, capped at 25/day total.
 * Prevents farming by tabbing through ads, but rewards genuine reading
 * sessions where a player sees several different ads.
 */
export function recordImpression(userId: string, slotId: string): ImpressionResult {
  maybeRollDay();

  const stat = slotStats.get(slotId) ?? { impressions: 0, clicks: 0 };
  stat.impressions += 1;
  slotStats.set(slotId, stat);

  const earned = dailyCreditsByUser.get(userId) ?? 0;
  const seen = seenSlotsToday.get(userId) ?? new Set<string>();
  const alreadyCounted = seen.has(slotId);
  const atCap = earned >= PASSIVE_CREDIT_CAP_PER_DAY;

  if (alreadyCounted || atCap) {
    return {
      creditsAwarded: 0,
      dailyCreditsEarned: earned,
      dailyCreditsCap: PASSIVE_CREDIT_CAP_PER_DAY,
    };
  }

  seen.add(slotId);
  seenSlotsToday.set(userId, seen);
  const award = PASSIVE_CREDIT_PER_VIEW;
  dailyCreditsByUser.set(userId, earned + award);
  return {
    creditsAwarded: award,
    dailyCreditsEarned: earned + award,
    dailyCreditsCap: PASSIVE_CREDIT_CAP_PER_DAY,
  };
}

/** Record a click — pure analytics, no credit (clicks are the network's job). */
export function recordClick(slotId: string): void {
  maybeRollDay();
  const stat = slotStats.get(slotId) ?? { impressions: 0, clicks: 0 };
  stat.clicks += 1;
  slotStats.set(slotId, stat);
}

export interface SlotEngagement {
  slotId: string;
  impressions: number;
  clicks: number;
  /** Click-through rate as a percentage (0–100), rounded to 2 dp. */
  ctr: number;
}

/** Snapshot of today's per-slot engagement — used by /api/ads/engagement. */
export function getEngagementSnapshot(): SlotEngagement[] {
  maybeRollDay();
  const rows: SlotEngagement[] = [];
  slotStats.forEach((stat, slotId) => {
    rows.push({
      slotId,
      impressions: stat.impressions,
      clicks: stat.clicks,
      ctr: stat.impressions > 0
        ? Math.round((stat.clicks / stat.impressions) * 10000) / 100
        : 0,
    });
  });
  rows.sort((a, b) => b.impressions - a.impressions);
  return rows;
}

/**
 * Roll back the in-memory mutations made by a successful recordImpression.
 *
 * Call this if storage.grantCredits throws — otherwise the seen-set still
 * thinks the slot was counted, so the user's retry sees creditsAwarded=0
 * and they're silently shorted that credit for the rest of the day.
 *
 * Idempotent: safe to call with stale userId/slotId — does nothing if the
 * day has rolled over since the original call.
 */
export function revertImpressionAward(
  userId: string,
  slotId: string,
  amount: number,
): void {
  // If the day rolled over between record + revert, the maps were cleared;
  // nothing to undo.
  if (utcDayKey() !== currentDayKey) return;

  const seen = seenSlotsToday.get(userId);
  if (seen?.has(slotId)) seen.delete(slotId);

  const earned = dailyCreditsByUser.get(userId) ?? 0;
  const next = Math.max(0, earned - amount);
  if (next === 0) {
    dailyCreditsByUser.delete(userId);
  } else {
    dailyCreditsByUser.set(userId, next);
  }
}

/** Used by tests to start each case from a clean slate. */
export function _resetAdEngagement(): void {
  slotStats.clear();
  dailyCreditsByUser.clear();
  seenSlotsToday.clear();
  currentDayKey = utcDayKey();
}
