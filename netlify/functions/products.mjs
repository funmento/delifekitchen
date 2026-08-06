import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { products } from '../../db/schema.js';
import { loadCatalog } from '../lib/products.mjs';

const publicProduct = product => ({
  id: product.slug,
  slug: product.slug,
  name: product.name,
  shortDescription: product.shortDescription,
  fullDescription: product.fullDescription,
  price: product.price,
  unitAmount: product.price,
  imageUrl: product.imageUrl,
  imageFocalX: product.imageFocalX,
  imageFocalY: product.imageFocalY,
  soldOut: product.soldOut,
  featured: product.featured,
  sortOrder: product.sortOrder,
  category: product.category ? { id: product.category.id, name: product.category.name, slug: product.category.slug, sortOrder: product.category.sortOrder } : null,
  optionGroups: product.optionGroups,
});

export default async req => {
  if (req.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  try {
    const slug = new URL(req.url).searchParams.get('slug')?.trim();
    const catalog = await loadCatalog(db, { slugs: slug ? [slug] : null });
    if (slug) {
      const product = catalog[0];
      if (!product) {
        const exists = await db.select({ active: products.active }).from(products).where(eq(products.slug, slug)).limit(1);
        return Response.json({ error: exists.length ? 'This product is currently unavailable.' : 'Product not found.' }, { status: exists.length ? 410 : 404 });
      }
      return Response.json({ product: publicProduct(product) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ products: catalog.map(publicProduct) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Product catalog load failed', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: 'The menu could not be loaded.' }, { status: 503 });
  }
};

export const config = { path: '/api/products' };
