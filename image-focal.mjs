export const DEFAULT_IMAGE_FOCAL_POINT = 50;

export const clampImageFocalPoint = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_IMAGE_FOCAL_POINT;
  return Math.min(100, Math.max(0, Math.round(numeric)));
};

export const productImagePosition = product => `${clampImageFocalPoint(product?.imageFocalX)}% ${clampImageFocalPoint(product?.imageFocalY)}%`;
