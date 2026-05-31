/**
 * Print-on-demand: types shared between client + server (#52).
 *
 * Why vendor-agnostic? The physical-deck market has at least three viable
 * fulfilment vendors (MakePlayingCards, PrinterStudio, The Game Crafter) and
 * we don't want to bake one in before we've actually tested with a real
 * order. So the surface here is "what would a printable deck and an order
 * look like" — vendor-specific adapters live in server/print-vendors/* and
 * map between this surface and the vendor's actual API/spec.
 *
 * V1 status:
 *   - Catalog defines two starter deck options (custom-back, premium)
 *   - Order creation stores a row server-side and returns a confirmation
 *   - Stripe + real vendor wiring are TODO and gated behind env vars; the
 *     UI shows a "coming soon — leave your email" form when not configured.
 */

import { z } from 'zod';

/** Top-level product the customer can buy. */
export interface PrintProduct {
  id: string;
  name: string;
  description: string;
  /** Price in the smallest currency unit (cents/pence). */
  priceCents: number;
  currency: 'USD' | 'GBP' | 'EUR';
  /** Approximate ship-by lead time in business days, for honest expectations. */
  leadDaysMin: number;
  leadDaysMax: number;
  /** Image URL — used for the storefront preview. Relative to app root. */
  previewImageUrl: string;
  /** True if this product requires the buyer to choose a custom card back. */
  customizable: boolean;
}

/**
 * Vendor-agnostic catalog. Real vendor mappings (e.g. MPC sku, GameCrafter
 * project id) live in server/print-vendors and aren't exposed to the client.
 */
export const PRINT_CATALOG: PrintProduct[] = [
  {
    id: 'std-poker-customback',
    name: 'Standard poker deck — custom back',
    description:
      "A 54-card poker deck (52 + 2 jokers) with the Snatch&GrabIt! face design and your choice of card back. Linen-finish, casino-quality stock.",
    priceCents: 1899,
    currency: 'USD',
    leadDaysMin: 7,
    leadDaysMax: 14,
    previewImageUrl: '/print/preview-std-poker.png',
    customizable: true,
  },
  {
    id: 'premium-tuck-box',
    name: 'Premium deck + custom tuck box',
    description:
      "Bridge-size deck with a custom-printed tuck box and your branding on the back. Great for gifts or small-batch promo runs.",
    priceCents: 3499,
    currency: 'USD',
    leadDaysMin: 14,
    leadDaysMax: 21,
    previewImageUrl: '/print/preview-premium.png',
    customizable: true,
  },
];

export function findPrintProduct(id: string): PrintProduct | undefined {
  return PRINT_CATALOG.find((p) => p.id === id);
}

/** Shipping address — kept deliberately small for the V1 (UK/US/EU only). */
export const shippingAddressSchema = z.object({
  fullName: z.string().min(1).max(100),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  region: z.string().max(100).optional(), // state / county / province
  postalCode: z.string().min(1).max(20),
  country: z.string().length(2), // ISO-3166 alpha-2 (e.g. "GB", "US")
});
export type ShippingAddress = z.infer<typeof shippingAddressSchema>;

/** Body for POST /api/print/orders. */
export const createPrintOrderSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  /** Optional URL of a customer-supplied card-back image, if customizable. */
  cardBackImageUrl: z.string().url().max(500).optional(),
  shipping: shippingAddressSchema,
  /** Customer email for order updates. Required for guest checkout. */
  email: z.string().email(),
});
export type CreatePrintOrderInput = z.infer<typeof createPrintOrderSchema>;

export type PrintOrderStatus =
  | 'awaiting_payment'
  | 'in_production'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'failed';

export interface PrintOrder {
  id: string;
  userId: string | null; // null for guest checkouts
  email: string;
  productId: string;
  quantity: number;
  cardBackImageUrl: string | null;
  shipping: ShippingAddress;
  status: PrintOrderStatus;
  /** Total in the smallest currency unit (cents/pence). */
  totalCents: number;
  currency: PrintProduct['currency'];
  /** Vendor-side reference once submitted (e.g. MPC order ID). */
  vendorOrderId: string | null;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/** Response shape for both GET /api/print/orders and POST /api/print/orders. */
export interface PrintOrderResponse {
  order: PrintOrder;
  /** When integration is incomplete, server returns a friendly explanation. */
  notice?: string;
}

/** Public config — tells the client what's wired and what isn't. */
export interface PrintConfig {
  /** Stripe checkout enabled? (PRINT_STRIPE_KEY env var set) */
  paymentsEnabled: boolean;
  /** Real vendor wired? (PRINT_VENDOR env var set) */
  fulfilmentEnabled: boolean;
  /** Catalog snapshot — same as PRINT_CATALOG but shipped via the API so the
   *  server can override prices/availability without a client redeploy. */
  catalog: PrintProduct[];
}
