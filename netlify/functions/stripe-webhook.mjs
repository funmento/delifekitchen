import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { orders } from '../../db/schema.js';
import { createCustomerEmail, createMerchantEmail, sendOrderEmail } from '../lib/order-emails.mjs';

const relevantEvents = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

const verifyStripeSignature = (payload, signatureHeader, secret) => {
  const values = signatureHeader.split(',').reduce((result, part) => {
    const [key, value] = part.split('=', 2);
    if (key && value) (result[key] ||= []).push(value);
    return result;
  }, {});
  const timestamp = Number(values.t?.[0]);
  if (!Number.isInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return (values.v1 || []).some(signature => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  });
};

export default async req => {
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

  if (!relevantEvents.has(event.type)) return Response.json({ received: true });

  const session = event.data?.object;
  if (!session?.id || session.payment_status !== 'paid') return Response.json({ received: true });

  const requiredMetadataFields = [
    'order_reference',
    'customer_name',
    'customer_phone',
    'customer_email',
    'fulfilment',
    'delivery_address',
    'postcode',
    'preferred_collection_time',
    'special_instructions_allergies',
    'total_price',
  ];
  const missingMetadataFields = requiredMetadataFields.filter(field => !session.metadata?.[field]);
  if (missingMetadataFields.length) {
    console.error('Paid Stripe session metadata missing', {
      sessionId: session.id,
      missingFields: missingMetadataFields,
    });
  }

  const reference = session.metadata?.order_reference || session.client_reference_id;
  if (!reference) return new Response('Order reference missing', { status: 400 });

  const [order] = await db.select().from(orders).where(or(
    eq(orders.reference, reference),
    eq(orders.stripeSessionId, session.id),
  )).limit(1);
  if (!order) return new Response('Order not ready', { status: 500 });

  if (Number(session.amount_total) !== order.amountTotal || String(session.currency).toLowerCase() !== order.currency) {
    console.error('Paid order amount did not match', order.reference);
    return new Response('Order amount mismatch', { status: 400 });
  }

  const paidAt = order.paidAt || new Date();
  await db.update(orders).set({
    status: 'paid',
    stripeSessionId: session.id,
    stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    paidAt,
    updatedAt: new Date(),
  }).where(eq(orders.id, order.id));

  const resendApiKey = Netlify.env.get('RESEND_API_KEY');
  const emailFrom = Netlify.env.get('ORDER_EMAIL_FROM');
  const merchantEmail = Netlify.env.get('ORDER_NOTIFICATION_EMAIL');
  if (!resendApiKey || !emailFrom || !merchantEmail) {
    console.error('Order email delivery is not configured');
    return new Response('Email delivery is not configured', { status: 500 });
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
    return new Response('Email delivery failed', { status: 500 });
  }

  return Response.json({ received: true });
};

export const config = {
  path: '/api/stripe-webhook',
};
