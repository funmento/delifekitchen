import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCheckoutSessionHandler } from '../netlify/functions/create-checkout-session.mjs';
import { calculateDeliveryFeePence, calculateOrderPricing } from '../netlify/lib/order-pricing.mjs';
import { DEFAULT_DELIVERY_SETTINGS } from '../netlify/lib/delivery-rules.mjs';

const settings = overrides => ({ ...DEFAULT_DELIVERY_SETTINGS, ...overrides });
const product = {
  id: 1,
  slug: 'jollof-rice',
  name: 'Jollof Rice',
  price: 1250,
  active: true,
  soldOut: false,
  category: { active: true },
  optionGroups: [],
};

for (const [distance, expected] of [
  [0.4, 300],
  [1, 300],
  [1.1, 450],
  [2, 450],
  [2.1, 600],
  [3.7, 750],
]) {
  test(`delivery at ${distance} miles costs ${expected} pence`, () => {
    assert.equal(calculateDeliveryFeePence(distance, settings()), expected);
  });
}

test('collection has no delivery fee or default minimum order', () => {
  assert.deepEqual(calculateOrderPricing({
    fulfilment: 'collection',
    subtotalPence: 100,
    distanceMiles: null,
    settings: settings(),
  }), {
    ok: true,
    subtotalPence: 100,
    deliveryFeePence: 0,
    totalPence: 100,
    pricingRule: 'Collection — no delivery fee',
  });
});

test('checkout recalculates delivery server-side, ignores browser fee, stores snapshots and adds Stripe delivery line', async () => {
  let storedOrder;
  let stripeBody;
  const database = {
    insert: () => ({ values: async values => { storedOrder = values; } }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({ where: async () => {} }),
  };
  const handler = createCheckoutSessionHandler({
    database,
    ordersTable: { reference: { getSQL: () => ({}) } },
    env: { get: () => 'test-key' },
    loadDeliverySettings: async () => settings({ deliveryRestrictionMode: 'radius' }),
    validatePostcode: async () => ({
      allowed: true,
      postcode: 'M14 5TP',
      distanceMiles: 1.1,
      restrictionMode: 'radius',
      validationResult: 'accepted',
    }),
    loadProducts: async () => [product],
    stripeFetch: async (_url, init) => {
      stripeBody = new URLSearchParams(init.body);
      return Response.json({ id: 'cs_test', url: 'https://stripe.test/session' });
    },
  });

  const response = await handler(new Request('https://example.test/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { name: 'Amina Okafor', email: 'amina@example.com', phone: '07000000000' },
      fulfilment: 'delivery',
      address: '10 Oxford Road',
      postcode: 'M14 5TP',
      deliveryFeePence: 1,
      items: [{ id: 'jollof-rice', quantity: 1, customizations: [] }],
    }),
  }));

  assert.equal(response.status, 200);
  assert.equal(storedOrder.orderSubtotalPence, 1250);
  assert.equal(storedOrder.deliveryFeePence, 450);
  assert.equal(storedOrder.orderTotalPence, 1700);
  assert.equal(storedOrder.amountTotal, 1700);
  assert.equal(storedOrder.deliveryDistanceMiles, 1.1);
  assert.match(storedOrder.deliveryPricingRule, /£3\.00 includes 1 mile/);
  assert.equal(stripeBody.get('line_items[1][price_data][product_data][name]'), 'Delivery');
  assert.equal(stripeBody.get('line_items[1][price_data][unit_amount]'), '450');
  assert.equal(stripeBody.get('metadata[delivery_fee_pence]'), '450');
});

test('delivery pricing migration is additive and preserves historical orders', async () => {
  const migration = await readFile(new URL('../netlify/database/migrations/20260804123855_add_delivery_pricing/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /ADD COLUMN "delivery_fee_enabled" boolean DEFAULT true NOT NULL/);
  assert.match(migration, /ADD COLUMN "delivery_fee_pence" integer/);
  assert.match(migration, /ADD COLUMN "order_subtotal_pence" integer/);
  assert.match(migration, /ADD COLUMN "order_total_pence" integer/);
  assert.doesNotMatch(migration, /UPDATE "orders"|DELETE FROM "orders"|DROP TABLE "orders"/);
});

test('reporting uses final totals and exposes food and delivery revenue', async () => {
  const reportSource = await readFile(new URL('../netlify/functions/admin-sales-report.mjs', import.meta.url), 'utf8');
  assert.match(reportSource, /coalesce\(\$\{orders\.orderTotalPence\}, \$\{orders\.amountTotal\}\)/);
  assert.match(reportSource, /foodRevenue/);
  assert.match(reportSource, /deliveryFeeRevenue/);
});
