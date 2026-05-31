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

import { randomUUID } from 'crypto';
import {
  PRINT_CATALOG,
  findPrintProduct,
  type CreatePrintOrderInput,
  type PrintConfig,
  type PrintOrder,
  type PrintOrderResponse,
} from '@shared/print';

const orders = new Map<string, PrintOrder>();

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
  orders.set(order.id, order);

  const cfg = getPrintConfig();
  if (!cfg.paymentsEnabled || !cfg.fulfilmentEnabled) {
    // Mark as manual-queued so the dashboard shows it correctly.
    order.status = 'awaiting_payment';
    return {
      order,
      notice:
        "Your order is in our manual-fulfilment queue. We'll email you within 1 business day with payment and shipping next steps.",
    };
  }

  // TODO: real flow — create Stripe Checkout Session, persist its id on the
  // order, return the session URL so the client redirects to Stripe. On
  // webhook 'checkout.session.completed', flip status to 'in_production' and
  // POST the order to the configured vendor.
  return { order };
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
