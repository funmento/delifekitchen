import { customizationSignature } from './catalog.mjs';
import { resolveProductCustomizations } from './product-validation.mjs';

const clean = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
const money = pence => `£${(pence / 100).toFixed(2)}`;
const milesLabel = miles => `${miles} mile${miles === 1 ? '' : 's'}`;

export const resolveCheckoutItems = async ({ rawItems, database, loadProducts }) => {
  const items = Array.isArray(rawItems) ? rawItems.slice(0, 30) : [];
  let databaseProducts;
  try {
    databaseProducts = await loadProducts(database, [...new Set(items.map(item => clean(item?.id, 80)).filter(Boolean))]);
  } catch {
    return { ok: false, status: 503, error: 'Current product prices could not be checked. Please try again.' };
  }

  const productsBySlug = new Map(databaseProducts.map(product => [product.slug, product]));
  const validatedItems = items.map(item => {
    const id = clean(item?.id, 80);
    const quantity = Number(item?.quantity);
    const submittedUnitAmount = Number(item?.unitAmount);
    const customizations = Array.isArray(item?.customizations)
      ? item.customizations.slice(0, 20).map(group => ({
        groupId: clean(group?.groupId, 80),
        selectionIds: Array.isArray(group?.selectionIds) ? group.selectionIds.slice(0, 20).map(selection => clean(selection, 80)) : [],
      }))
      : [];
    const product = productsBySlug.get(id);
    const resolved = resolveProductCustomizations(product, customizations);
    return { id, quantity, submittedUnitAmount, product, resolved };
  }).filter(item => item.product && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 20 && item.resolved.valid);

  if (!validatedItems.length || validatedItems.length !== items.length) {
    return { ok: false, status: 400, error: 'Your order contains an invalid item. Please return to the menu and try again.' };
  }
  if (validatedItems.some(item => Number.isInteger(item.submittedUnitAmount) && item.submittedUnitAmount !== item.resolved.unitAmount)) {
    return { ok: false, status: 409, error: 'A product price or option has changed. Please review your basket before payment.' };
  }

  const consolidatedItems = [...validatedItems.reduce((itemsBySignature, item) => {
    const signature = customizationSignature(item.id, item.resolved.selections);
    const existing = itemsBySignature.get(signature);
    if (existing) existing.quantity += item.quantity;
    else itemsBySignature.set(signature, { ...item, signature });
    return itemsBySignature;
  }, new Map()).values()];

  if (consolidatedItems.some(item => item.quantity > 20)) {
    return { ok: false, status: 400, error: 'An item quantity is too high. Please reduce it and try again.' };
  }

  const orderItems = consolidatedItems.map(item => ({
    id: item.id,
    name: item.product.name,
    quantity: item.quantity,
    unitAmount: item.resolved.unitAmount,
    lineTotal: item.resolved.unitAmount * item.quantity,
    customizations: item.resolved.selections,
  }));

  return {
    ok: true,
    orderItems,
    subtotalPence: orderItems.reduce((total, item) => total + item.lineTotal, 0),
  };
};

export const calculateDeliveryFeePence = (distanceMiles, settings) => {
  if (!settings.deliveryFeeEnabled) return 0;
  const distance = Number(distanceMiles);
  if (!Number.isFinite(distance) || distance < 0) throw new Error('A delivery distance is required to calculate delivery pricing.');
  const includedMiles = Math.max(0, Number(settings.includedBaseMiles) || 0);
  const additionalMiles = Math.max(0, Math.ceil(distance - includedMiles));
  return Math.max(0, Number(settings.baseDeliveryFeePence) || 0)
    + additionalMiles * Math.max(0, Number(settings.additionalMileFeePence) || 0);
};

export const deliveryPricingRule = settings => {
  if (!settings.deliveryFeeEnabled) return 'Delivery fee disabled';
  return `${money(settings.baseDeliveryFeePence)} includes ${milesLabel(settings.includedBaseMiles)}, then ${money(settings.additionalMileFeePence)} per additional mile (rounded up)`;
};

export const calculateOrderPricing = ({ fulfilment, subtotalPence, distanceMiles, settings }) => {
  const minimumOrderPence = fulfilment === 'delivery'
    ? settings.minimumDeliveryOrderPence
    : settings.minimumCollectionOrderPence;
  if (Number.isInteger(minimumOrderPence) && subtotalPence < minimumOrderPence) {
    return {
      ok: false,
      status: 409,
      error: `The minimum ${fulfilment} order is ${money(minimumOrderPence)} before delivery fees.`,
    };
  }

  if (fulfilment === 'collection') {
    return {
      ok: true,
      subtotalPence,
      deliveryFeePence: 0,
      totalPence: subtotalPence,
      pricingRule: 'Collection — no delivery fee',
    };
  }

  let deliveryFeePence = calculateDeliveryFeePence(distanceMiles, settings);
  let pricingRule = deliveryPricingRule(settings);
  if (settings.freeDeliveryEnabled
    && Number.isInteger(settings.freeDeliveryThresholdPence)
    && subtotalPence >= settings.freeDeliveryThresholdPence) {
    deliveryFeePence = 0;
    pricingRule = `Free delivery from ${money(settings.freeDeliveryThresholdPence)} item subtotal`;
  }

  return {
    ok: true,
    subtotalPence,
    deliveryFeePence,
    totalPence: subtotalPence + deliveryFeePence,
    pricingRule,
  };
};
