import { and, count, desc, eq, gte, ilike, inArray, lte, or } from 'drizzle-orm';
import { verifyRequestOrigin } from '@netlify/identity';
import { orderEmailDeliveries, orders } from '../../db/schema.js';
import { requireAdmin, json } from '../lib/admin-auth.mjs';
import { sendCustomerStatusNotification } from '../lib/order-notifications.mjs';

const PAGE_SIZE = 20;
const ORDER_STATUSES = ['pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled'];
const NOTIFIABLE_STATUSES = new Set(['paid', 'preparing', 'ready', 'completed', 'cancelled']);
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

const parseTimestamp = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const serializeDelivery = delivery => ({
  kind: delivery.kind,
  status: delivery.statusKey,
  state: delivery.state,
  sentAt: delivery.sentAt?.toISOString() || null,
  attemptedAt: delivery.attemptedAt?.toISOString() || null,
});

const serializeOrder = (order, deliveries = []) => ({
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
  deliveryValidationResult: order.deliveryValidationResult,
  deliveryDistanceMiles: order.deliveryDistanceMiles,
  deliveryRestrictionMode: order.deliveryRestrictionMode,
  deliveryFeePence: order.deliveryFeePence,
  deliveryPricingRule: order.deliveryPricingRule,
  orderSubtotalPence: order.orderSubtotalPence,
  orderTotalPence: order.orderTotalPence,
  notes: order.notes,
  currency: order.currency,
  amountTotal: order.amountTotal,
  items: order.items,
  estimatedPrepMinutes: order.estimatedPrepMinutes,
  paidAt: order.paidAt?.toISOString() || null,
  customerEmailSentAt: order.customerEmailSentAt?.toISOString() || null,
  merchantEmailSentAt: order.merchantEmailSentAt?.toISOString() || null,
  emailDeliveries: deliveries.map(serializeDelivery),
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString(),
  allowedStatuses: transitions[order.status] || [],
});

const deliveryMapFor = deliveries => deliveries.reduce((map, delivery) => {
  const list = map.get(delivery.orderId) || [];
  list.push(delivery);
  map.set(delivery.orderId, list);
  return map;
}, new Map());

const loadDeliveries = async (db, orderIds) => orderIds.length
  ? db.select().from(orderEmailDeliveries).where(inArray(orderEmailDeliveries.orderId, orderIds))
  : [];

const listOrders = async (req, db) => {
  const url = new URL(req.url);
  const page = Math.max(1, Math.min(5000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const status = url.searchParams.get('status') || '';
  const search = (url.searchParams.get('search') || '').trim().slice(0, 100);
  const from = parseDate(url.searchParams.get('from'));
  const to = parseDate(url.searchParams.get('to'), true);
  const paidAfter = parseTimestamp(url.searchParams.get('paidAfter'));
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
  if (paidAfter) filters.push(gte(orders.paidAt, paidAfter));

  const where = filters.length ? and(...filters) : undefined;
  const [rows, totalRows] = await Promise.all([
    db.select().from(orders).where(where).orderBy(desc(paidAfter ? orders.paidAt : orders.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(orders).where(where),
  ]);
  const deliveries = await loadDeliveries(db, rows.map(order => order.id));
  const deliveriesByOrder = deliveryMapFor(deliveries);
  const total = Number(totalRows[0]?.value || 0);

  return json({
    orders: rows.map(order => serializeOrder(order, deliveriesByOrder.get(order.id) || [])),
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    },
    statuses: ORDER_STATUSES,
  });
};

const updateOrder = async (req, context, db) => {
  verifyRequestOrigin(req);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid update request.' }, { status: 400 });
  }

  const id = Number.parseInt(String(body.id || ''), 10);
  const hasStatus = body.status !== undefined;
  const status = hasStatus ? String(body.status || '') : null;
  const hasPrepTime = body.estimatedPrepMinutes !== undefined;
  const estimatedPrepMinutes = body.estimatedPrepMinutes === null || body.estimatedPrepMinutes === ''
    ? null
    : Number.parseInt(String(body.estimatedPrepMinutes), 10);
  const sendCustomerUpdate = body.sendCustomerUpdate === true;
  const notifyCustomer = body.notifyCustomer === true;

  if (!Number.isSafeInteger(id) || id < 1 || (hasStatus && !ORDER_STATUSES.includes(status))) {
    return json({ error: 'Invalid order update.' }, { status: 400 });
  }
  if (hasPrepTime && estimatedPrepMinutes !== null && (!Number.isSafeInteger(estimatedPrepMinutes) || estimatedPrepMinutes < 5 || estimatedPrepMinutes > 180)) {
    return json({ error: 'Preparation time must be between 5 and 180 minutes.' }, { status: 400 });
  }
  if (!hasStatus && !hasPrepTime && !sendCustomerUpdate) {
    return json({ error: 'Choose an order change.' }, { status: 400 });
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return json({ error: 'Order not found.' }, { status: 404 });

  const statusChanged = hasStatus && order.status !== status;
  if (statusChanged && !(transitions[order.status] || []).includes(status)) {
    return json({ error: `Orders cannot move from ${order.status} to ${status}.` }, { status: 409 });
  }

  const changes = { updatedAt: new Date() };
  if (statusChanged) changes.status = status;
  if (hasPrepTime) changes.estimatedPrepMinutes = estimatedPrepMinutes;

  let updated = order;
  if (statusChanged || hasPrepTime) {
    const where = statusChanged
      ? and(eq(orders.id, id), eq(orders.status, order.status))
      : eq(orders.id, id);
    [updated] = await db.update(orders).set(changes).where(where).returning();
    if (!updated) return json({ error: 'The order changed. Refresh and try again.' }, { status: 409 });
  }

  const notificationStatus = updated.status;
  const shouldNotify = (statusChanged && notifyCustomer) || sendCustomerUpdate;
  if (shouldNotify) {
    if (!NOTIFIABLE_STATUSES.has(notificationStatus)) {
      return json({ error: 'Customer updates are available after payment.' }, { status: 409 });
    }
    const notification = sendCustomerStatusNotification(updated, notificationStatus, db).catch(error => {
      console.error('Customer status notification task failed', error instanceof Error ? error.message : 'UnknownError');
    });
    if (context?.waitUntil) context.waitUntil(notification);
    else await notification;
  }

  const deliveries = await loadDeliveries(db, [updated.id]);
  return json({ order: serializeOrder(updated, deliveries), notificationQueued: shouldNotify });
};

export default async (req, context) => {
  const admin = await requireAdmin(req);
  if (!admin) return json({ error: 'Unauthorized.' }, { status: 401 });

  const { db } = await import('../../db/index.js');
  if (req.method === 'GET') return listOrders(req, db);
  if (req.method === 'PATCH') return updateOrder(req, context, db);
  return json({ error: 'Method not allowed.' }, { status: 405 });
};

export const config = {
  path: '/api/admin/orders',
};
