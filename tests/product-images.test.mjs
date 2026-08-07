import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';
import { createProductImageUploadHandler } from '../netlify/functions/admin-product-images.mjs';
import { createProductImageHandler } from '../netlify/functions/product-images.mjs';
import { PRODUCT_IMAGE_MAX_BYTES, processProductImage } from '../netlify/lib/product-images.mjs';
import { productInput } from '../netlify/lib/product-validation.mjs';

const imageFile = async (name = 'dish.jpg') => new File([
  await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#a54f2a' } }).jpeg({ quality: 92 }).toBuffer(),
], name, { type: 'image/jpeg' });

const uploadRequest = (file, slug = 'Jollof Rice') => {
  const form = new FormData();
  form.set('image', file);
  form.set('slug', slug);
  return new Request('https://example.test/api/admin/product-images', { method: 'POST', body: form });
};

const memoryStore = () => {
  const values = new Map();
  return {
    values,
    set: async (key, value) => values.set(key, value),
    get: async key => values.get(key) || null,
  };
};

test('authenticated admins can upload an optimized product image', async () => {
  const store = memoryStore();
  const handler = createProductImageUploadHandler({
    authenticate: async () => ({ id: 'admin-1' }),
    verifyOrigin: () => {},
    store,
    createId: () => 'image-1',
  });
  const response = await handler(uploadRequest(await imageFile()));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.imageUrl, '/api/product-images/jollof-rice-image-1.webp');
  assert.ok(body.width <= 1200);
  assert.ok(body.height <= 900);
  const uploaded = store.values.get('jollof-rice-image-1.webp');
  assert.ok(uploaded instanceof ArrayBuffer);
  const metadata = await sharp(Buffer.from(uploaded)).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 900);
});

test('uploaded product images preserve their original aspect ratio', async () => {
  const source = await sharp({
    create: { width: 800, height: 1200, channels: 3, background: '#8f3f24' },
  }).jpeg({ quality: 92 }).toBuffer();
  const processed = await processProductImage(new File([source], 'portrait.jpg', { type: 'image/jpeg' }));
  const metadata = await sharp(Buffer.from(processed.data)).metadata();

  assert.equal(metadata.width, 600);
  assert.equal(metadata.height, 900);
  assert.equal(metadata.width / metadata.height, 800 / 1200);
});

test('invalid product image types are rejected server-side', async () => {
  const handler = createProductImageUploadHandler({ authenticate: async () => ({ id: 'admin-1' }), verifyOrigin: () => {}, store: memoryStore() });
  const response = await handler(uploadRequest(new File(['not an image'], 'dish.txt', { type: 'text/plain' })));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /JPG, JPEG, PNG and WebP/);
});

test('files with misleading image types are rejected server-side', async () => {
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ffffff' } }).png().toBuffer();
  await assert.rejects(() => processProductImage(new File([png], 'dish.jpg', { type: 'image/jpeg' })), /do not match/);
});

test('product images larger than 5MB are rejected server-side', async () => {
  const file = new File([new Uint8Array(PRODUCT_IMAGE_MAX_BYTES + 1)], 'large.png', { type: 'image/png' });
  await assert.rejects(() => processProductImage(file), error => error.status === 413 && /5MB/.test(error.message));
});

test('replacing an image generates a new stable URL', async () => {
  const store = memoryStore();
  const ids = ['first', 'replacement'];
  const handler = createProductImageUploadHandler({ authenticate: async () => ({ id: 'admin-1' }), verifyOrigin: () => {}, store, createId: () => ids.shift() });
  const first = await (await handler(uploadRequest(await imageFile('first.jpg')))).json();
  const replacement = await (await handler(uploadRequest(await imageFile('replacement.jpg')))).json();

  assert.notEqual(first.imageUrl, replacement.imageUrl);
  assert.equal(store.values.size, 2);
  assert.match(replacement.imageUrl, /replacement\.webp$/);
});

