import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { orders } from '../../db/schema.js';
import { catalog, customizationSignature, customizationSummary, resolveCustomizations } from '../lib/catalog.mjs';

const clean = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
const addMetadata = (params, metadata) => {
  Object.entries(metadata).forEach(([key, value]) => {
    params.append(`metadata[${key}]`, value);
    params.append(`payment_intent_data[metadata][${key}]`, value);
  });
};
const missingMetadataFields = metadata => Object.entries(metadata)
  .filter(([, value]) => typeof value !== 'string' || !value.trim())
  .map(([key]) => key);
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
  const collectionTime = clean(body.collectionTime, 100);
  const notes = clean(body.notes, 400);
  const items = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!name || !validEmail || !phone || !fulfilment) {
    return Response.json({ error: 'Please provide valid customer and fulfilment details.' }, { status: 400 });
  }
  if (fulfilment === 'delivery' && (!address || !postcode)) {
    return Response.json({ error: 'A delivery address and postcode are required.' }, { status: 400 });
  }
  if (fulfilment === 'collection' && !collectionTime) {
    return Response.json({ error: 'Please provide your preferred collection time.' }, { status: 400 });
  }

  const validatedItems = items.map(item => {
    const id = clean(item?.id, 80);
    const quantity = Number(item?.quantity);
    const customizations = Array.isArray(item?.customizations)
      ? item.customizations.slice(0, 20).map(group => ({
        groupId: clean(group?.groupId, 80),
        selectionIds: Array.isArray(group?.selectionIds) ? group.selectionIds.slice(0, 20).map(selection => clean(selection, 80)) : [],
      }))
      : [];
    const resolved = resolveCustomizations(id, customizations);
    return { id, quantity, customizations, resolved };
  }).filter(item => catalog[item.id] && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 20 && item.resolved.valid);

  if (!validatedItems.length || validatedItems.length !== items.length) {
    return Response.json({ error: 'Your order contains an invalid item. Please return to the menu and try again.' }, { status: 400 });
  }

  const consolidatedItems = [...validatedItems.reduce((itemsBySignature, item) => {
    const signature = customizationSignature(item.id, item.resolved.selections);
    const existing = itemsBySignature.get(signature);
    if (existing) existing.quantity += item.quantity;
    else itemsBySignature.set(signature, { ...item, signature });
    return itemsBySignature;
  }, new Map()).values()];

  if (consolidatedItems.some(item => item.quantity > 20)) {
    return Response.json({ error: 'An item quantity is too high. Please reduce it and try again.' }, { status: 400 });
  }

  const orderItems = consolidatedItems.map(item => ({
    id: item.id,
    name: catalog[item.id].name,
    quantity: item.quantity,
    unitAmount: item.resolved.unitAmount,
    lineTotal: item.resolved.unitAmount * item.quantity,
    customizations: item.resolved.selections,
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
      notes: [
        fulfilment === 'collection' ? `Preferred collection time: ${collectionTime}` : '',
        notes,
      ].filter(Boolean).join('\n') || null,
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
  params.set('customer_creation', 'always');
  params.set('client_reference_id', orderReference);
  params.set('success_url', `${new URL(req.url).origin}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${new URL(req.url).origin}/cancelled.html`);
  params.set('submit_type', 'pay');
  params.set('payment_intent_data[receipt_email]', email);
  params.set('payment_intent_data[description]', `DeLife Kitchen order ${orderReference}`);

  if (fulfilment === 'delivery') {
    params.set('payment_intent_data[shipping][name]', name);
    params.set('payment_intent_data[shipping][phone]', phone);
    params.set('payment_intent_data[shipping][address][line1]', address);
    params.set('payment_intent_data[shipping][address][postal_code]', postcode);
    params.set('payment_intent_data[shipping][address][country]', 'GB');
  }

  orderItems.forEach((item, index) => {
    const summary = customizationSummary(item.customizations);
    params.set(`line_items[${index}][price_data][currency]`, 'gbp');
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmount));
    params.set(`line_items[${index}][price_data][product_data][name]`, item.name);
    if (summary) params.set(`line_items[${index}][price_data][product_data][description]`, summary.slice(0, 500));
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
  });

  const metadata = {
    order_reference: orderReference,
    customer_name: name,
    customer_phone: phone,
    customer_email: email,
    fulfilment,
    delivery_address: fulfilment === 'delivery' ? address : 'Not applicable (collection)',
    postcode: fulfilment === 'delivery' ? postcode : 'Not applicable (collection)',
    preferred_collection_time: fulfilment === 'collection' ? collectionTime : 'Not applicable (delivery)',
    special_instructions_allergies: notes || 'None provided',
    total_price: `${(amountTotal / 100).toFixed(2)} GBP`,
    total_price_pence: String(amountTotal),
    order_summary: orderItems.map(item => `${item.quantity}x ${item.name} (${customizationSummary(item.customizations)})`).join('; ').slice(0, 500),
  };

  const missingFields = missingMetadataFields(metadata);
  if (missingFields.length || Object.keys(metadata).length > 50) {
    console.error('Stripe metadata validation failed', {
      orderReference,
      missingFields,
      fieldCount: Object.keys(metadata).length,
    });
    await db.delete(orders).where(eq(orders.reference, orderReference));
    return Response.json({ error: 'Your order details could not be prepared for payment.' }, { status: 500 });
  }

  addMetadata(params, metadata);

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
