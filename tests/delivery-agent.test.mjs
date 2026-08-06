import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createDeliveryAgentHandler,
  createDeliveryToken,
  hashDeliveryToken,
} from '../netlify/lib/delivery-agent.mjs';
import { createStatusEmail } from '../netlify/lib/order-emails.mjs';
import { deliverEmailOnce } from '../netlify/lib/order-delivery.mjs';

const tokenFor = byte => createDeliveryToken(size => Buffer.alloc(size, byte));

const orderFor = ({ token, status = 'ready', id = 1, fulfilment = 'delivery' } = {}) => ({
  id,
  reference: `DLK-DELIVERY-${id}`,
  status,
  customerName: 'Amina Okafor',
  customerEmail: 'amina@example.com',
  customerPhone: '07000000000',
  fulfilment,
  deliveryAddress: '10 Oxford Road, Manchester',
  postcode: 'M13 0XX',
  notes: 'Ring the bell',
  currency: 'gbp',
  amountTotal: 3200,
  orderTotalPence: 3200,
  items: [{ id: 'jollof', name: 'Jollof Rice', quantity: 2, lineTotal: 3200, customizations: [] }],
  deliveryAgentName: 'Chidi',
  deliveryTokenHash: hashDeliveryToken(token),
  deliveredAt: null,
});

const createStore = orders => ({
  findByTokenHash: async tokenHash => orders.find(order => order.deliveryTokenHash === tokenHash) || null,
  complete: async ({ order, tokenHash, deliveredAt, deliveryCompletionNote, allowedStatuses }) => {
    const current = orders.find(item => item.id === order.id);
    if (!current || current.deliveryTokenHash !== tokenHash || current.fulfilment !== 'delivery'
      || !allowedStatuses.includes(current.status) || current.deliveredAt) return null;
    Object.assign(current, {
      status: 'completed',
      deliveredAt,
      deliveryCompletionNote,
      deliveryTokenHash: null,
    });
    return current;
  },
});

const requestFor = (token, method = 'GET', body = undefined) => new Request(`https://example.test/api/delivery/${token}`, {
  method,
  headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test('delivery tokens are random-looking and only their hash is stored', () => {
  const token = createDeliveryToken();
  const another = createDeliveryToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, another);
  assert.match(hashDeliveryToken(token), /^[a-f0-9]{64}$/);
  assert.notEqual(hashDeliveryToken(token), token);
});

test('delivery page returns only the order belonging to its token', async () => {
  const firstToken = tokenFor(1);
  const secondToken = tokenFor(2);
  const handler = createDeliveryAgentHandler({
    store: createStore([orderFor({ token: firstToken, id: 1 }), orderFor({ token: secondToken, id: 2 })]),
    notifyCompleted: async () => {},
  });

  const response = await handler(requestFor(secondToken));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.order.reference, 'DLK-DELIVERY-2');
  assert.equal(data.order.customerEmail, undefined);
  assert.equal(data.order.id, undefined);
});

test('invalid delivery token is rejected', async () => {
  const handler = createDeliveryAgentHandler({ store: createStore([]), notifyCompleted: async () => {} });
  const response = await handler(requestFor('not-a-valid-token'));
  assert.equal(response.status, 404);
});

test('cancelled delivery order cannot be marked delivered', async () => {
  const token = tokenFor(3);
  const order = orderFor({ token, status: 'cancelled' });
  const handler = createDeliveryAgentHandler({ store: createStore([order]), notifyCompleted: async () => {} });
  const response = await handler(requestFor(token, 'POST', {}));
  assert.equal(response.status, 409);
  assert.equal(order.status, 'cancelled');
  assert.equal(order.deliveredAt, null);
});

for (const status of ['paid', 'ready', 'out_for_delivery']) {
  test(`${status} delivery can be completed with deliveredAt stored`, async () => {
    const token = tokenFor(status.length);
    const order = orderFor({ token, status });
    const deliveredAt = new Date('2026-08-06T12:30:00.000Z');
    const handler = createDeliveryAgentHandler({
      store: createStore([order]),
      notifyCompleted: async () => {},
      now: () => deliveredAt,
    });
    const response = await handler(requestFor(token, 'POST', { deliveryCompletionNote: 'Handed to customer' }));
    assert.equal(response.status, 200);
    assert.equal(order.status, 'completed');
    assert.equal(order.deliveredAt, deliveredAt);
    assert.equal(order.deliveryCompletionNote, 'Handed to customer');
  });
}

test('duplicate delivered click sends the completed customer email once', async () => {
  const token = tokenFor(9);
  const order = orderFor({ token, status: 'out_for_delivery' });
  const emailClaims = new Set();
  let emailSends = 0;
  const handler = createDeliveryAgentHandler({
    store: createStore([order]),
    notifyCompleted: completed => deliverEmailOnce({
      order: completed,
      kind: 'customer',
      statusKey: 'completed',
      recipient: completed.customerEmail,
      email: createStatusEmail(completed, 'completed'),
      store: {
        claim: async ({ order: current, kind, statusKey }) => {
          const key = `${current.id}:${kind}:${statusKey}`;
          if (emailClaims.has(key)) return false;
          emailClaims.add(key);
          return true;
        },
        markSent: async () => {},
        markFailed: async () => {},
      },
      transport: { send: async () => { emailSends += 1; } },
    }),
  });

  const first = await handler(requestFor(token, 'POST', {}));
  const duplicate = await handler(requestFor(token, 'POST', {}));
  assert.equal(first.status, 200);
  assert.equal(duplicate.status, 404);
  assert.equal(emailSends, 1);
});

test('delivery migration is nullable and leaves existing orders unchanged', async () => {
  const migration = await readFile(new URL('../netlify/database/migrations/20260806121523_add_delivery_agent_completion/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /ADD COLUMN "delivery_agent_name" text/);
  assert.match(migration, /ADD COLUMN "delivered_at" timestamp with time zone/);
  assert.doesNotMatch(migration, /NOT NULL|UPDATE "orders"|DELETE FROM "orders"|DROP TABLE "orders"/);
});
