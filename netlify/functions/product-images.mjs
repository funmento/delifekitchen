import { getStore } from '@netlify/blobs';
import { validProductImageKey } from '../lib/product-images.mjs';

const imageHeaders = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  'CDN-Cache-Control': 'public, max-age=31536000, immutable',
  'Content-Type': 'image/webp',
  'Netlify-CDN-Cache-Control': 'public, durable, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
};

const duration = milliseconds => Math.max(0, milliseconds).toFixed(1);

export const createProductImageHandler = ({ store, now = () => performance.now() } = {}) => async req => {
  const handlerStarted = now();
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed.', { status: 405 });
  const key = decodeURIComponent(new URL(req.url).pathname.split('/').pop() || '');
  if (!validProductImageKey(key)) return new Response('Image not found.', { status: 404 });

  const imageStore = store || getStore({ name: 'product-images', consistency: 'strong' });
  const blobStarted = now();
  const image = req.method === 'HEAD' && typeof imageStore.getMetadata === 'function'
    ? await imageStore.getMetadata(key)
    : await imageStore.get(key, { type: 'stream' });
  const blobFinished = now();
  if (!image) return new Response('Image not found.', { status: 404 });

  return new Response(req.method === 'HEAD' ? null : image, {
    headers: {
      ...imageHeaders,
      'Server-Timing': `blob;dur=${duration(blobFinished - blobStarted)}, handler;dur=${duration(blobFinished - handlerStarted)}`,
    },
  });
};

export default createProductImageHandler();

export const config = { path: '/api/product-images/:key' };
