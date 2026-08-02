import { and, count, desc, eq, gte, ilike, lte, or } from 'drizzle-orm';
import { verifyRequestOrigin } from '@netlify/identity';
import { orders } from '../../db/schema.js';
import { requireAdmin, json } from '../lib/admin-auth.mjs';

const PAGE_SIZE = 20;
const ORDER_STATUSES = ['pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled'];
const transitions = {
  pending: ['cancelled'],
  paid: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const parseDate = (value, endOfDay = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const serializeOrder = order => ({
  id: order.id,
  reference: order.reference,
  status: order.status,
  customer: {
    name: order.customerName,
    email: order.customerEmail,
    phone: order.customerPhone,
  },
  fulfilment: order.fulfilment,
  deliveryAddress: order.deliveryAddress,
  postcode: order.postcode,
  notes: order.notes,
  currency: order.currency,
  amountTotal: order.amountTotal,
  items: order.items,
  paidAt: order.paidAt?.toISOString() || null,
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString(),
  allowedStatuses: transitions[order.status] || [],
});

const listOrders = async (req, db) => {
  const url = new URL(req.url);
  const page = Math.max(1, Math.min(5000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const status = url.searchParams.get('status') || '';
  const search = (url.searchParams.get('search') || '').trim().slice(0, 100);
  const from = parseDate(url.searchParams.get('from'));
  const to = parseDate(url.searchParams.get('to'), true);
  const filters = [];

  if (ORDER_STATUSES.includes(status)) filters.push(eq(orders.status, status));
  if (search) {
    const term = `%${search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    filters.push(or(
      ilike(orders.reference, term),
      ilike(orders.customerName, term),
      ilike(orders.customerEmail, term),
      ilike(orders.customerPhone, term),
    ));
  }
  if (from) filters.push(gte(orders.createdAt, from));
  if (to) filters.push(lte(orders.createdAt, to));

  const where = filters.length ? and(...filters) : undefined;
  const [rows, totalRows] = await Promise.all([
    db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(orders).where(where),
  ]);
  const total = Number(totalRows[0]?.value || 0);

  return json({
    orders: rows.map(serializeOrder),
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    },
    statuses: ORDER_STATUSES,
  });
};

const updateOrder = async (req, db) => {
  verifyRequestOrigin(req);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid update request.' }, { status: 400 });
  }

  const id = Number.parseInt(String(body.id || ''), 10);
  const status = String(body.status || '');
  if (!Number.isSafeInteger(id) || id < 1 || !ORDER_STATUSES.includes(status)) {
    return json({ error: 'Invalid order update.' }, { status: 400 });
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return json({ error: 'Order not found.' }, { status: 404 });
  if (order.status === status) return json({ order: serializeOrder(order) });
  if (!(transitions[order.status] || []).includes(status)) {
    return json({ error: `Orders cannot move from ${order.status} to ${status}.` }, { status: 409 });
  }

  const [updated] = await db.update(orders).set({ status, updatedAt: new Date() })
    .where(and(eq(orders.id, id), eq(orders.status, order.status)))
    .returning();

  if (!updated) return json({ error: 'The order changed. Refresh and try again.' }, { status: 409 });
  return json({ order: serializeOrder(updated) });
};

export default async req => {
  const admin = await requireAdmin();
  if (!admin) return json({ error: 'Unauthorized.' }, { status: 401 });
  const { db } = await import('../../db/index.js');

  if (req.method === 'GET') return listOrders(req, db);
  if (req.method === 'PATCH') return updateOrder(req, db);
  return json({ error: 'Method not allowed.' }, { status: 405 });
};

export const config = {
  path: '/api/admin/orders',
};