test('uploaded images render through the public product image endpoint', async () => {
  const optimized = await processProductImage(await imageFile());
  const store = memoryStore();
  let getOptions;
  const get = store.get;
  store.get = async (key, options) => {
    getOptions = options;
    return get(key);
  };
  await store.set('jollof-rice-public.webp', optimized.data);
  const times = [10, 12, 18];
  const handler = createProductImageHandler({ store, now: () => times.shift() });
  const response = await handler(new Request('https://example.test/api/product-images/jollof-rice-public.webp'));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/webp');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal(response.headers.get('CDN-Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal(response.headers.get('Netlify-CDN-Cache-Control'), 'public, durable, max-age=31536000, immutable');
  assert.equal(response.headers.get('Server-Timing'), 'blob;dur=6.0, handler;dur=8.0');
  assert.deepEqual(getOptions, { type: 'stream' });
  assert.ok((await response.arrayBuffer()).byteLength > 0);
});

test('HEAD image requests avoid downloading the Blob body', async () => {
  let bodyReads = 0;
  let metadataReads = 0;
  const handler = createProductImageHandler({
    store: {
      get: async () => {
        bodyReads += 1;
        return new ArrayBuffer(1);
      },
      getMetadata: async () => {
        metadataReads += 1;
        return { metadata: {} };
      },
    },
  });
  const response = await handler(new Request('https://example.test/api/product-images/jollof-rice-public.webp', { method: 'HEAD' }));

  assert.equal(response.status, 200);
  assert.equal(bodyReads, 0);
  assert.equal(metadataReads, 1);
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('product pages retain uploaded and manually entered image URLs', async () => {
  const uploadedUrl = '/api/product-images/jollof-rice-public.webp';
  assert.equal(productInput({ name: 'Jollof Rice', price: 1500, imageUrl: uploadedUrl }).imageUrl, uploadedUrl);
  assert.equal(productInput({ name: 'Jollof Rice', price: 1500, imageUrl: '/assets/jollof-rice.jpeg' }).imageUrl, '/assets/jollof-rice.jpeg');

  const menuSource = await readFile(new URL('../menu-products.js', import.meta.url), 'utf8');
  const productSource = await readFile(new URL('../product-options.js', import.meta.url), 'utf8');
  const adminSource = await readFile(new URL('../admin/products.js', import.meta.url), 'utf8');
  assert.match(menuSource, /product\.imageUrl/);
  assert.match(productSource, /image\.src = product\.imageUrl/);
  assert.match(adminSource, /elements\.imageUrl\.value = uploaded\.imageUrl/);
});

test('product image containers enforce consistent cover cropping', async () => {
  const productCss = await readFile(new URL('../product.css', import.meta.url), 'utf8');
  const menuCss = await readFile(new URL('../quick-order.css', import.meta.url), 'utf8');
  const adminCss = await readFile(new URL('../admin/product-images.css', import.meta.url), 'utf8');

  assert.match(productCss, /\.product-visual img[\s\S]*object-fit: cover;/);
  assert.match(productCss, /\.product-visual img[\s\S]*position: absolute;/);
  assert.match(menuCss, /\.menu-card-link[\s\S]*aspect-ratio: 11 \/ 10;/);
  assert.match(menuCss, /\.menu-card-link img[\s\S]*height: 100%;[\s\S]*object-fit: cover;/);
  assert.match(adminCss, /\.image-preview-stage[\s\S]*aspect-ratio: 7 \/ 8;/);
  assert.match(adminCss, /\.image-preview img[\s\S]*object-fit: cover;/);
});

test('unauthenticated users cannot upload product images', async () => {
  const handler = createProductImageUploadHandler({ authenticate: async () => null, verifyOrigin: () => {}, store: memoryStore() });
  const response = await handler(uploadRequest(await imageFile()));
  assert.equal(response.status, 401);
});
