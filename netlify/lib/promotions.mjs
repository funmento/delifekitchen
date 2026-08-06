import { and, count, eq, gt, or } from 'drizzle-orm';

const codeValue = value => typeof value === 'string' ? value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40) : '';
const positiveInteger = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const dateValue = value => value ? new Date(value) : null;

export const promotionStatus = (promotion, now = new Date()) => {
  if (!promotion.active) return 'disabled';
  const starts = dateValue(promotion.startDate);
  const ends = dateValue(promotion.endDate);
  if (starts && starts > now) return 'scheduled';
  if (ends && ends < now) return 'expired';
  return 'active';
};

export const applicableFoodAmount = (promotion, items) => {
  if (promotion.appliesTo === 'specific_products') {
    const ids = new Set(Array.isArray(promotion.productIds) ? promotion.productIds.map(String) : []);
    return items.filter(item => ids.has(String(item.id))).reduce((sum, item) => sum + item.lineTotal, 0);
  }
  if (promotion.appliesTo === 'specific_categories') {
    const ids = new Set(Array.isArray(promotion.categoryIds) ? promotion.categoryIds.map(Number) : []);
    return items.filter(item => ids.has(Number(item.categoryId))).reduce((sum, item) => sum + item.lineTotal, 0);
  }
  return items.reduce((sum, item) => sum + item.lineTotal, 0);
};

export const evaluatePromotion = ({ promotion, items, subtotalPence, deliveryFeePence, customerEmail = '', usageCount = 0, customerUsageCount = 0, now = new Date() }) => {
  if (!promotion) return { ok: false, status: 404, error: 'Discount code not found.' };
  const status = promotionStatus(promotion, now);
  if (status === 'disabled') return { ok: false, status: 409, error: 'This discount code is disabled.' };
  if (status === 'scheduled') return { ok: false, status: 409, error: 'This discount code is not active yet.' };
  if (status === 'expired') return { ok: false, status: 409, error: 'This discount code has expired.' };
  if (positiveInteger(promotion.maximumUses) && usageCount >= promotion.maximumUses) return { ok: false, status: 409, error: 'This discount code has reached its usage limit.' };
  if (customerEmail && positiveInteger(promotion.maximumUsesPerCustomer) && customerUsageCount >= promotion.maximumUsesPerCustomer) {
    return { ok: false, status: 409, error: 'You have already used this discount code the maximum number of times.' };
  }
  if (positiveInteger(promotion.minimumOrderValuePence) && subtotalPence < promotion.minimumOrderValuePence) {
    return { ok: false, status: 409, error: `This code requires an item subtotal of at least £${(promotion.minimumOrderValuePence / 100).toFixed(2)}.` };
  }

  const foodAmount = applicableFoodAmount(promotion, items);
  let applicableAmount = subtotalPence + deliveryFeePence;
  if (promotion.appliesTo === 'food_only' || promotion.appliesTo === 'specific_categories' || promotion.appliesTo === 'specific_products') applicableAmount = foodAmount;
  if (promotion.appliesTo === 'delivery_fee_only') applicableAmount = deliveryFeePence;

  let discountAmountPence = 0;
  if (promotion.discountType === 'percentage') discountAmountPence = Math.floor(applicableAmount * Math.min(100, Math.max(0, promotion.discountValue)) / 100);
  if (promotion.discountType === 'fixed_amount') discountAmountPence = Math.min(applicableAmount, Math.max(0, promotion.discountValue));
  if (promotion.discountType === 'free_delivery') discountAmountPence = Math.max(0, deliveryFeePence);
  discountAmountPence = Math.min(subtotalPence + deliveryFeePence, discountAmountPence);

  if (discountAmountPence < 1) return { ok: false, status: 409, error: 'This discount does not apply to the current order.' };

  return {
    ok: true,
    promotion,
    discountAmountPence,
    subtotalBeforeDiscountPence: subtotalPence,
    totalAfterDiscountPence: subtotalPence + deliveryFeePence - discountAmountPence,
  };
};

export const validatePromotionForCheckout = async ({ database, promotionsTable, usageTable, code, items, subtotalPence, deliveryFeePence, customerEmail, now = new Date() }) => {
  const normalizedCode = codeValue(code);
  if (!normalizedCode) return { ok: false, status: 400, error: 'Enter a discount code.' };
  const [promotion] = await database.select().from(promotionsTable).where(eq(promotionsTable.discountCode, normalizedCode)).limit(1);
  if (!promotion) return evaluatePromotion({ promotion: null, items, subtotalPence, deliveryFeePence, customerEmail, now });
  const activeUsage = or(eq(usageTable.status, 'used'), and(eq(usageTable.status, 'reserved'), gt(usageTable.reservedUntil, now)));
  const [[total], [customer]] = await Promise.all([
    database.select({ value: count() }).from(usageTable).where(and(eq(usageTable.promotionId, promotion.id), activeUsage)),
    customerEmail
      ? database.select({ value: count() }).from(usageTable).where(and(eq(usageTable.promotionId, promotion.id), eq(usageTable.customerEmail, customerEmail.toLowerCase()), activeUsage))
      : Promise.resolve([{ value: 0 }]),
  ]);
  return evaluatePromotion({ promotion, items, subtotalPence, deliveryFeePence, customerEmail, usageCount: Number(total?.value || 0), customerUsageCount: Number(customer?.value || 0), now });
};

export const reservePromotionUsage = async ({ database, usageTable, promotionId, orderId, customerEmail, amountDiscountedPence, now = new Date() }) => {
  const reservedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  await database.insert(usageTable).values({ promotionId, orderId, customerEmail: customerEmail.toLowerCase(), amountDiscountedPence, status: 'reserved', reservedUntil });
};

export const normalizeDiscountCode = codeValue;
