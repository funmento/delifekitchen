import { and, asc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { promotions } from '../../db/schema.js';

export default async req => {
  if (req.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  const now = new Date();
  try {
    const active = await db.select({ id: promotions.id, promotionName: promotions.promotionName, promotionMessage: promotions.promotionMessage, discountCode: promotions.discountCode })
      .from(promotions)
      .where(and(
        eq(promotions.active, true),
        eq(promotions.showBanner, true),
        or(isNull(promotions.startDate), lte(promotions.startDate, now)),
        or(isNull(promotions.endDate), gt(promotions.endDate, now)),
      ))
      .orderBy(asc(promotions.endDate));
    return Response.json({ promotions: active }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('Promotion banner load failed', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ promotions: [] }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
};

export const config = { path: '/api/promotions' };
