import { db } from '../../db/index.js';
import { promotionUsage, promotions } from '../../db/schema.js';
import { getDeliverySettings } from '../lib/delivery-settings.mjs';
import { validateDeliveryPostcode, validateFulfilmentAvailability } from '../lib/delivery-rules.mjs';
import { calculateOrderPricing, resolveCheckoutItems } from '../lib/order-pricing.mjs';
import { loadCatalog } from '../lib/products.mjs';
import { validatePromotionForCheckout } from '../lib/promotions.mjs';

export default async req => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid discount request.' }, { status: 400 }); }
  const fulfilment = body.fulfilment === 'delivery' ? 'delivery' : 'collection';
  const settings = await getDeliverySettings(db);
  const availability = validateFulfilmentAvailability(fulfilment, settings);
  if (!availability.allowed) return Response.json({ error: availability.message }, { status: 409 });
  let deliveryValidation = null;
  if (fulfilment === 'delivery') {
    deliveryValidation = await validateDeliveryPostcode(String(body.postcode || '').trim(), settings);
    if (!deliveryValidation.allowed) return Response.json({ error: deliveryValidation.message }, { status: 400 });
  }
  const resolved = await resolveCheckoutItems({ rawItems: body.items, database: db, loadProducts: (database, slugs) => loadCatalog(database, { slugs }) });
  if (!resolved.ok) return Response.json({ error: resolved.error }, { status: resolved.status });
  const pricing = calculateOrderPricing({ fulfilment, subtotalPence: resolved.subtotalPence, distanceMiles: deliveryValidation?.distanceMiles, settings });
  if (!pricing.ok) return Response.json({ error: pricing.error }, { status: pricing.status });
  const result = await validatePromotionForCheckout({
    database: db,
    promotionsTable: promotions,
    usageTable: promotionUsage,
    code: body.discountCode,
    items: resolved.orderItems,
    subtotalPence: pricing.subtotalPence,
    deliveryFeePence: pricing.deliveryFeePence,
    customerEmail: String(body.customerEmail || '').trim().toLowerCase(),
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({
    promotionName: result.promotion.promotionName,
    discountCode: result.promotion.discountCode,
    discountAmountPence: result.discountAmountPence,
    subtotalPence: pricing.subtotalPence,
    deliveryFeePence: pricing.deliveryFeePence,
    totalPence: result.totalAfterDiscountPence,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
};

export const config = { path: '/api/promotions/validate' };
