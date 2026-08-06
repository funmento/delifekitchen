import { and, asc, count, gte, isNotNull, lte, sql, sum } from 'drizzle-orm';
import { orders } from '../../db/schema.js';
import { requireAdmin, json } from '../lib/admin-auth.mjs';

const parseDate = (value, endOfDay = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export default async req => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed.' }, { status: 405 });

  const admin = await requireAdmin();
  if (!admin) return json({ error: 'Unauthorized.' }, { status: 401 });
  const { db } = await import('../../db/index.js');

  const url = new URL(req.url);
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  defaultFrom.setUTCHours(0, 0, 0, 0);
  const from = parseDate(url.searchParams.get('from')) || defaultFrom;
  const to = parseDate(url.searchParams.get('to'), true) || today;

  if (from > to || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    return json({ error: 'Choose a valid range of up to 366 days.' }, { status: 400 });
  }

  const paidFilter = and(isNotNull(orders.paidAt), gte(orders.paidAt, from), lte(orders.paidAt, to));
  const legacyTotal = sql`coalesce(${orders.orderTotalPence}, ${orders.amountTotal})`;
  const paidTotal = sql`coalesce(${orders.totalAfterDiscountPence}, ${legacyTotal})`;
  const [summaryRows, fulfilmentRows, dailyRows, statusRows] = await Promise.all([
    db.select({
      orderCount: count(),
      revenue: sum(paidTotal),
      foodRevenue: sum(sql`coalesce(${orders.orderSubtotalPence}, ${orders.amountTotal} - coalesce(${orders.deliveryFeePence}, 0))`),
      deliveryFeeRevenue: sum(sql`coalesce(${orders.deliveryFeePence}, 0)`),
    }).from(orders).where(paidFilter),
    db.select({ fulfilment: orders.fulfilment, orderCount: count(), revenue: sum(paidTotal) })
      .from(orders).where(paidFilter).groupBy(orders.fulfilment),
    db.select({
      day: sql`to_char(date_trunc('day', ${orders.paidAt}), 'YYYY-MM-DD')`,
      orderCount: count(),
      revenue: sum(paidTotal),
    }).from(orders).where(paidFilter).groupBy(sql`date_trunc('day', ${orders.paidAt})`)
      .orderBy(asc(sql`date_trunc('day', ${orders.paidAt})`)),
    db.select({ status: orders.status, orderCount: count() }).from(orders).groupBy(orders.status),
  ]);

  const orderCount = Number(summaryRows[0]?.orderCount || 0);
  const revenue = Number(summaryRows[0]?.revenue || 0);
  const foodRevenue = Number(summaryRows[0]?.foodRevenue || 0);
  const deliveryFeeRevenue = Number(summaryRows[0]?.deliveryFeeRevenue || 0);

  return json({
    range: { from: from.toISOString(), to: to.toISOString() },
    currency: 'gbp',
    summary: {
      orderCount,
      revenue,
      totalRevenue: revenue,
      foodRevenue,
      deliveryFeeRevenue,
      averageOrder: orderCount ? Math.round(revenue / orderCount) : 0,
    },
    fulfilment: fulfilmentRows.map(row => ({
      type: row.fulfilment,
      orderCount: Number(row.orderCount || 0),
      revenue: Number(row.revenue || 0),
    })),
    daily: dailyRows.map(row => ({
      date: String(row.day),
      orderCount: Number(row.orderCount || 0),
      revenue: Number(row.revenue || 0),
    })),
    statuses: statusRows.map(row => ({ status: row.status, orderCount: Number(row.orderCount || 0) })),
  });
};

export const config = {
  path: '/api/admin/sales-report',
};
