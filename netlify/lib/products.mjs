import { and, asc, eq, inArray } from 'drizzle-orm';
import { categories, productOptionGroups, productOptions, products } from '../../db/schema.js';
import { staticProducts } from './static-products.mjs';
export { makeKey, productInput, resolveProductCustomizations } from './product-validation.mjs';

export const ensureStaticProductsImported = async database => {
  const [category] = await database.insert(categories).values({
    name: 'Main menu', slug: 'main-menu', description: 'Delife Kitchen menu', sortOrder: 10,
  }).onConflictDoUpdate({ target: categories.slug, set: { updatedAt: new Date() } }).returning();

  for (const item of staticProducts) {
    const [product] = await database.insert(products).values({
      slug: item.slug, name: item.name, shortDescription: item.shortDescription, fullDescription: item.fullDescription,
      price: item.price, imageUrl: item.imageUrl, categoryId: category.id, sortOrder: item.sortOrder,
    }).onConflictDoNothing({ target: products.slug }).returning();
    const activeProduct = product || (await database.select().from(products).where(eq(products.slug, item.slug)).limit(1))[0];
    if (!activeProduct) continue;

    for (const [groupIndex, group] of item.optionGroups.entries()) {
      const [savedGroup] = await database.insert(productOptionGroups).values({
        productId: activeProduct.id, key: group.id, name: group.name, required: group.required,
        minSelections: group.minSelections, maxSelections: group.maxSelections, sortOrder: (groupIndex + 1) * 10,
      }).onConflictDoNothing({ target: [productOptionGroups.productId, productOptionGroups.key] }).returning();
      const activeGroup = savedGroup || (await database.select().from(productOptionGroups).where(and(eq(productOptionGroups.productId, activeProduct.id), eq(productOptionGroups.key, group.id))).limit(1))[0];
      for (const [optionIndex, option] of group.options.entries()) {
        await database.insert(productOptions).values({
          groupId: activeGroup.id, key: option.id, name: option.name, priceAdjustment: option.priceAdjustment,
          sortOrder: (optionIndex + 1) * 10,
        }).onConflictDoNothing({ target: [productOptions.groupId, productOptions.key] });
      }
    }
  }
};

export const loadCatalog = async (database, { includeInactive = false, slugs = null } = {}) => {
  await ensureStaticProductsImported(database);
  const productRows = await database.select({ product: products, category: categories }).from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(slugs?.length ? inArray(products.slug, slugs) : undefined)
    .orderBy(asc(categories.sortOrder), asc(products.sortOrder), asc(products.name));
  const ids = productRows.map(row => row.product.id);
  const groups = ids.length ? await database.select().from(productOptionGroups).where(inArray(productOptionGroups.productId, ids)).orderBy(asc(productOptionGroups.sortOrder)) : [];
  const groupIds = groups.map(group => group.id);
  const options = groupIds.length ? await database.select().from(productOptions).where(inArray(productOptions.groupId, groupIds)).orderBy(asc(productOptions.sortOrder)) : [];

  return productRows.filter(row => includeInactive || (row.product.active && row.category?.active !== false)).map(row => ({
    ...row.product,
    category: row.category,
    optionGroups: groups.filter(group => group.productId === row.product.id).map(group => ({
      ...group,
      id: group.key,
      databaseId: group.id,
      selectionType: group.maxSelections === 1 ? 'single' : 'multi',
      options: options.filter(option => option.groupId === group.id && (includeInactive || option.active)).map(option => ({
        ...option, id: option.key, databaseId: option.id,
      })),
    })),
  }));
};
