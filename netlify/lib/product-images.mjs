import sharp from 'sharp';

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PRODUCT_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp']);
const PRODUCT_IMAGE_MIME_FORMAT = new Map([['image/jpeg', 'jpeg'], ['image/png', 'png'], ['image/webp', 'webp']]);

export class ProductImageError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ProductImageError';
    this.status = status;
  }
}

export const processProductImage = async file => {
  if (!file || typeof file.arrayBuffer !== 'function') throw new ProductImageError('Choose a JPG, PNG or WebP image.');
  if (!PRODUCT_IMAGE_TYPES.has(file.type)) throw new ProductImageError('Only JPG, JPEG, PNG and WebP images are allowed.');
  if (!file.size) throw new ProductImageError('The selected image is empty.');
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) throw new ProductImageError('Images must be 5MB or smaller.', 413);

  try {
    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { failOn: 'warning', limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (!PRODUCT_IMAGE_FORMATS.has(metadata.format)) throw new ProductImageError('The uploaded file is not a supported image.');
    if (PRODUCT_IMAGE_MIME_FORMAT.get(file.type) !== metadata.format) throw new ProductImageError('The file contents do not match the selected image type.');

    const { data, info } = await image
      .rotate()
      .resize({ width: 1200, height: 900, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });

    return {
      data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      width: info.width,
      height: info.height,
      size: info.size,
    };
  } catch (error) {
    if (error instanceof ProductImageError) throw error;
    throw new ProductImageError('The uploaded file could not be processed as an image.');
  }
};

export const productImageKey = (slug, id) => {
  const safeSlug = String(slug || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'product';
  return `${safeSlug}-${id}.webp`;
};

export const validProductImageKey = key => /^[a-z0-9][a-z0-9-]{0,119}\.webp$/.test(key);
