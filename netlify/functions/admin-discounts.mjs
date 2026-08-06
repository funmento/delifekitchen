import { and, count, desc, eq, sql } from 'drizzle-orm';
import { verifyRequestOrigin } from '@netlify/identity';
import { db } from '../../db/index.js';
import { categories, orders, products, promotionUsage, promotions } from '../../db/schema.js';
import { json, requireAdmin } from '../lib/admin-auth.mjs';
import { normalizeDiscountCode, promotionStatus } from '../lib/promotions.mjs';

const text = (value, max = 500) => String(value || '').trim().slice(0, max);
const optionalPositive = value => Number(value) > 0 ? Math.round(Number(value)) : null;
const pence = value => Number(value) > 0 ? Math.round(Number(value) * 100) : null;
const date = value => value ? new Date(value) : null;
const list = value => Array.isArray(value) ? value : [];
const serialize = row => ({ ...row, status: promotionStatus(row), startDate: row.startDate?.toISOString?.() || row.startDate, endDate: row.endDate?.toISOString?.() || row.endDate, createdAt: row.createdAt?.toISOString?.() || row.createdAt, updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt });

const input = body => ({
  promotionName: text(body.promotionName, 160),
  promotionMessage: text(body.promotionMessage, 500),
  discountCode: normalizeDiscountCode(body.discountCode),
  discountType: ['percentage', 'fixed_amount', 'free_delivery'].includes(body.discountType) ? body.discountType : 'percentage',
  discountValue: body.discountType === 'fixed_amount' ? Math.round(Number(body.discountValue || 0) * 100) : body.discountType === 'free_delivery' ? 0 : Math.round(Number(body.discountValue || 0)),
  active: body.active === true,
  startDate: date(body.startDate),
  endDate: date(body.endDate),
  maximumUses: optionalPositive(body.maximumUses),
  maximumUsesPerCustomer: optionalPositive(body.maximumUsesPerCustomer),
  minimumOrderValuePence: pence(body.minimumOrderValue),
  appliesTo: ['entire_order', 'food_only', 'delivery_fee_only', 'specific_categories', 'specific_products'].includes(body.appliesTo) ? body.appliesTo : 'entire_order',
  categoryIds: list(body.categoryIds).map(Number).filter(Number.isInteger),
  productIds: list(body.productIds).map(value => text(value, 80)).filter(Boolean),
  showBanner: body.showBanner === true,
  updatedAt: new Date(),
});

const report = async () => {
  const rows = await db.select({
    promotion: promotions,
    uses: sql`count(${promotionUsage.id}) filter (where ${promotionUsage.status} = 'used')`,
    revenueGenerated: sql`coalesce(sum(case when ${promotionUsage.status} = 'used' then ${orders.amountTotal} else 0 end), 0)`,
    totalDiscountGiven: sql`coalesce(sum(case when ${promotionUsage.status} = 'used' then ${promotionUsage.amountDiscountedPence} else 0 end), 0)`,
  }).from(promotions)
    .leftJoin(promotionUsage, eq(promotionUsage.promotionId, promotions.id))
    .leftJoin(orders, eq(orders.id, promotionUsage.orderId))
    .groupBy(promotions.id)
    .orderBy(desc(promotions.createdAt));
  return rows.map(row => ({ ...serialize(row.promotion), uses: Number(row.uses), revenueGenerated: Number(row.revenueGenerated), totalDiscountGiven: Number(row.totalDiscountGiven) }));
};

export default async req => {
  const admin = await requireAdmin();
  if (!admin) return json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    if (req.method === 'GET') {
      const [promotionRows, categoryRows, productRows] = await Promise.all([report(), db.select().from(categories), db.select({ id: products.slug, name: products.name, categoryId: products.categoryId }).from(products)]);
      const totalDiscount = promotionRows.reduce((sum, item) => sum + item.totalDiscountGiven, 0);
      const mostUsed = [...promotionRows].sort((a, b) => b.uses - a.uses)[0] || null;
      return json({ promotions: promotionRows, categories: categoryRows, products: productRows, summary: { totalDiscount, mostUsed: mostUsed?.uses ? mostUsed.promotionName : null, active: promotionRows.filter(item => item.status === 'active').length, expired: promotionRows.filter(item => item.status === 'expired').length } });
    }
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return json({ error: 'Method not allowed.' }, { status: 405 });
    verifyRequestOrigin(req);
    const body = await req.json();
    if (req.method === 'DELETE') {
      const id = Number(body.id);
      const [usage] = await db.select({ value: count() }).from(promotionUsage).where(eq(promotionUsage.promotionId, id));
      if (Number(usage?.value || 0) > 0) return json({ error: 'Promotions with order history cannot be deleted. Disable it instead.' }, { status: 409 });
      const [deleted] = await db.delete(promotions).where(eq(promotions.id, id)).returning();
      return deleted ? json({ deleted: true }) : json({ error: 'Promotion not found.' }, { status: 404 });
    }
    if (body.action === 'duplicate') {
      const [source] = await db.select().from(promotions).where(eq(promotions.id, Number(body.id))).limit(1);
      if (!source) return json({ error: 'Promotion not found.' }, { status: 404 });
      const [saved] = await db.insert(promotions).values({ ...source, id: undefined, promotionName: `${source.promotionName} Copy`, discountCode: `${source.discountCode}-COPY-${Date.now().toString().slice(-4)}`, active: false, createdAt: new Date(), updatedAt: new Date() }).returning();
      return json({ saved: serialize(saved) });
    }
    const values = input(body);
    if (!values.promotionName || !values.promotionMessage || !values.discountCode) return json({ error: 'Promotion name, message and code are required.' }, { status: 400 });
    if (values.startDate && values.endDate && values.endDate <= values.startDate) return json({ error: 'End date must be after the start date.' }, { status: 400 });
    if (values.discountType !== 'free_delivery' && values.discountValue < 1) return json({ error: 'Enter a valid discount value.' }, { status: 400 });
    const [saved] = req.method === 'PUT'
      ? await db.update(promotions).set(values).where(eq(promotions.id, Number(body.id))).returning()
      : await db.insert(promotions).values(values).returning();
    return saved ? json({ saved: serialize(saved) }) : json({ error: 'Promotion not found.' }, { status: 404 });
  } catch (error) {
    console.error('Admin promotion request failed', error instanceof Error ? error.name : 'UnknownError');
    return json({ error: 'Promotion changes could not be saved. Check that the discount code is unique.' }, { status: 400 });
  }
};

export const config = { path: '/api/admin/discounts' };
