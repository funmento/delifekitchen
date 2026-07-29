import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { orders } from '../../db/schema.js';

export default async req => {
  if (req.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405 });

  const sessionId = new URL(req.url).searchParams.get('session_id') || '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return Response.json({ error: 'A valid checkout session is required.' }, { status: 400 });
  }

  const [order] = await db.select({
    reference: orders.reference,
    status: orders.status,
  }).from(orders).where(eq(orders.stripeSessionId, sessionId)).limit(1);

  if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 });
  return Response.json(order);
};

export const config = {
  path: '/api/order-status',
};
