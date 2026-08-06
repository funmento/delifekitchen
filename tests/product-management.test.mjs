import test from 'node:test';
import { clampImageFocalPoint, productImagePosition } from '../image-focal.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCheckoutSessionHandler } from '../netlify/functions/create-checkout-session.mjs';
import { productInput, resolveProductCustomizations } from '../netlify/lib/product-validation.mjs';

const product = overrides => ({
  id: 1, slug: 'jollof-rice', name: 'Jollof Rice', price: 1250, active: true, soldOut: false,
  category: { active: true },
  optionGroups: [{ id: 'protein', name: 'Add protein', required: false, minSelections: 0, maxSelections: 1, options: [{ id: 'chicken', name: 'Chicken', priceAdjustment: 300, active: true }] }],
  ...overrides,
});

test('product input supports creation, editing, hiding, stock and price changes', () => {
  const values = productInput({ name: 'New Dish', slug: 'New Dish', price: 1599, active: false, soldOut: true, featured: true, sortOrder: 25, imageFocalX: 38, imageFocalY: 72 });
  assert.equal(values.slug, 'new-dish');
  assert.equal(values.price, 1599);
  assert.equal(values.active, false);
  assert.equal(values.soldOut, true);
  assert.equal(values.featured, true);
  assert.equal(values.sortOrder, 25);
  assert.equal(values.imageFocalX, 38);
  assert.equal(values.imageFocalY, 72);
});

test('product image focal points use safe centered defaults and bounded percentages', () => {
  assert.equal(clampImageFocalPoint(undefined), 50);
  assert.equal(clampImageFocalPoint(-25), 0);
  assert.equal(clampImageFocalPoint(145), 100);
  assert.equal(productImagePosition({ imageFocalX: 32.6, imageFocalY: 68.2 }), '33% 68%');
  const values = productInput({ name: 'New Dish', price: 1599, imageFocalX: -20, imageFocalY: 120 });
  assert.equal(values.imageFocalX, 0);
  assert.equal(values.imageFocalY, 100);
});

test('sold out and inactive products cannot be resolved for ordering', () => {
  assert.equal(resolveProductCustomizations(product({ soldOut: true }), []).valid, false);
  assert.equal(resolveProductCustomizations(product({ active: false }), []).valid, false);
});

test('inactive or unknown options are rejected server-side', () => {
  assert.equal(resolveProductCustomizations(product(), [{ groupId: 'protein', selectionIds: ['unknown'] }]).valid, false);
  assert.equal(resolveProductCustomizations(product({ optionGroups: [{ ...product().optionGroups[0], options: [{ id: 'chicken', name: 'Chicken', priceAdjustment: 300, active: false }] }] }), [{ groupId: 'protein', selectionIds: ['chicken'] }]).valid, false);
});

