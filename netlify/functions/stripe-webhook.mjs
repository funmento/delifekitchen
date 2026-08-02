import { eq, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { orders } from '../../db/schema.js';
import { createCustomerEmail, createMerchantEmail, sendOrderEmail } from '../lib/order-emails.mjs';
import {
  paidOrderChanges,
  paymentFromStripeEvent,
  relevantStripeEvents,
  verifyStripeSignature,
} from '../lib/stripe-webhook-helpers.mjs';

const sendOrderNotifications = async order => {
  const resendApiKey = Netlify.env.get('RESEND_API_KEY');
  const emailFrom = Netlify.env.get('ORDER_EMAIL_FROM');
  const merchantEmail = Netlify.env.get('ORDER_NOTIFICATION_EMAIL');
  if (!resendApiKey || !emailFrom || !merchantEmail) {
    console.error('Order email delivery is not configured');
    return;
  }

  try {
    if (!order.merchantEmailSentAt) {
      await sendOrderEmail({
        apiKey: resendApiKey,
        from: emailFrom,
        to: merchantEmail,
        email: createMerchantEmail(order),
        idempotencyKey: `${order.reference}-merchant`,
      });
      await db.update(orders).set({ merchantEmailSentAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, order.id));
    }

    if (!order.customerEmailSentAt) {
      await sendOrderEmail({
        apiKey: resendApiKey,
        from: emailFrom,
        to: order.customerEmail,
        email: createCustomerEmail(order),
        idempotencyKey: `${order.reference}-customer`,
      });
      await db.update(orders).set({ customerEmailSentAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, order.id));
    }
  } catch (error) {
    console.error('Order email delivery failed', error instanceof Error ? error.message : 'UnknownError');
  }
};

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

  if (context?.waitUntil) context.waitUntil(sendOrderNotifications(paidOrder));
  else await sendOrderNotifications(paidOrder);

  return Response.json({ received: true });
};

export const config = {
  path: '/api/stripe-webhook',
};
