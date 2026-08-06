import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { verifyRequestOrigin } from '@netlify/identity';
import { json, requireAdmin } from '../lib/admin-auth.mjs';
import { processProductImage, productImageKey, ProductImageError } from '../lib/product-images.mjs';

export const createProductImageUploadHandler = ({
  authenticate = requireAdmin,
  verifyOrigin = verifyRequestOrigin,
  store,
  processImage = processProductImage,
  createId = randomUUID,
} = {}) => async req => {
  const admin = await authenticate();
  if (!admin) return json({ error: 'Unauthorized.' }, { status: 401 });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, { status: 405 });

  try {
    verifyOrigin(req);
    const form = await req.formData();
    const image = form.get('image');
    const processed = await processImage(image);
    const key = productImageKey(form.get('slug'), createId());
    const imageStore = store || getStore({ name: 'product-images', consistency: 'strong' });
    await imageStore.set(key, processed.data);

    return json({
      imageUrl: `/api/product-images/${key}`,
      width: processed.width,
      height: processed.height,
      size: processed.size,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ProductImageError) return json({ error: error.message }, { status: error.status });
    console.error('Product image upload failed', error instanceof Error ? error.name : 'UnknownError');
    return json({ error: 'The image could not be uploaded. Please try again.' }, { status: 400 });
  }
};

export default createProductImageUploadHandler();

export const config = { path: '/api/admin/product-images' };
