/**
 * Prize catalog — what credits can be spent on. Lives in code (not DB) so
 * tuning tiers / adding new prize kinds is a code change + redeploy, not a
 * migration. Redemption transactions are still persisted in the `redemptions`
 * table for audit / dispute resolution.
 *
 * Adding a prize kind:
 *  1. Add the new `kind` to PrizeKind below.
 *  2. Add a row to PRIZE_CATALOG.
 *  3. Handle the kind in server/routes.ts redeem handler — it'll fail with
 *     "Unknown prize kind" until you do.
 */

export type PrizeKind = 'extra_chips';

export interface Prize {
  id: string;
  kind: PrizeKind;
  name: string;
  description: string;
  creditCost: number;
  /** Kind-specific payload — e.g. `{ chips: 1000 }` for extra_chips. */
  payload: Record<string, number | string>;
}

export const PRIZE_CATALOG: readonly Prize[] = [
  {
    id: 'chips-1000',
    kind: 'extra_chips',
    name: '1,000 Chips',
    description: 'Top up today’s betting balance — no waiting for tomorrow’s reset.',
    creditCost: 100,
    payload: { chips: 1000 },
  },
  {
    id: 'chips-3000',
    kind: 'extra_chips',
    name: '3,000 Chips',
    description: 'A bigger top-up — better value per credit.',
    creditCost: 250,
    payload: { chips: 3000 },
  },
  {
    id: 'chips-7500',
    kind: 'extra_chips',
    name: '7,500 Chips',
    description: 'Whale tier. Three days of bets on the house.',
    creditCost: 500,
    payload: { chips: 7500 },
  },
] as const;

export function findPrize(id: string): Prize | undefined {
  return PRIZE_CATALOG.find((p) => p.id === id);
}
