import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  paidOrderChanges,
  paymentFromStripeEvent,
  verifyStripeSignature,
} from '../netlify/lib/stripe-webhook-helpers.mjs';

test('Stripe signatures are verified against the raw request body', () => {
  const payload = JSON.stringify({ id: 'evt_test' });
  const secret = 'whsec_test';
  const timestamp = 1_700_000_000;
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');

  assert.equal(verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret, timestamp * 1000), true);
  assert.equal(verifyStripeSignature(`${payload} `, `t=${timestamp},v1=${signature}`, secret, timestamp * 1000), false);
  assert.equal(verifyStripeSignature(payload, `t=${timestamp - 301},v1=${signature}`, secret, timestamp * 1000), false);
});

test('completed Checkout Sessions map to paid orders', () => {
  const payment = paymentFromStripeEvent({
    type: 'checkout.session.completed',
    created: 1_700_000_000,
    data: { object: {
      id: 'cs_test_123',
      payment_status: 'paid',
      payment_intent: 'pi_123',
      amount_total: 4598,
      currency: 'gbp',
      client_reference_id: 'DLK-TEST',
      metadata: {},
    } },
  });

  assert.deepEqual(payment, {
    reference: 'DLK-TEST',
    sessionId: 'cs_test_123',
    paymentIntentId: 'pi_123',
    amount: 4598,
    currency: 'gbp',
    paidAt: new Date('2023-11-14T22:13:20.000Z'),
  });
});

test('successful PaymentIntents provide a metadata fallback', () => {
  const payment = paymentFromStripeEvent({
    type: 'payment_intent.succeeded',
    created: 1_700_000_000,
    data: { object: {
      id: 'pi_123',
      status: 'succeeded',
      amount_received: 4598,
      currency: 'gbp',
      metadata: { order_reference: 'DLK-TEST' },
    } },
  });

  assert.equal(payment.reference, 'DLK-TEST');
  assert.equal(payment.paymentIntentId, 'pi_123');
  assert.equal(payment.amount, 4598);
});

test('paid updates preserve the first paid timestamp and known Stripe ids', () => {
  const originalPaidAt = new Date('2026-08-01T12:00:00.000Z');
  const changes = paidOrderChanges(
    { paidAt: originalPaidAt },
    {
      paidAt: new Date('2026-08-02T12:00:00.000Z'),
      sessionId: null,
      paymentIntentId: 'pi_123',
    },
  );

  assert.equal(changes.status, 'paid');
  assert.equal(changes.paidAt, originalPaidAt);
  assert.equal(changes.stripePaymentIntentId, 'pi_123');
  assert.equal('stripeSessionId' in changes, false);
});

test('duplicate payment events do not move progressed orders back to paid', () => {
  const changes = paidOrderChanges(
    { status: 'preparing', paidAt: new Date('2026-08-02T12:00:00.000Z') },
    { paidAt: new Date('2026-08-02T12:05:00.000Z'), sessionId: 'cs_123', paymentIntentId: 'pi_123' },
  );

  assert.equal(changes.status, 'preparing');
});
