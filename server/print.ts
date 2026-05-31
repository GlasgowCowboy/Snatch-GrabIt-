/**
 * Print-on-demand server flow (#52).
 *
 * V1 is a scaffold:
 *   - In-memory order store with the right interface shape so the client can
 *     be built end-to-end, including success / "order placed" UX.
 *   - Real Stripe checkout is gated behind PRINT_STRIPE_KEY (TODO).
 *   - Real vendor (MPC / TGC / etc.) is gated behind PRINT_VENDOR (TODO).
 *   - When either is missing, orders enter a manual-fulfilment queue and the
 *     client is told "you'll get a follow-up email" — Scott does the rest by
 *     hand for the first orders, which is the right level of investment until
 *     volume justifies the vendor integration cost.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import {
  PRINT_CATALOG,
  findPrintProduct,
  type CreatePrintOrderInput,
  type PrintConfig,
  type PrintOrder,
  type PrintOrderResponse,
} from '@shared/print';

// Hard ceiling on the in-memory order store. Until orders move to Postgres,
// uncapped growth is a real OOM vector — a scripted POST loop fills the
// process. When we hit the cap, we FIFO-evict the oldest order (Map iteration
// order is insertion order) and log a warning so we notice before customers
// start vanishing in production.
const MAX_ORDERS_IN_MEMORY = 1000;

const orders = new Map<string, PrintOrder>();

/**
 * Secret used to sign one-time order-lookup tokens for guests. In production
 * set PRINT_ORDER_TOKEN_SECRET; in dev we fall back to a process-stable random
 * value so tokens issued during one run can still be verified within that run
 * (they break across restarts, which is fine for dev).
 */
const TOKEN_SECRET = process.env.PRINT_ORDER_TOKEN_SECRET ?? randomUUID();

function signOrderToken(orderId: string, email: string): string {
  return createHmac('sha256', TOKEN_SECRET)
    .update(`${orderId}|${email.toLowerCase()}`)
    .digest('hex')
    .slice(0, 32); // 128 bits is plenty for a per-order capability token
}

/** Constant-time check so timing doesn't leak token bytes. */
export function verifyOrderToken(
  orderId: string,
  email: string,
  token: string,
): boolean {
  const expected = signOrderToken(orderId, email);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

export function getPrintConfig(): PrintConfig {
  return {
    paymentsEnabled: !!process.env.PRINT_STRIPE_KEY,
    fulfilmentEnabled: !!process.env.PRINT_VENDOR,
    catalog: PRINT_CATALOG,
  };
}

export function createPrintOrder(
  input: CreatePrintOrderInput,
  userId: string | null,
): PrintOrderResponse {
  const product = findPrintProduct(input.productId);
  if (!product) {
    throw new PrintError(`Unknown product: ${input.productId}`, 400);
  }

  const now = new Date().toISOString();
  const order: PrintOrder = {
    id: randomUUID(),
    userId,
    email: input.email,
    productId: input.productId,
    quantity: input.quantity,
    cardBackImageUrl: input.cardBackImageUrl ?? null,
    shipping: input.shipping,
    status: 'awaiting_payment',
    totalCents: product.priceCents * input.quantity,
    currency: product.currency,
    vendorOrderId: null,
    createdAt: now,
    updatedAt: now,
  };
  // FIFO-evict the oldest order if we've hit the cap. Map iteration order is
  // insertion order, so .keys().next() gives us the oldest. The evicted order
  // is GONE — this is intentional pressure-relief, not a complete fix; real
  // persistence (TODO) is what removes the cap entirely.
  if (orders.size >= MAX_ORDERS_IN_MEMORY) {
    const oldest = orders.keys().next().value;
    if (oldest) {
      // eslint-disable-next-line no-console
      console.warn(
        `[print] in-memory order cap (${MAX_ORDERS_IN_MEMORY}) hit — evicting ${oldest}`,
      );
      orders.delete(oldest);
    }
  }
  orders.set(order.id, order);

  // Signed one-time token so guest customers can revisit their confirmation
  // URL after closing the tab (the page itself only stores the order in
  // React state). For authed users the lookup also works via session.
  const lookupToken = signOrderToken(order.id, order.email);

  const cfg = getPrintConfig();
  if (!cfg.paymentsEnabled || !cfg.fulfilmentEnabled) {
    // Mark as manual-queued so the dashboard shows it correctly.
    order.status = 'awaiting_payment';
    return {
      order,
      lookupToken,
      notice:
        "Your order is in our manual-fulfilment queue. We'll email you within 1 business day with payment and shipping next steps.",
    };
  }

  // TODO: real flow — create Stripe Checkout Session, persist its id on the
  // order, return the session URL so the client redirects to Stripe. On
  // webhook 'checkout.session.completed', flip status to 'in_production' and
  // POST the order to the configured vendor.
  return { order, lookupToken };
}

export function getPrintOrder(id: string): PrintOrder | undefined {
  return orders.get(id);
}

export function listOrdersForUser(userId: string): PrintOrder[] {
  const out: PrintOrder[] = [];
  orders.forEach((o) => {
    if (o.userId === userId) out.push(o);
  });
  // Newest first.
  out.sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1));
  return out;
}

export class PrintError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'PrintError';
  }
}

/** Used by tests to start each case from a clean slate. */
export function _resetPrintOrders(): void {
  orders.clear();
}
