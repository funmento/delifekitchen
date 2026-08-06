import { and, eq, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { orders, promotionUsage } from '../../db/schema.js';
import { sendPaidOrderNotifications } from '../lib/order-notifications.mjs';
import {
  paidOrderChanges,
  paymentFromStripeEvent,
  relevantStripeEvents,
  verifyStripeSignature,
} from '../lib/stripe-webhook-helpers.mjs';

export default async (req, context) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const webhookSecret = Netlify.env.get('STRIPE_WEBHOOK_SECRET');
  const signature = req.headers.get('stripe-signature');
  if (!webhookSecret || !signature) return new Response('Webhook is not configured', { status: 503 });

  const payload = await req.text();
  if (!verifyStripeSignature(payload, signature, webhookSecret)) return new Response('Invalid signature', { status: 400 });

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('Invalid payload', { status: 400 });
  }

  if (!relevantStripeEvents.has(event.type)) return Response.json({ received: true });

  const payment = paymentFromStripeEvent(event);
  if (!payment) return Response.json({ received: true });
  if (!payment.reference && !payment.sessionId && !payment.paymentIntentId) {
    return new Response('Order reference missing', { status: 400 });
  }

  const matches = [
    payment.reference ? eq(orders.reference, payment.reference) : null,
    payment.sessionId ? eq(orders.stripeSessionId, payment.sessionId) : null,
    payment.paymentIntentId ? eq(orders.stripePaymentIntentId, payment.paymentIntentId) : null,
  ].filter(Boolean);
  const [order] = await db.select().from(orders).where(or(...matches)).limit(1);
  if (!order) return new Response('Order not ready', { status: 500 });

  if (payment.amount !== order.amountTotal || payment.currency !== order.currency) {
    console.error('Paid order amount did not match', order.reference);
    return new Response('Order amount mismatch', { status: 400 });
  }

  const [paidOrder] = await db.update(orders)
    .set(paidOrderChanges(order, payment))
    .where(eq(orders.id, order.id))
    .returning();

  await db.update(promotionUsage).set({ status: 'used', usedAt: new Date() }).where(and(eq(promotionUsage.orderId, paidOrder.id), eq(promotionUsage.status, 'reserved')));

  const notifications = sendPaidOrderNotifications(paidOrder).catch(error => {
    console.error('Order notification task failed', error instanceof Error ? error.message : 'UnknownError');
  });
  if (context?.waitUntil) context.waitUntil(notifications);
  else await notifications;

  return Response.json({ received: true });
};

export const config = {
  path: '/api/stripe-webhook',
};