test('checkout uses the database price for Stripe and the order snapshot', async () => {
  let storedOrder;
  let stripeBody;
  const database = {
    insert: () => ({ values: async values => { storedOrder = values; } }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({ where: async () => {} }),
  };
  const handler = createCheckoutSessionHandler({
    database, ordersTable: { reference: { getSQL: () => ({}) } },
    env: { get: () => 'test-key' },
    loadDeliverySettings: async () => ({ deliveryEnabled: true, collectionEnabled: true }),
    loadProducts: async () => [product()],
    stripeFetch: async (_url, init) => { stripeBody = new URLSearchParams(init.body); return Response.json({ id: 'cs_test', url: 'https://stripe.test/session' }); },
  });
  const response = await handler(new Request('https://example.test/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer: { name: 'Amina Okafor', email: 'amina@example.com', phone: '07000000000' }, fulfilment: 'collection', collectionTime: '18:30', items: [{ id: 'jollof-rice', quantity: 2, unitAmount: 1550, customizations: [{ groupId: 'protein', selectionIds: ['chicken'] }] }] }) }));
  assert.equal(response.status, 200);
  assert.equal(stripeBody.get('line_items[0][price_data][unit_amount]'), '1550');
  assert.equal(storedOrder.amountTotal, 3100);
  assert.deepEqual(storedOrder.items[0], { id: 'jollof-rice', name: 'Jollof Rice', quantity: 2, unitAmount: 1550, lineTotal: 3100, customizations: [{ groupId: 'protein', groupName: 'Add protein', selections: [{ id: 'chicken', name: 'Chicken', priceAdjustment: 300 }] }] });
});

test('client-side price tampering is rejected before Stripe', async () => {
  let stripeCalled = false;
  const handler = createCheckoutSessionHandler({
    database: { insert: () => ({ values: async () => {} }) }, ordersTable: { reference: { getSQL: () => ({}) } },
    env: { get: () => 'test-key' }, loadDeliverySettings: async () => ({ deliveryEnabled: true, collectionEnabled: true }),
    loadProducts: async () => [product()], stripeFetch: async () => { stripeCalled = true; return Response.json({}); },
  });
  const response = await handler(new Request('https://example.test/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer: { name: 'Amina Okafor', email: 'amina@example.com', phone: '07000000000' }, fulfilment: 'collection', collectionTime: '18:30', items: [{ id: 'jollof-rice', quantity: 1, unitAmount: 1, customizations: [] }] }) }));
  assert.equal(response.status, 409);
  assert.equal(stripeCalled, false);
});

test('product migration is additive and preserves orders', async () => {
  const migration = await readFile(new URL('../netlify/database/migrations/20260803220027_add_product_management/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE "products"/);
  assert.match(migration, /CREATE TABLE "categories"/);
  assert.match(migration, /CREATE TABLE "product_option_groups"/);
  assert.match(migration, /CREATE TABLE "product_options"/);
  assert.doesNotMatch(migration, /DROP TABLE "orders"|DELETE FROM "orders"|UPDATE "orders"/);
});

test('image focal point migration is additive and preserves existing product content', async () => {
  const migration = await readFile(new URL('../netlify/database/migrations/20260806214742_add_product_image_focal_points/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /ADD COLUMN "image_focal_x" integer DEFAULT 50 NOT NULL/);
  assert.match(migration, /ADD COLUMN "image_focal_y" integer DEFAULT 50 NOT NULL/);
  assert.match(migration, /between 0 and 100/);
  assert.doesNotMatch(migration, /UPDATE "products"|DELETE FROM|DROP TABLE|ALTER TABLE "orders"/);
});

test('focal point controls persist and render across product image surfaces', async () => {
  const adminHtml = await readFile(new URL('../admin/products.html', import.meta.url), 'utf8');
  const adminSource = await readFile(new URL('../admin/products.js', import.meta.url), 'utf8');
  const menuSource = await readFile(new URL('../menu-products.js', import.meta.url), 'utf8');
  const productSource = await readFile(new URL('../product-options.js', import.meta.url), 'utf8');
  const publicSource = await readFile(new URL('../netlify/functions/products.mjs', import.meta.url), 'utf8');

  assert.match(adminHtml, /name="imageFocalX"[^>]+type="range"/);
  assert.match(adminHtml, /name="imageFocalY"[^>]+type="range"/);
  assert.match(adminHtml, /id="image-preview-stage"/);
  assert.match(adminSource, /setFocalPointFromPointer/);
  assert.match(adminSource, /body\.imageFocalX = clampImageFocalPoint/);
  assert.match(menuSource, /productImagePosition\(product\)/);
  assert.match(productSource, /image\.style\.objectPosition = productImagePosition\(product\)/);
  assert.match(publicSource, /imageFocalX: product\.imageFocalX/);
  assert.match(publicSource, /imageFocalY: product\.imageFocalY/);
});

test('public menu retains active and sold-out presentation rules', async () => {
  const source = await readFile(new URL('../menu-products.js', import.meta.url), 'utf8');
  assert.match(source, /product\.soldOut/);
  assert.match(source, /Sold out/);
  assert.match(source, /button\.disabled=soldOut/);
});
