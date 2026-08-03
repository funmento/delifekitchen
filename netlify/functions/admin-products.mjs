import { eq } from 'drizzle-orm';
import { verifyRequestOrigin } from '@netlify/identity';
import { db } from '../../db/index.js';
import { categories, productOptionGroups, productOptions, products } from '../../db/schema.js';
import { json, requireAdmin } from '../lib/admin-auth.mjs';
import { loadCatalog, makeKey, productInput } from '../lib/products.mjs';

const text = (value, length = 160) => String(value || '').trim().slice(0, length);
const integer = value => Math.round(Number(value) || 0);
const serialize = product => ({ ...product, createdAt: product.createdAt?.toISOString?.() || product.createdAt, updatedAt: product.updatedAt?.toISOString?.() || product.updatedAt });

export default async req => {
  const admin = await requireAdmin();
  if (!admin) return json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    if (req.method === 'GET') return json({ products: (await loadCatalog(db, { includeInactive: true })).map(serialize), categories: await db.select().from(categories) });
    if (!['POST', 'PUT'].includes(req.method)) return json({ error: 'Method not allowed.' }, { status: 405 });
    verifyRequestOrigin(req);
    const body = await req.json();
    const resource = body.resource;
    const isUpdate = req.method === 'PUT';
    let saved;

    if (resource === 'product') {
      const values = productInput(body);
      if (!values.name || !values.slug || values.price < 1) return json({ error: 'Name, slug and a valid price are required.' }, { status: 400 });
      [saved] = isUpdate
        ? await db.update(products).set(values).where(eq(products.id, Number(body.id))).returning()
        : await db.insert(products).values(values).returning();
    } else if (resource === 'category') {
      const values = { name: text(body.name), slug: text(body.slug || body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), description: text(body.description, 1000), active: body.active !== false, sortOrder: integer(body.sortOrder), updatedAt: new Date() };
      if (!values.name || !values.slug) return json({ error: 'Category name and slug are required.' }, { status: 400 });
      [saved] = isUpdate ? await db.update(categories).set(values).where(eq(categories.id, Number(body.id))).returning() : await db.insert(categories).values(values).returning();
    } else if (resource === 'group') {
      const minSelections = Math.max(0, integer(body.minSelections));
      const maxSelections = Math.max(minSelections, integer(body.maxSelections) || 1);
      const values = { productId: Number(body.productId), key: text(body.key) || makeKey(body.name), name: text(body.name), required: body.required === true, minSelections, maxSelections, sortOrder: integer(body.sortOrder), updatedAt: new Date() };
      if (!values.productId || !values.name) return json({ error: 'Product and option group name are required.' }, { status: 400 });
      [saved] = isUpdate ? await db.update(productOptionGroups).set(values).where(eq(productOptionGroups.id, Number(body.id))).returning() : await db.insert(productOptionGroups).values(values).returning();
    } else if (resource === 'option') {
      const values = { groupId: Number(body.groupId), key: text(body.key) || makeKey(body.name), name: text(body.name), priceAdjustment: integer(body.priceAdjustment), active: body.active !== false, sortOrder: integer(body.sortOrder), updatedAt: new Date() };
      if (!values.groupId || !values.name) return json({ error: 'Option group and option name are required.' }, { status: 400 });
      [saved] = isUpdate ? await db.update(productOptions).set(values).where(eq(productOptions.id, Number(body.id))).returning() : await db.insert(productOptions).values(values).returning();
    } else return json({ error: 'Unknown product resource.' }, { status: 400 });

    if (!saved) return json({ error: 'The item could not be found.' }, { status: 404 });
    return json({ saved });
  } catch (error) {
    console.error('Admin product update failed', error instanceof Error ? error.name : 'UnknownError');
    return json({ error: 'Product changes could not be saved. Check for duplicate slugs or option keys.' }, { status: 400 });
  }
};

export const config = { path: '/api/admin/products' };
