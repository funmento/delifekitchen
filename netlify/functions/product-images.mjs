import { getStore } from '@netlify/blobs';
import { validProductImageKey } from '../lib/product-images.mjs';

const imageHeaders = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  'Content-Type': 'image/webp',
  'X-Content-Type-Options': 'nosniff',
};

export const createProductImageHandler = ({ store } = {}) => async req => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed.', { status: 405 });
  const key = decodeURIComponent(new URL(req.url).pathname.split('/').pop() || '');
  if (!validProductImageKey(key)) return new Response('Image not found.', { status: 404 });

  const imageStore = store || getStore({ name: 'product-images', consistency: 'strong' });
  const image = await imageStore.get(key, { type: 'arrayBuffer' });
  if (!image) return new Response('Image not found.', { status: 404 });
  return new Response(req.method === 'HEAD' ? null : image, { headers: imageHeaders });
};

export default createProductImageHandler();

export const config = { path: '/api/product-images/:key' };
