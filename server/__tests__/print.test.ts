import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createPrintOrder,
  getPrintConfig,
  getPrintOrder,
  listOrdersForUser,
  PrintError,
  _resetPrintOrders,
} from '../print';
import type { CreatePrintOrderInput } from '@shared/print';

const sampleInput: CreatePrintOrderInput = {
  productId: 'std-poker-customback',
  quantity: 2,
  cardBackImageUrl: 'https://example.com/back.png',
  shipping: {
    fullName: 'Alice Example',
    line1: '123 Card Lane',
    city: 'London',
    postalCode: 'SW1A 1AA',
    country: 'GB',
  },
  email: 'alice@example.com',
};

describe('print order intake', () => {
  beforeEach(() => _resetPrintOrders());

  afterEach(() => {
    delete process.env.PRINT_STRIPE_KEY;
    delete process.env.PRINT_VENDOR;
  });

  it('creates an order with the right total for a known product', () => {
    const { order } = createPrintOrder(sampleInput, 'user-alice');
    expect(order.userId).toBe('user-alice');
    expect(order.productId).toBe('std-poker-customback');
    expect(order.quantity).toBe(2);
    expect(order.totalCents).toBe(1899 * 2);
    expect(order.currency).toBe('USD');
    expect(order.status).toBe('awaiting_payment');
  });

  it('rejects unknown product IDs with a 400-style PrintError', () => {
    expect(() =>
      createPrintOrder({ ...sampleInput, productId: 'nope' }, null),
    ).toThrow(PrintError);
  });

  it('returns a manual-fulfilment notice when payment/vendor env vars are missing', () => {
    const res = createPrintOrder(sampleInput, null);
    expect(res.notice).toBeTruthy();
    expect(res.notice).toContain('manual-fulfilment');
  });

  it('omits the manual-fulfilment notice when both Stripe and vendor are configured', () => {
    process.env.PRINT_STRIPE_KEY = 'sk_test_dummy';
    process.env.PRINT_VENDOR = 'mpc';
    const res = createPrintOrder(sampleInput, 'user-bob');
    expect(res.notice).toBeUndefined();
  });

  it('accepts guest orders (userId null)', () => {
    const { order } = createPrintOrder(sampleInput, null);
    expect(order.userId).toBeNull();
    expect(order.email).toBe('alice@example.com');
  });

  it('listOrdersForUser returns only this user\'s orders, newest first', async () => {
    createPrintOrder(sampleInput, 'user-alice');
    await new Promise((r) => setTimeout(r, 5));
    createPrintOrder({ ...sampleInput, quantity: 1 }, 'user-alice');
    createPrintOrder(sampleInput, 'user-bob');

    const alices = listOrdersForUser('user-alice');
    expect(alices).toHaveLength(2);
    // Newest first — most recent creation timestamp at index 0.
    expect(new Date(alices[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(alices[1].createdAt).getTime(),
    );
  });

  it('getPrintOrder retrieves an order by id', () => {
    const { order } = createPrintOrder(sampleInput, 'user-alice');
    const fetched = getPrintOrder(order.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(order.id);
  });

  it('config reflects env-var state', () => {
    let cfg = getPrintConfig();
    expect(cfg.paymentsEnabled).toBe(false);
    expect(cfg.fulfilmentEnabled).toBe(false);
    expect(cfg.catalog.length).toBeGreaterThan(0);

    process.env.PRINT_STRIPE_KEY = 'sk_test_dummy';
    cfg = getPrintConfig();
    expect(cfg.paymentsEnabled).toBe(true);
    expect(cfg.fulfilmentEnabled).toBe(false);
  });
});
