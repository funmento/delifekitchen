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

test('every customization group has valid selection rules', () => {
  Object.values(catalog).forEach(product => {
    product.optionGroups.forEach(group => {
      assert.ok(['single', 'multi'].includes(group.selectionType));
      assert.ok(group.maxSelections >= group.minSelections);
      assert.ok(group.options.length >= group.maxSelections);
    });
  });
});

test('catalog names and prices match the Uber Eats menu', () => {
  assert.equal(catalog['fried-plantain'].unitAmount, 599);
  assert.equal(catalog['fish-peppersoup'].name, 'Fish Pepper Soup');
  assert.equal(catalog['fried-rice'].name, 'Fried or Vegetable Rice');
  assert.equal(catalog.nkwobi.name, 'Abacha 102 with Grilled Fish and Nkwobi');
  assert.equal(catalog['tilapia-fish'].unitAmount, 2999);
  assert.equal(catalog['yam-tomato-stew'].unitAmount, 1199);
});

test('soup products use the required Uber Eats preparation choices', () => {
  ['egusi-soup', 'nsala-soup', 'okra-soup'].forEach(productId => {
    const groups = catalog[productId].optionGroups;
    assert.deepEqual(groups[0].options.map(option => option.name), [
      'With Pounded Yam',
      'With Oat Meal',
      'Extra Pounded Yam',
      'Extra Oat Meal',
      'With Garri',
      'Extra Garri',
      'Cassava Fufu',
      'Extra Cassava Fufu',
    ]);
    assert.equal(groups[0].required, true);
    assert.equal(groups[0].minSelections, 1);
    assert.equal(groups[0].maxSelections, 1);
    assert.equal(groups[0].options.find(option => option.id === 'extra-garri').priceAdjustment, 499);
  });
});

test('required selections and multi-select limits are enforced', () => {
  assert.equal(resolveCustomizations('egusi-soup', []).valid, false);
  assert.equal(resolveCustomizations('tilapia-fish', []).valid, false);

  const tooManyExtras = resolveCustomizations('jollof-rice', [
    { groupId: 'choose-add-ons', selectionIds: ['stewed-chicken', 'fried-plantain'] },
  ]);
  assert.equal(tooManyExtras.valid, false);
});

test('option pricing is included in unit and line totals', () => {
  const resolved = resolveCustomizations('egusi-soup', [
    { groupId: 'choose-preparation', selectionIds: ['extra-pounded-yam'] },
  ]);

  assert.equal(resolved.valid, true);
  assert.equal(resolved.optionAmount, 499);
  assert.equal(resolved.unitAmount, 2298);
  assert.match(customizationSummary(resolved.selections), /Extra Pounded Yam/);
});

test('customized cart lines persist and consolidate after refresh', () => {
  const storage = memoryStorage();
  const customizations = [
    { groupId: 'choose-serving', selectionIds: ['fried-yam'] },
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
  assert.equal(restored[0].unitAmount, 2999);
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
    amountTotal: 2298,
    items: [{
      id: 'egusi-soup',
      name: 'Egusi Soup with Choice of Pounded Yam, Oat Meal, Garri or Cassava Fufu',
      quantity: 1,
      unitAmount: 2298,
      lineTotal: 2298,
      customizations: [
        { groupId: 'choose-preparation', groupName: 'Choose your preparation', selections: [{ id: 'extra-pounded-yam', name: 'Extra Pounded Yam', priceAdjustment: 499 }] },
      ],
    }],
  });

  assert.match(email.text, /Choose your preparation: Extra Pounded Yam/);
  assert.match(email.html, /Choose your preparation/);
  assert.match(email.html, /Extra Pounded Yam/);
});
