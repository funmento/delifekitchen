import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const COMPLETABLE_STATUSES = new Set(['paid', 'ready', 'out_for_delivery']);

const clean = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

export const createDeliveryToken = (bytes = randomBytes) => bytes(TOKEN_BYTES).toString('base64url');

export const hashDeliveryToken = token => createHash('sha256').update(token).digest('hex');

export const isValidDeliveryToken = token => TOKEN_PATTERN.test(token || '');

export const cleanDeliveryAssignment = body => ({
  deliveryAgentName: clean(body?.deliveryAgentName, 100) || null,
  deliveryAgentPhone: clean(body?.deliveryAgentPhone, 40) || null,
});

export const serializeDeliveryOrder = order => ({
  reference: order.reference,
  customerName: order.customerName,
  customerPhone: order.customerPhone,
  deliveryAddress: order.deliveryAddress,
  postcode: order.postcode,
  deliveryNotes: order.notes,
  items: order.items.map(item => ({
    name: item.name,
    quantity: item.quantity,
    lineTotal: item.lineTotal,
    customizations: item.customizations || [],
  })),
  currency: order.currency,
  totalPaid: order.orderTotalPence ?? order.amountTotal,
  status: order.status,
  deliveryAgentName: order.deliveryAgentName,
});

export const createDeliveryAgentHandler = ({ store, notifyCompleted, now = () => new Date() }) => async req => {
  const token = new URL(req.url).pathname.split('/').filter(Boolean).pop() || '';
  if (!isValidDeliveryToken(token)) {
    return Response.json({ error: 'This delivery link is invalid or no longer active.' }, { status: 404 });
  }

  const tokenHash = hashDeliveryToken(token);
  const order = await store.findByTokenHash(tokenHash);
  if (!order) return Response.json({ error: 'This delivery link is invalid or no longer active.' }, { status: 404 });
  if (order.fulfilment !== 'delivery') return Response.json({ error: 'This order is not a delivery order.' }, { status: 409 });
  if (order.status === 'cancelled') return Response.json({ error: 'Cancelled orders cannot be marked delivered.' }, { status: 409 });
  if (order.status === 'completed' || order.deliveredAt) {
    return Response.json({ error: 'This delivery has already been completed.' }, { status: 409 });
  }

  if (req.method === 'GET') {
    return Response.json({ order: serializeDeliveryOrder(order) }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  if (!COMPLETABLE_STATUSES.has(order.status)) {
    return Response.json({ error: 'This order is not ready to be marked delivered.' }, { status: 409 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const deliveryCompletionNote = clean(body.deliveryCompletionNote, 500) || null;
  const deliveredAt = now();
  const completed = await store.complete({
    order,
    tokenHash,
    deliveredAt,
    deliveryCompletionNote,
    allowedStatuses: [...COMPLETABLE_STATUSES],
  });
  if (!completed) {
    return Response.json({ error: 'This delivery has already been completed or is no longer active.' }, { status: 409 });
  }

  await notifyCompleted(completed);
  return Response.json({
    order: serializeDeliveryOrder(completed),
    deliveredAt: completed.deliveredAt?.toISOString() || deliveredAt.toISOString(),
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
};
