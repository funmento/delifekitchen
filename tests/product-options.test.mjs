import test from 'node:test';
import assert from 'node:assert/strict';
import { addCartItem, readCart, writeCart } from '../cart.mjs';
import { catalog, customizationSignature, customizationSummary, resolveCustomizations } from '../catalog.mjs';
import { createMerchantEmail } from '../netlify/lib/order-emails.mjs';

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
};

test('every product has reusable customization groups', () => {
  Object.values(catalog).forEach(product => {
    assert.ok(product.optionGroups.length > 0, `${product.name} needs option groups`);
    product.optionGroups.forEach(group => {
      assert.ok(['single', 'multi'].includes(group.selectionType));
      assert.ok(group.maxSelections >= group.minSelections);
      assert.ok(group.options.length >= group.maxSelections);
    });
  });
});

test('swallow products include the required types, sizes, and extras', () => {
  ['egusi-soup', 'nsala-soup', 'okra-soup'].forEach(productId => {
    const groups = catalog[productId].optionGroups;
    assert.deepEqual(groups[0].options.map(option => option.name), ['Eba', 'Pounded Yam', 'Amala', 'Semovita']);
    assert.equal(groups[0].required, true);
    assert.equal(groups[1].name, 'Portion Size');
    assert.equal(groups[1].required, true);
    assert.deepEqual(groups[2].options.map(option => option.name), ['Extra Soup', 'Extra Meat', 'Extra Fish']);
  });
});

test('required selections and multi-select limits are enforced', () => {
  assert.equal(resolveCustomizations('egusi-soup', []).valid, false);

  const tooManyExtras = resolveCustomizations('fried-rice', [
    { groupId: 'portion-size', selectionIds: ['regular'] },
    { groupId: 'heat-level', selectionIds: ['medium'] },
    { groupId: 'extras', selectionIds: ['fried-plantain', 'moi-moi', 'extra-chicken'] },
  ]);
  assert.equal(tooManyExtras.valid, false);
});

test('option pricing is included in unit and line totals', () => {
  const resolved = resolveCustomizations('egusi-soup', [
    { groupId: 'swallow-type', selectionIds: ['pounded-yam'] },
    { groupId: 'portion-size', selectionIds: ['large'] },
    { groupId: 'extras', selectionIds: ['extra-soup', 'extra-meat'] },
  ]);

  assert.equal(resolved.valid, true);
  assert.equal(resolved.optionAmount, 1200);
  assert.equal(resolved.unitAmount, 2700);
  assert.match(customizationSummary(resolved.selections), /Pounded Yam/);
  assert.match(customizationSummary(resolved.selections), /Extra Soup, Extra Meat/);
});

test('customized cart lines persist and consolidate after refresh', () => {
  const storage = memoryStorage();
  const customizations = [
    { groupId: 'side', selectionIds: ['fried-yam'] },
    { groupId: 'heat-level', selectionIds: ['hot'] },
    { groupId: 'extras', selectionIds: ['pepper-sauce'] },
  ];
  const resolved = resolveCustomizations('tilapia-fish', customizations);
  const signature = customizationSignature('tilapia-fish', resolved.selections);
  const item = { id: 'tilapia-fish', signature, quantity: 1, customizations, unitAmount: resolved.unitAmount };

  const cart = addCartItem(addCartItem([], { ...item }), { ...item });
  writeCart(cart, storage);
  const restored = readCart(storage);

  assert.equal(restored.length, 1);
  assert.equal(restored[0].quantity, 2);
  assert.deepEqual(restored[0].customizations, customizations);
  assert.equal(restored[0].unitAmount, 3450);
});

test('order confirmations contain selected customizations', () => {
  const email = createMerchantEmail({
    reference: 'DLK-TEST',
    customerName: 'Test Customer',
    customerEmail: 'customer@example.com',
    customerPhone: '0000000000',
    fulfilment: 'collection',
    deliveryAddress: null,
    postcode: null,
    notes: null,
    amountTotal: 2700,
    items: [{
      id: 'egusi-soup',
      name: 'Egusi Soup',
      quantity: 1,
      unitAmount: 2700,
      lineTotal: 2700,
      customizations: [
        { groupId: 'swallow-type', groupName: 'Swallow Type', selections: [{ id: 'pounded-yam', name: 'Pounded Yam', priceAdjustment: 0 }] },
      ],
    }],
  });

  assert.match(email.text, /Swallow Type: Pounded Yam/);
  assert.match(email.html, /Swallow Type/);
  assert.match(email.html, /Pounded Yam/);
});
