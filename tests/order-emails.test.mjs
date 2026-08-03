import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverEmailOnce, runPaidOrderNotifications } from '../netlify/lib/order-delivery.mjs';
import { createCustomerEmail, createMerchantEmail, createStatusEmail } from '../netlify/lib/order-emails.mjs';

const order = {
  id: 7,
  reference: 'DLK-TEST-7',
  status: 'preparing',
  customerName: 'Amara Okafor',
  customerEmail: 'amara@example.com',
  customerPhone: '07000 123456',
  fulfilment: 'delivery',
  deliveryAddress: '14 Market Lane',
  postcode: 'NG1 1AA',
  notes: 'Please ring the bell',
  currency: 'gbp',
  amountTotal: 2598,
  estimatedPrepMinutes: 25,
  items: [{
    id: 'jollof-rice',
    name: 'Jollof rice',
    quantity: 2,
    lineTotal: 2598,
    customizations: [{ groupName: 'Protein', selections: [{ name: 'Chicken' }] }],
  }],
};

const createStore = () => {
  const deliveries = new Map();
  const key = ({ order: currentOrder, kind, statusKey }) => `${currentOrder.id}:${kind}:${statusKey}`;
  return {
    deliveries,
    claim: async delivery => {
      const deliveryKey = key(delivery);
      if (deliveries.has(deliveryKey)) return false;
      deliveries.set(deliveryKey, { state: 'pending' });
      return true;
    },
    markSent: async delivery => deliveries.set(key(delivery), { state: 'sent' }),
    markFailed: async delivery => deliveries.set(key(delivery), { state: 'failed' }),
  };
};

test('customer and merchant paid emails include the required order details', () => {
  const branding = { logoUrl: 'https://example.com/assets/brand/delife-kitchen-logo.webp' };
  const customer = createCustomerEmail({ ...order, status: 'paid' }, {}, branding);
  const merchant = createMerchantEmail({ ...order, status: 'paid' }, branding);

  assert.match(customer.text, /Amara Okafor/);
  assert.match(customer.text, /DLK-TEST-7/);
  assert.match(customer.text, /Jollof rice/);
  assert.match(customer.text, /Delivery/);
  assert.match(customer.text, /14 Market Lane/);
  assert.match(customer.text, /£25\.98/);
  assert.match(customer.text, /Order status: paid/);
  assert.match(customer.text, /Need help\?/);
  assert.match(customer.text, /African and Caribbean Cuisine/);
  assert.match(customer.html, /Delife Kitchen African and Caribbean Cuisine/);
  assert.match(customer.html, /https:\/\/example\.com\/assets\/brand\/delife-kitchen-logo\.webp/);
  assert.match(customer.html, /background:transparent/);
  assert.match(merchant.text, /07000 123456/);
  assert.match(merchant.text, /African and Caribbean Cuisine/);
  assert.match(merchant.text, /Protein: Chicken/);
  assert.match(merchant.text, /Please ring the bell/);
});

test('preparing status email includes estimated preparation time', () => {
  const email = createStatusEmail(order, 'preparing');
  assert.match(email.text, /Estimated preparation time: 25 minutes\./);
  assert.match(email.html, /Estimated preparation time: 25 minutes\./);
});

test('paid notification attempts customer delivery when merchant delivery fails', async () => {
  let customerAttempts = 0;
  const result = await runPaidOrderNotifications({
    order,
    sendMerchant: async () => ({ sent: false, error: 'provider unavailable' }),
    sendCustomer: async () => { customerAttempts += 1; return { sent: true }; },
  });

  assert.equal(customerAttempts, 1);
  assert.equal(result.customer.sent, true);
  assert.equal(result.merchant.sent, false);
});

test('email transport failure is returned without rejecting webhook work', async () => {
  const result = await deliverEmailOnce({
    order,
    kind: 'customer',
    statusKey: 'paid',
    recipient: order.customerEmail,
    email: createCustomerEmail(order),
    store: createStore(),
    transport: { send: async () => { throw new Error('Resend unavailable'); } },
  });

  assert.equal(result.sent, false);
  assert.equal(result.error, 'Resend unavailable');
});

test('duplicate paid events send one customer confirmation', async () => {
  const store = createStore();
  let sends = 0;
  const send = () => deliverEmailOnce({
    order,
    kind: 'customer',
    statusKey: 'paid',
    recipient: order.customerEmail,
    email: createCustomerEmail(order),
    store,
    transport: { send: async () => { sends += 1; } },
  });

  const first = await send();
  const duplicate = await send();
  assert.equal(first.sent, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(sends, 1);
});
