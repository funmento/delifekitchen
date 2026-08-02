import { createHmac, timingSafeEqual } from 'node:crypto';

export const relevantStripeEvents = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'payment_intent.succeeded',
]);

export const verifyStripeSignature = (payload, signatureHeader, secret, now = Date.now()) => {
  const values = signatureHeader.split(',').reduce((result, part) => {
    const [key, value] = part.trim().split('=', 2);
    if (key && value) (result[key] ||= []).push(value);
    return result;
  }, {});
  const timestamp = Number(values.t?.[0]);
  if (!Number.isInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 300) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return (values.v1 || []).some(signature => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  });
};

const objectId = value => typeof value === 'string' ? value : value?.id;
const eventDate = event => Number.isInteger(event.created) ? new Date(event.created * 1000) : new Date();

export const paymentFromStripeEvent = event => {
  if (!relevantStripeEvents.has(event?.type)) return null;

  const object = event.data?.object;
  if (!object?.id) return null;

  if (event.type === 'payment_intent.succeeded') {
    if (object.status !== 'succeeded') return null;
    return {
      reference: object.metadata?.order_reference || null,
      sessionId: null,
      paymentIntentId: object.id,
      amount: Number(object.amount_received ?? object.amount),
      currency: String(object.currency || '').toLowerCase(),
      paidAt: eventDate(event),
    };
  }

  if (object.payment_status !== 'paid') return null;
  return {
    reference: object.metadata?.order_reference || object.client_reference_id || null,
    sessionId: object.id,
    paymentIntentId: objectId(object.payment_intent) || null,
    amount: Number(object.amount_total),
    currency: String(object.currency || '').toLowerCase(),
    paidAt: eventDate(event),
  };
};

export const paidOrderChanges = (order, payment) => ({
  status: order.status && order.status !== 'pending' ? order.status : 'paid',
  paidAt: order.paidAt || payment.paidAt,
  updatedAt: new Date(),
  ...(payment.sessionId ? { stripeSessionId: payment.sessionId } : {}),
  ...(payment.paymentIntentId ? { stripePaymentIntentId: payment.paymentIntentId } : {}),
});
