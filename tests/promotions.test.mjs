import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCheckoutSessionHandler } from '../netlify/functions/create-checkout-session.mjs';
import { evaluatePromotion } from '../netlify/lib/promotions.mjs';
import { createCustomerEmail, createMerchantEmail } from '../netlify/lib/order-emails.mjs';

const items = [
  { id: 'jollof-rice', categoryId: 1, lineTotal: 2000 },
  { id: 'meat-pie', categoryId: 2, lineTotal: 500 },
];
const promotion = overrides => ({ id: 7, promotionName: 'Summer Sale', discountCode: 'SUMMER', discountType: 'percentage', discountValue: 10, active: true, appliesTo: 'entire_order', categoryIds: [], productIds: [], ...overrides });
const evaluate = overrides => evaluatePromotion({ promotion: promotion(), items, subtotalPence: 2500, deliveryFeePence: 300, customerEmail: 'customer@example.com', ...overrides });

test('percentage, fixed amount and free delivery discounts calculate in pence', () => {
  assert.equal(evaluate({ promotion: promotion({ discountType: 'percentage', discountValue: 10 }) }).discountAmountPence, 280);
  assert.equal(evaluate({ promotion: promotion({ discountType: 'fixed_amount', discountValue: 500 }) }).discountAmountPence, 500);
  assert.equal(evaluate({ promotion: promotion({ discountType: 'free_delivery', discountValue: 0 }) }).discountAmountPence, 300);
});

test('expired and disabled promotions are rejected', () => {
  assert.match(evaluate({ promotion: promotion({ endDate: '2026-08-05T00:00:00Z' }), now: new Date('2026-08-06T00:00:00Z') }).error, /expired/i);
  assert.match(evaluate({ promotion: promotion({ active: false }) }).error, /disabled/i);
});

test('global and customer usage limits are rejected', () => {
  assert.match(evaluate({ promotion: promotion({ maximumUses: 2 }), usageCount: 2 }).error, /usage limit/i);
  assert.match(evaluate({ promotion: promotion({ maximumUsesPerCustomer: 1 }), customerUsageCount: 1 }).error, /maximum number/i);
});

test('minimum order values and product/category restrictions are enforced', () => {
  assert.match(evaluate({ promotion: promotion({ minimumOrderValuePence: 3000 }) }).error, /at least £30\.00/i);
  assert.equal(evaluate({ promotion: promotion({ appliesTo: 'specific_products', productIds: ['meat-pie'], discountType: 'percentage', discountValue: 20 }) }).discountAmountPence, 100);
  assert.equal(evaluate({ promotion: promotion({ appliesTo: 'specific_categories', categoryIds: [1], discountType: 'percentage', discountValue: 15 }) }).discountAmountPence, 300);
});

test('checkout stores server-calculated snapshots and sends the exact Stripe coupon', async () => {
  let storedOrder; let reserved; const stripeRequests = [];
  const database = {
    insert: () => ({ values: values => { storedOrder = values; return { returning: async () => [{ id: 99 }] }; } }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({ where: async () => {} }),
  };
  const handler = createCheckoutSessionHandler({
    database, ordersTable: { id: {}, reference: {} }, promotionsTable: {}, promotionUsageTable: {}, env: { get: () => 'test-key' },
    loadDeliverySettings: async () => ({ deliveryEnabled: true, collectionEnabled: true, minimumCollectionOrderPence: null }),
    loadProducts: async () => [{ id: 1, slug: 'jollof-rice', name: 'Jollof Rice', price: 2500, active: true, soldOut: false, categoryId: 1, category: { id: 1, active: true }, optionGroups: [] }],
    validatePromotion: async () => ({ ok: true, promotion: promotion({ discountCode: 'SAVE10' }), discountAmountPence: 250, totalAfterDiscountPence: 2250 }),
    reserveUsage: async values => { reserved = values; },
    stripeFetch: async (url, init) => { stripeRequests.push([url, new URLSearchParams(init.body)]); return url.endsWith('/coupons') ? Response.json({ id: 'coupon_test' }) : Response.json({ id: 'cs_test', url: 'https://stripe.test/session' }); },
  });
  const response = await handler(new Request('https://example.test/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer: { name: 'Amina', email: 'amina@example.com', phone: '07000000000' }, fulfilment: 'collection', collectionTime: '18:30', discountCode: 'SAVE10', items: [{ id: 'jollof-rice', quantity: 1, customizations: [] }] }) }));
  assert.equal(response.status, 200);
  assert.equal(storedOrder.subtotalBeforeDiscountPence, 2500);
  assert.equal(storedOrder.discountAmountPence, 250);
  assert.equal(storedOrder.totalAfterDiscountPence, 2250);
  assert.equal(storedOrder.amountTotal, 2250);
  assert.equal(reserved.orderId, 99);
  assert.equal(stripeRequests[0][1].get('amount_off'), '250');
  assert.equal(stripeRequests[1][1].get('discounts[0][coupon]'), 'coupon_test');
  assert.equal(stripeRequests[1][1].get('metadata[total_price_pence]'), '2250');
});

test('promotion banners, reporting and migration safeguards are present', async () => {
  const [banner, report, migration] = await Promise.all([
    readFile(new URL('../promotion-banner.js', import.meta.url), 'utf8'),
    readFile(new URL('../netlify/functions/admin-discounts.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../netlify/database/migrations/20260806200727_promotions_snapshot/migration.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(banner, /data-promotion-banner/);
  assert.match(report, /revenueGenerated/);
  assert.match(report, /totalDiscountGiven/);
  assert.match(migration, /CREATE TABLE "promotions"/);
  assert.match(migration, /promotion_usage_limits_trigger/);
  assert.doesNotMatch(migration, /DROP TABLE "orders"|DELETE FROM "orders"/);
});

test('customer and merchant emails show promotion snapshots and final paid total', () => {
  const order = { reference: 'DLK-DISCOUNT', status: 'paid', customerName: 'Amina', customerEmail: 'amina@example.com', customerPhone: '07000000000', fulfilment: 'collection', currency: 'gbp', items: [{ name: 'Jollof Rice', quantity: 1, lineTotal: 2500, customizations: [] }], orderSubtotalPence: 2500, deliveryFeePence: 0, amountTotal: 2250, discountAmountPence: 250, discountCodeUsed: 'SAVE10', promotionName: 'Summer Sale', totalAfterDiscountPence: 2250 };
  for (const email of [createCustomerEmail(order), createMerchantEmail(order)]) {
    assert.match(email.text, /Summer Sale/);
    assert.match(email.text, /SAVE10/);
    assert.match(email.text, /Discount: -£2\.50/);
    assert.match(email.text, /Total paid: £22\.50/);
  }
});
