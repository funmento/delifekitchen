import { catalog, customizationSignature, resolveCustomizations } from './catalog.mjs';
import { readCart, writeCart } from './cart.mjs';
import './identity-flow.js';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const form = document.querySelector('#checkout-form');
const itemContainer = document.querySelector('#order-items');
const totalLabel = document.querySelector('#order-total');
const submitButton = document.querySelector('#checkout-submit');
const errorBox = document.querySelector('#checkout-error');
const deliveryFields = document.querySelector('#delivery-fields');
const collectionFields = document.querySelector('#collection-fields');
const addressInput = form.elements.address;
const postcodeInput = form.elements.postcode;
const collectionTimeInput = form.elements.collectionTime;

const requestedItem = new URLSearchParams(window.location.search).get('item');
if (requestedItem && catalog[requestedItem]) {
  window.location.replace(`products/${requestedItem}.html`);
}

const storedOrder = readCart(localStorage);
let order = storedOrder.map(item => {
  const id = typeof item?.id === 'string' ? item.id : '';
  const quantity = Number(item?.quantity);
  const customizations = Array.isArray(item?.customizations) ? item.customizations : [];
  const resolved = resolveCustomizations(id, customizations);
  if (!resolved.valid || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return null;
  return {
    id,
    quantity,
    customizations,
    signature: customizationSignature(id, resolved.selections),
    unitAmount: resolved.unitAmount,
    resolved,
  };
}).filter(Boolean);

writeCart(order.map(({ resolved, ...item }) => item), localStorage);

const renderOrder = () => {
  if (!order.length) {
    itemContainer.innerHTML = '<div class="empty-order"><p>Your order is empty.</p><a href="menu.html">Choose from the menu</a></div>';
    totalLabel.textContent = currency.format(0);
    submitButton.disabled = true;
    return;
  }

  itemContainer.innerHTML = order.map(item => {
    const product = catalog[item.id];
    const optionLines = item.resolved.selections.map(group => `
      <li><span>${group.groupName}</span><b>${group.selections.map(option => option.name).join(', ')}</b></li>`).join('');
    return `
      <article class="order-item" data-signature="${item.signature}">
        <span class="order-quantity">${item.quantity}×</span>
        <div class="order-item-details">
          <strong>${product.name}</strong>
          <ul>${optionLines}</ul>
          <button class="order-remove" type="button">Remove</button>
        </div>
        <strong class="order-line-total">${currency.format((item.resolved.unitAmount * item.quantity) / 100)}</strong>
      </article>`;
  }).join('');

  const total = order.reduce((sum, item) => sum + item.resolved.unitAmount * item.quantity, 0);
  totalLabel.textContent = currency.format(total / 100);
  submitButton.disabled = false;
};

itemContainer.addEventListener('click', event => {
  const removeButton = event.target.closest('.order-remove');
  if (!removeButton) return;
  const itemElement = removeButton.closest('.order-item');
  order = order.filter(item => item.signature !== itemElement.dataset.signature);
  writeCart(order.map(({ resolved, ...item }) => item), localStorage);
  renderOrder();
});

const setFulfilment = value => {
  const isDelivery = value === 'delivery';
  deliveryFields.hidden = !isDelivery;
  collectionFields.hidden = isDelivery;
  addressInput.required = isDelivery;
  postcodeInput.required = isDelivery;
  collectionTimeInput.required = !isDelivery;
};

form.elements.fulfilment.forEach(input => input.addEventListener('change', event => setFulfilment(event.target.value)));

form.addEventListener('submit', async event => {
  event.preventDefault();
  errorBox.hidden = true;

  if (!form.reportValidity() || !order.length) return;

  submitButton.disabled = true;
  submitButton.classList.add('loading');
  submitButton.firstChild.textContent = 'Opening secure checkout ';

  const formData = new FormData(form);
  const payload = {
    customer: {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
    },
    fulfilment: formData.get('fulfilment'),
    address: formData.get('address'),
    postcode: formData.get('postcode'),
    collectionTime: formData.get('collectionTime'),
    notes: formData.get('notes'),
    items: order.map(item => ({ id: item.id, quantity: item.quantity, customizations: item.customizations })),
  };

  try {
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.url) throw new Error(result.error || 'Checkout could not be started.');
    window.location.assign(result.url);
  } catch (error) {
    errorBox.textContent = error.message || 'Checkout could not be started. Please try again.';
    errorBox.hidden = false;
    submitButton.disabled = false;
    submitButton.classList.remove('loading');
    submitButton.firstChild.textContent = 'Continue to secure payment ';
  }
});

setFulfilment('collection');
renderOrder();
