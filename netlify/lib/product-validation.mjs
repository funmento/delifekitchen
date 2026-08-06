import { clampImageFocalPoint } from '../../image-focal.mjs';

const slugify = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

export const resolveProductCustomizations = (product, rawGroups) => {
  if (!product || !product.active || product.soldOut || product.category?.active === false) return { valid: false, error: 'This product is unavailable.' };
  const submitted = Array.isArray(rawGroups) ? rawGroups : [];
  const submittedById = new Map(submitted.map(group => [group?.groupId, group]));
  if (submitted.some(group => !product.optionGroups.some(candidate => candidate.id === group?.groupId))) return { valid: false, error: 'An option group is invalid.' };
  const selections = [];
  for (const group of product.optionGroups) {
    const selectedIds = [...new Set(Array.isArray(submittedById.get(group.id)?.selectionIds) ? submittedById.get(group.id).selectionIds : [])];
    const selected = selectedIds.map(id => group.options.find(option => option.id === id && option.active));
    if (selected.some(option => !option) || selected.length < group.minSelections || selected.length > group.maxSelections) return { valid: false, error: `Please complete ${group.name}.` };
    if (selected.length) selections.push({ groupId: group.id, groupName: group.name, selections: selected.map(option => ({ id: option.id, name: option.name, priceAdjustment: option.priceAdjustment })) });
  }
  const optionAmount = selections.flatMap(group => group.selections).reduce((sum, option) => sum + option.priceAdjustment, 0);
  return { valid: true, selections, optionAmount, unitAmount: product.price + optionAmount };
};

export const productInput = body => ({
  slug: slugify(body.slug || body.name), name: String(body.name || '').trim().slice(0, 160),
  shortDescription: String(body.shortDescription || '').trim().slice(0, 500), fullDescription: String(body.fullDescription || '').trim().slice(0, 5000),
  price: Math.max(0, Math.round(Number(body.price) || 0)), imageUrl: String(body.imageUrl || '').trim().slice(0, 1000),
  imageFocalX: clampImageFocalPoint(body.imageFocalX), imageFocalY: clampImageFocalPoint(body.imageFocalY),
  categoryId: Number.isInteger(Number(body.categoryId)) ? Number(body.categoryId) : null,
  active: body.active !== false, soldOut: body.soldOut === true, featured: body.featured === true,
  sortOrder: Math.round(Number(body.sortOrder) || 0), updatedAt: new Date(),
});

export const makeKey = name => `${slugify(name) || 'option'}-${crypto.randomUUID().slice(0, 8)}`;
