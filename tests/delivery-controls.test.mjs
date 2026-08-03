import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCheckoutSessionHandler } from '../netlify/functions/create-checkout-session.mjs';
import {
  DEFAULT_DELIVERY_SETTINGS,
  validateDeliveryPostcode,
  validateFulfilmentAvailability,
} from '../netlify/lib/delivery-rules.mjs';

const settings = overrides => ({ ...DEFAULT_DELIVERY_SETTINGS, ...overrides });

const postcodeFetch = locations => async url => {
  const normalized = decodeURIComponent(String(url).split('/').pop());
  const result = locations[normalized];
  if (!result) return new Response(JSON.stringify({ status: 404, error: 'Postcode not found' }), { status: 404 });
  return Response.json({ result: { postcode: normalized, ...result } });
};

test('delivery disabled blocks delivery without affecting collection', () => {
  const current = settings({ deliveryEnabled: false, collectionEnabled: true });
  assert.equal(validateFulfilmentAvailability('delivery', current).allowed, false);
  assert.equal(validateFulfilmentAvailability('collection', current).allowed, true);
});

test('collection disabled blocks collection without affecting delivery', () => {
  const current = settings({ deliveryEnabled: true, collectionEnabled: false });
  assert.equal(validateFulfilmentAvailability('collection', current).allowed, false);
  assert.equal(validateFulfilmentAvailability('delivery', current).allowed, true);
});

test('allowed postcode prefix is accepted', async () => {
  const result = await validateDeliveryPostcode('m13 0xx', settings({
    deliveryRestrictionMode: 'prefixes',
    allowedPostcodePrefixes: ['M13'],
  }), { fetchImpl: postcodeFetch({ 'M13 0XX': { latitude: 53.459, longitude: -2.215 } }) });
  assert.equal(result.allowed, true);
  assert.equal(result.postcode, 'M13 0XX');
});

test('disallowed postcode prefix is rejected', async () => {
  const result = await validateDeliveryPostcode('M20 2LT', settings({
    deliveryRestrictionMode: 'prefixes',
    allowedPostcodePrefixes: ['M13'],
  }), { fetchImpl: postcodeFetch({ 'M20 2LT': { latitude: 53.417, longitude: -2.231 } }) });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'outside-delivery-area');
});

test('radius postcode inside 15 miles is accepted with distance', async () => {
  const result = await validateDeliveryPostcode('M14 5TP', settings({
    deliveryRestrictionMode: 'radius',
    baseDeliveryPostcode: 'M13 0XX',
    deliveryRadiusMiles: 15,
  }), {
    fetchImpl: postcodeFetch({
      'M13 0XX': { latitude: 53.459, longitude: -2.215 },
      'M14 5TP': { latitude: 53.447, longitude: -2.225 },
    }),
  });
  assert.equal(result.allowed, true);
  assert.ok(result.distanceMiles < 15);
});

test('radius postcode outside 15 miles is rejected', async () => {
  const result = await validateDeliveryPostcode('L1 8JQ', settings({
    deliveryRestrictionMode: 'radius',
    baseDeliveryPostcode: 'M13 0XX',
    deliveryRadiusMiles: 15,
  }), {
    fetchImpl: postcodeFetch({
      'M13 0XX': { latitude: 53.459, longitude: -2.215 },
      'L1 8JQ': { latitude: 53.399, longitude: -2.991 },
    }),
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'outside-delivery-area');
  assert.ok(result.distanceMiles > 15);
});

test('invalid postcode is rejected', async () => {
  const result = await validateDeliveryPostcode('not a postcode', settings({ deliveryRestrictionMode: 'none' }), {
    fetchImpl: postcodeFetch({}),
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'invalid-postcode');
});

test('checkout stops before order creation when delivery is unavailable', async () => {
  let insertCalled = false;
  let stripeCalled = false;
  const handler = createCheckoutSessionHandler({
    database: { insert: () => { insertCalled = true; throw new Error('should not insert'); } },
    env: { get: () => 'configured-for-test' },
    loadDeliverySettings: async () => settings({ deliveryEnabled: false, collectionEnabled: true }),
    stripeFetch: async () => { stripeCalled = true; throw new Error('should not call Stripe'); },
  });
  const response = await handler(new Request('https://example.test/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { name: 'Amina Okafor', email: 'amina@example.com', phone: '07000000000' },
      fulfilment: 'delivery',
      address: '10 Oxford Road',
      postcode: 'M13 0XX',
      items: [{ id: 'fried-plantain', quantity: 1, customizations: [] }],
    }),
  }));
  assert.equal(response.status, 409);
  assert.equal(insertCalled, false);
  assert.equal(stripeCalled, false);
});

test('delivery migration leaves existing orders unchanged', async () => {
  const migration = await readFile(new URL('../netlify/database/migrations/20260803181932_add_delivery_controls/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /ADD COLUMN "delivery_validation_result" text/);
  assert.match(migration, /ADD COLUMN "delivery_distance_miles" real/);
  assert.match(migration, /ADD COLUMN "delivery_restriction_mode" text/);
  assert.doesNotMatch(migration, /UPDATE "orders"|DELETE FROM "orders"|DROP TABLE "orders"/);
});
