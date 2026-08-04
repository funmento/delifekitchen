import { validateDeliveryPostcode, validateFulfilmentAvailability } from '../lib/delivery-rules.mjs';
import { calculateOrderPricing, resolveCheckoutItems } from '../lib/order-pricing.mjs';

const clean = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

export const deliveryQuoteHandler = ({
  database = null,
  loadDeliverySettings = async databaseClient => {
    const { getDeliverySettings } = await import('../lib/delivery-settings.mjs');
    return getDeliverySettings(databaseClient || undefined);
  },
  validatePostcode = validateDeliveryPostcode,
  loadProducts = async (databaseClient, slugs) => (await import('../lib/products.mjs')).loadCatalog(databaseClient, { slugs }),
} = {}) => async req => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid delivery quote request.' }, { status: 400 });
  }

  const fulfilment = body.fulfilment === 'delivery' ? 'delivery' : body.fulfilment === 'collection' ? 'collection' : '';
  if (!fulfilment) return Response.json({ error: 'Choose delivery or collection.' }, { status: 400 });

  let settings;
  try {
    settings = await loadDeliverySettings(database);
  } catch {
    return Response.json({ error: 'Delivery options could not be checked. Please try again.' }, { status: 503 });
  }
  const availability = validateFulfilmentAvailability(fulfilment, settings);
  if (!availability.allowed) return Response.json({ error: availability.message }, { status: 409 });

  let deliveryValidation = null;
  if (fulfilment === 'delivery') {
    const postcode = clean(body.postcode, 20);
    if (!postcode) return Response.json({ error: 'Enter a postcode to calculate delivery.' }, { status: 400 });
    deliveryValidation = await validatePostcode(postcode, settings);
    if (!deliveryValidation.allowed) {
      const status = ['postcode-lookup-unavailable', 'base-postcode-unavailable'].includes(deliveryValidation.reason) ? 503 : 400;
      return Response.json({ error: deliveryValidation.message }, { status });
    }
  }

  let activeDatabase = database;
  if (!activeDatabase) activeDatabase = (await import('../../db/index.js')).db;
  const resolvedItems = await resolveCheckoutItems({ rawItems: body.items, database: activeDatabase, loadProducts });
  if (!resolvedItems.ok) return Response.json({ error: resolvedItems.error }, { status: resolvedItems.status });

  const pricing = calculateOrderPricing({
    fulfilment,
    subtotalPence: resolvedItems.subtotalPence,
    distanceMiles: deliveryValidation?.distanceMiles,
    settings,
  });
  if (!pricing.ok) return Response.json({ error: pricing.error }, { status: pricing.status });

  return Response.json({
    fulfilment,
    postcode: deliveryValidation?.postcode || null,
    deliveryDistanceMiles: deliveryValidation?.distanceMiles ?? null,
    orderSubtotalPence: pricing.subtotalPence,
    deliveryFeePence: pricing.deliveryFeePence,
    orderTotalPence: pricing.totalPence,
    deliveryPricingRule: pricing.pricingRule,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
};

export default deliveryQuoteHandler();

export const config = {
  path: '/api/delivery-quote',
};
