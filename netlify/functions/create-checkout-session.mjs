import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { orders } from '../../db/schema.js';
import { catalog } from '../lib/catalog.mjs';

const clean = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
const addMetadata = (params, metadata) => {
  Object.entries(metadata).forEach(([key, value]) => {
    params.append(`metadata[${key}]`, value);
    params.append(`payment_intent_data[metadata][${key}]`, value);
  });
};
const createOrderReference = () => {
  const date = new Date().toISOString().slice(2, 10).replaceAll('-', '');
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  return `DLK-${date}-${suffix}`;
};

export default async req => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });

  const stripeSecretKey = Netlify.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) return Response.json({ error: 'Payments are not configured yet.' }, { status: 503 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid checkout request.' }, { status: 400 });
  }

  const name = clean(body.customer?.name, 100);
  const email = clean(body.customer?.email, 200).toLowerCase();
  const phone = clean(body.customer?.phone, 40);
  const fulfilment = body.fulfilment === 'delivery' ? 'delivery' : body.fulfilment === 'collection' ? 'collection' : '';
  const address = clean(body.address, 300);
  const postcode = clean(body.postcode, 20);
  const notes = clean(body.notes, 400);
  const items = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!name || !validEmail || !phone || !fulfilment) {
    return Response.json({ error: 'Please provide valid customer and fulfilment details.' }, { status: 400 });
  }
  if (fulfilment === 'delivery' && (!address || !postcode)) {
    return Response.json({ error: 'A delivery address and postcode are required.' }, { status: 400 });
  }

  const validatedItems = items.map(item => ({
    id: clean(item?.id, 80),
    quantity: Number(item?.quantity),
  })).filter(item => catalog[item.id] && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 20);

  if (!validatedItems.length || validatedItems.length !== items.length) {
    return Response.json({ error: 'Your order contains an invalid item. Please return to the menu and try again.' }, { status: 400 });
  }

  const orderItems = validatedItems.map(item => ({
    id: item.id,
    name: catalog[item.id].name,
    quantity: item.quantity,
    unitAmount: catalog[item.id].unitAmount,
    lineTotal: catalog[item.id].unitAmount * item.quantity,
  }));
  const amountTotal = orderItems.reduce((total, item) => total + item.lineTotal, 0);
  const orderReference = createOrderReference();

  try {
    await db.insert(orders).values({
      reference: orderReference,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      fulfilment,
      deliveryAddress: fulfilment === 'delivery' ? address : null,
      postcode: fulfilment === 'delivery' ? postcode : null,
      notes: notes || null,
      amountTotal,
      items: orderItems,
    });
  } catch (error) {
    console.error('Order creation failed', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: 'Your order could not be prepared. Please try again.' }, { status: 500 });
  }

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('customer_email', email);
  params.set('client_reference_id', orderReference);
  params.set('success_url', `${new URL(req.url).origin}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${new URL(req.url).origin}/cancelled.html`);
  params.set('submit_type', 'pay');

  orderItems.forEach((item, index) => {
    params.set(`line_items[${index}][price_data][currency]`, 'gbp');
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmount));
    params.set(`line_items[${index}][price_data][product_data][name]`, item.name);
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
  });

  addMetadata(params, {
    order_reference: orderReference,
    customer_name: name,
    customer_phone: phone,
    fulfilment,
  });

  try {
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {
      console.error('Stripe Checkout Session error', session.error?.type || stripeResponse.status);
      await db.delete(orders).where(eq(orders.reference, orderReference));
      return Response.json({ error: 'Secure payment could not be opened. Please try again.' }, { status: 502 });
    }

    await db.update(orders).set({
      stripeSessionId: session.id,
      updatedAt: new Date(),
    }).where(eq(orders.reference, orderReference));

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('Stripe Checkout request failed', error instanceof Error ? error.name : 'UnknownError');
    await db.delete(orders).where(eq(orders.reference, orderReference));
    return Response.json({ error: 'Secure payment could not be opened. Please try again.' }, { status: 502 });
  }
};

export const config = {
  path: '/api/create-checkout-session',
};
