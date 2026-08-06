import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('database product routes load rewrite-safe product assets', async () => {
  const template = await read('../product.html');
  const redirects = await read('../_redirects');

  ['/styles.css', '/brand.css', '/product.css', '/script.js', '/product-options.js'].forEach(asset => {
    assert.match(template, new RegExp(`["']${asset.replaceAll('/', '\\/')}["']`));
  });
  assert.doesNotMatch(template, /(?:href|src)=["'](?:styles|brand|product|script|product-options)\./);
  assert.match(redirects, /^\/products\/\*\s+\/product\.html\s+200$/m);
});

test('database product template matches the legacy premium page structure', async () => {
  const legacy = await read('../products/fried-plantain.html');
  const template = await read('../product.html');
  const sharedStructure = [
    'announcement',
    'site-header',
    'brand',
    'menu-toggle',
    'product-main',
    'product-breadcrumb',
    'product-hero',
    'product-visual',
    'product-details',
    'product-category',
    'product-description',
    'product-buy-row',
    'product-price',
    'product-portion',
    'quick-checkout',
    'product-facts',
    'product-facts-inner',
    'fact-list',
    'allergen-note',
    'product-back',
  ];

  sharedStructure.forEach(className => {
    assert.match(legacy, new RegExp(`class=["'][^"']*${className}`));
    assert.match(template, new RegExp(`class=["'][^"']*${className}`));
  });
  ['Our story', 'Menu', 'How to order', 'Order now', 'Instagram', 'TikTok', 'Policies'].forEach(label => {
    assert.match(template, new RegExp(label));
  });
  assert.match(template, /fonts\.googleapis\.com\/css2\?family=DM\+Sans/);
  assert.match(template, /Playfair\+Display/);
});

test('database product content hydrates without replacing the shared template', async () => {
  const runtime = await read('../product-options.js');

  assert.match(runtime, /document\.body\.hasAttribute\('data-dynamic-product'\)/);
  assert.match(runtime, /document\.querySelector\('\.product-details h1'\)\.textContent = product\.name/);
  assert.match(runtime, /document\.querySelector\('\.product-description'\)\.textContent = description/);
  assert.match(runtime, /image\.src = product\.imageUrl/);
  assert.match(runtime, /data-product-fact="category"/);
  assert.doesNotMatch(runtime, /details\.innerHTML = .*product\.name/);
});
