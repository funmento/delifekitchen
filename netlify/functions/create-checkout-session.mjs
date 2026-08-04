import { eq } from 'drizzle-orm';
import { customizationSummary } from '../lib/catalog.mjs';
import { validateDeliveryPostcode, validateFulfilmentAvailability } from '../lib/delivery-rules.mjs';
import { calculateOrderPricing, resolveCheckoutItems } from '../lib/order-pricing.mjs';

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

export const createCheckoutSessionHandler = ({
  database = null,
  ordersTable = null,
  env = globalThis.Netlify?.env,
  stripeFetch = fetch,
  loadDeliverySettings = async databaseClient => {
    const { getDeliverySettings } = await import('../lib/delivery-settings.mjs');
    return getDeliverySettings(databaseClient || undefined);
  },
  validatePostcode = validateDeliveryPostcode,
  loadProducts = async (databaseClient, slugs) => (await import('../lib/products.mjs')).loadCatalog(databaseClient, { slugs }),
} = {}) => async req => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });

  const stripeSecretKey = env?.get('STRIPE_SECRET_KEY');
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

  let deliverySettings;
  try {
    deliverySettings = await loadDeliverySettings(database);
  } catch (error) {
    console.error('Delivery settings checkout load failed', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: 'Delivery options could not be checked. Please try again.' }, { status: 503 });
  }

  const fulfilmentAvailability = validateFulfilmentAvailability(fulfilment, deliverySettings);
  if (!fulfilmentAvailability.allowed) {
    return Response.json({ error: fulfilmentAvailability.message }, { status: 409 });
  }

  let deliveryValidation = null;
  if (fulfilment === 'delivery') {
    deliveryValidation = await validatePostcode(postcode, deliverySettings);
    if (!deliveryValidation.allowed) {
      const status = deliveryValidation.reason === 'postcode-lookup-unavailable' || deliveryValidation.reason === 'base-postcode-unavailable' ? 503 : 400;
      return Response.json({ error: deliveryValidation.message }, { status });
    }
  }

  let activeDatabase = database;
  let activeOrdersTable = ordersTable;
  if (!activeDatabase || !activeOrdersTable) {
    const [databaseModule, schemaModule] = await Promise.all([
      import('../../db/index.js'),
      import('../../db/schema.js'),
    ]);
    activeDatabase ||= databaseModule.db;
    activeOrdersTable ||= schemaModule.orders;
  }

  const resolvedItems = await resolveCheckoutItems({ rawItems: items, database: activeDatabase, loadProducts });
  if (!resolvedItems.ok) return Response.json({ error: resolvedItems.error }, { status: resolvedItems.status });
  const { orderItems, subtotalPence } = resolvedItems;
  const pricing = calculateOrderPricing({
    fulfilment,
    subtotalPence,
    distanceMiles: deliveryValidation?.distanceMiles,
    settings: deliverySettings,
  });
  if (!pricing.ok) return Response.json({ error: pricing.error }, { status: pricing.status });
  const amountTotal = pricing.totalPence;
  const orderReference = createOrderReference();

  try {
    await activeDatabase.insert(activeOrdersTable).values({
      reference: orderReference,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      fulfilment,
      deliveryAddress: fulfilment === 'delivery' ? address : null,
      postcode: fulfilment === 'delivery' ? deliveryValidation.postcode : null,
      deliveryValidationResult: fulfilment === 'delivery' ? deliveryValidation.validationResult : null,
      deliveryDistanceMiles: fulfilment === 'delivery' ? deliveryValidation.distanceMiles : null,
      deliveryRestrictionMode: fulfilment === 'delivery' ? deliveryValidation.restrictionMode : null,
      deliveryFeePence: pricing.deliveryFeePence,
      deliveryPricingRule: pricing.pricingRule,
      orderSubtotalPence: pricing.subtotalPence,
      orderTotalPence: pricing.totalPence,
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
    params.set('payment_intent_data[shipping][address][postal_code]', deliveryValidation.postcode);
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
  if (pricing.deliveryFeePence > 0) {
    const index = orderItems.length;
    params.set(`line_items[${index}][price_data][currency]`, 'gbp');
    params.set(`line_items[${index}][price_data][unit_amount]`, String(pricing.deliveryFeePence));
    params.set(`line_items[${index}][price_data][product_data][name]`, 'Delivery');
    params.set(`line_items[${index}][price_data][product_data][description]`, pricing.pricingRule.slice(0, 500));
    params.set(`line_items[${index}][quantity]`, '1');
  }

  const metadata = {
    order_reference: orderReference,
    customer_name: name,
    customer_phone: phone,
    customer_email: email,
    fulfilment,
    delivery_address: fulfilment === 'delivery' ? address : 'Not applicable (collection)',
    postcode: fulfilment === 'delivery' ? deliveryValidation.postcode : 'Not applicable (collection)',
    preferred_collection_time: fulfilment === 'collection' ? collectionTime : 'Not applicable (delivery)',
    special_instructions_allergies: notes || 'None provided',
    item_subtotal_pence: String(pricing.subtotalPence),
    delivery_fee_pence: String(pricing.deliveryFeePence),
    delivery_distance_miles: fulfilment === 'delivery' ? String(deliveryValidation.distanceMiles) : 'Not applicable (collection)',
    delivery_pricing_rule: pricing.pricingRule,
    total_price: `${(pricing.totalPence / 100).toFixed(2)} GBP`,
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
    await activeDatabase.delete(activeOrdersTable).where(eq(activeOrdersTable.reference, orderReference));
    return Response.json({ error: 'Your order details could not be prepared for payment.' }, { status: 500 });
  }

  addMetadata(params, metadata);

  try {
    const stripeResponse = await stripeFetch('https://api.stripe.com/v1/checkout/sessions', {
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
      await activeDatabase.delete(activeOrdersTable).where(eq(activeOrdersTable.reference, orderReference));
      return Response.json({ error: 'Secure payment could not be opened. Please try again.' }, { status: 502 });
    }

    await activeDatabase.update(activeOrdersTable).set({
      stripeSessionId: session.id,
      updatedAt: new Date(),
    }).where(eq(activeOrdersTable.reference, orderReference));

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('Stripe Checkout request failed', error instanceof Error ? error.name : 'UnknownError');
    await activeDatabase.delete(activeOrdersTable).where(eq(activeOrdersTable.reference, orderReference));
    return Response.json({ error: 'Secure payment could not be opened. Please try again.' }, { status: 502 });
  }
};

export default createCheckoutSessionHandler();

export const config = {
  path: '/api/create-checkout-session',
};
