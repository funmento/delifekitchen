import { catalog, customizationSignature, resolveCustomizations } from './catalog.mjs';
import { readCart, writeCart } from './cart.mjs';
import './identity-flow.js';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const form = document.querySelector('#checkout-form');
const itemContainer = document.querySelector('#order-items');
const subtotalLabel = document.querySelector('#order-subtotal');
const deliveryFeeLabel = document.querySelector('#delivery-fee');
const totalLabel = document.querySelector('#order-total');
const discountLabel = document.querySelector('#discount-total');
const discountRow = document.querySelector('#discount-total-row');
const discountInput = document.querySelector('#discount-code');
const discountButton = document.querySelector('#apply-discount');
const discountStatus = document.querySelector('#discount-status');
const submitButton = document.querySelector('#checkout-submit');
const errorBox = document.querySelector('#checkout-error');
const deliveryFields = document.querySelector('#delivery-fields');
const collectionFields = document.querySelector('#collection-fields');
const addressInput = form.elements.address;
const postcodeInput = form.elements.postcode;
const collectionTimeInput = form.elements.collectionTime;
const fulfilmentStatus = document.querySelector('#fulfilment-status');
const deliveryQuoteButton = document.querySelector('#delivery-quote-button');
const deliveryQuoteStatus = document.querySelector('#delivery-quote-status');
const fulfilmentInputs = [...form.elements.fulfilment];
let orderingAvailable = true;
let deliveryQuote = null;
let quotePending = false;
let appliedDiscount = null;

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

const orderSubtotal = () => order.reduce((sum, item) => sum + item.resolved.unitAmount * item.quantity, 0);
const selectedFulfilment = () => fulfilmentInputs.find(input => input.checked)?.value || '';
const checkoutItems = () => order.map(item => ({ id: item.id, quantity: item.quantity, customizations: item.customizations }));

const invalidateDeliveryQuote = (message = 'Enter your postcode to calculate delivery.') => {
  deliveryQuote = null;
  deliveryQuoteStatus.textContent = message;
};
const invalidateDiscount = (message = '') => {
  appliedDiscount = null;
  discountStatus.textContent = message;
  discountStatus.className = 'discount-status';
};

const renderOrder = () => {
  if (!order.length) {
    itemContainer.innerHTML = '<div class="empty-order"><p>Your order is empty.</p><a href="menu.html">Choose from the menu</a></div>';
    subtotalLabel.textContent = currency.format(0);
    deliveryFeeLabel.textContent = currency.format(0);
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

  const localSubtotal = orderSubtotal();
  const isDelivery = selectedFulfilment() === 'delivery';
  const subtotal = deliveryQuote?.orderSubtotalPence ?? localSubtotal;
  const deliveryFee = isDelivery ? deliveryQuote?.deliveryFeePence : 0;
  const baseTotal = isDelivery ? deliveryQuote?.orderTotalPence : subtotal;
  const total = appliedDiscount?.totalPence ?? baseTotal;
  subtotalLabel.textContent = currency.format(subtotal / 100);
  deliveryFeeLabel.textContent = Number.isInteger(deliveryFee) ? currency.format(deliveryFee / 100) : '—';
  totalLabel.textContent = Number.isInteger(total) ? currency.format(total / 100) : '—';
  discountRow.hidden = !appliedDiscount;
  discountLabel.textContent = appliedDiscount ? `-${currency.format(appliedDiscount.discountAmountPence / 100)}` : `-${currency.format(0)}`;
  submitButton.disabled = !orderingAvailable || quotePending || (isDelivery && !deliveryQuote);
};

itemContainer.addEventListener('click', event => {
  const removeButton = event.target.closest('.order-remove');
  if (!removeButton) return;
  const itemElement = removeButton.closest('.order-item');
  order = order.filter(item => item.signature !== itemElement.dataset.signature);
  invalidateDiscount('Basket changed. Apply the code again.');
  writeCart(order.map(({ resolved, ...item }) => item), localStorage);
  if (selectedFulfilment() === 'delivery') invalidateDeliveryQuote('Basket changed. Recalculate delivery before payment.');
  renderOrder();
});

const setFulfilment = value => {
  const isDelivery = value === 'delivery';
  deliveryFields.hidden = !isDelivery;
  collectionFields.hidden = isDelivery;
  addressInput.required = isDelivery;
  postcodeInput.required = isDelivery;
  collectionTimeInput.required = !isDelivery;
  if (isDelivery) invalidateDeliveryQuote();
  };

const showFulfilmentStatus = message => {
  fulfilmentStatus.textContent = message;
  fulfilmentStatus.hidden = !message;
};

const applyDeliverySettings = settings => {
  const deliveryInput = fulfilmentInputs.find(input => input.value === 'delivery');
  const collectionInput = fulfilmentInputs.find(input => input.value === 'collection');
  deliveryInput.disabled = !settings.deliveryEnabled;
  collectionInput.disabled = !settings.collectionEnabled;
  orderingAvailable = settings.deliveryEnabled || settings.collectionEnabled;

  if (!orderingAvailable) {
    fulfilmentInputs.forEach(input => { input.checked = false; });
    deliveryFields.hidden = true;
    collectionFields.hidden = true;
    showFulfilmentStatus('Online ordering is temporarily unavailable. Please check back soon.');
  } else {
    const selected = fulfilmentInputs.find(input => input.checked && !input.disabled)
      || (settings.collectionEnabled ? collectionInput : deliveryInput);
    selected.checked = true;
    setFulfilment(selected.value);
    const unavailableMessages = [
      !settings.deliveryEnabled ? settings.deliveryUnavailableMessage : '',
      !settings.collectionEnabled ? 'Collection is currently unavailable. Delivery is still available.' : '',
    ].filter(Boolean);
    showFulfilmentStatus([settings.activeRule, ...unavailableMessages].filter(Boolean).join(' '));
  }
  renderOrder();
};

const loadDeliverySettings = async () => {
  try {
    const response = await fetch('/api/delivery-settings', { headers: { Accept: 'application/json' } });
    const settings = await response.json();
    if (!response.ok) throw new Error(settings.error || 'Delivery options could not be loaded.');
    applyDeliverySettings(settings);
  } catch {
    showFulfilmentStatus('Delivery and collection availability is confirmed before secure payment opens.');
  }
};

const requestDeliveryQuote = async () => {
  if (!order.length || !postcodeInput.value.trim()) {
    deliveryQuoteStatus.textContent = 'Enter your postcode to calculate delivery.';
    return;
  }

  quotePending = true;
  deliveryQuoteButton.disabled = true;
  deliveryQuoteButton.textContent = 'Checking…';
  deliveryQuoteStatus.textContent = 'Validating postcode and calculating the delivery fee…';
  renderOrder();
  try {
    const response = await fetch('/api/delivery-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fulfilment: 'delivery', postcode: postcodeInput.value, items: checkoutItems() }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Delivery could not be calculated.');
    deliveryQuote = result;
    postcodeInput.value = result.postcode || postcodeInput.value;
    deliveryQuoteStatus.textContent = `${result.deliveryDistanceMiles.toFixed(1)} miles · ${result.deliveryPricingRule}`;
  } catch (error) {
    invalidateDeliveryQuote(error.message || 'Delivery could not be calculated.');
  } finally {
    quotePending = false;
    deliveryQuoteButton.disabled = false;
    deliveryQuoteButton.textContent = 'Check delivery & price';
    renderOrder();
  }
};

fulfilmentInputs.forEach(input => input.addEventListener('change', event => {
  invalidateDiscount('Fulfilment changed. Apply the code again.');
  setFulfilment(event.target.value);
  renderOrder();
}));
postcodeInput.addEventListener('input', () => {
  invalidateDiscount('Postcode changed. Apply the code again.');
  invalidateDeliveryQuote('Postcode changed. Recalculate delivery before payment.');
  renderOrder();
});
postcodeInput.addEventListener('blur', () => {
  if (selectedFulfilment() === 'delivery' && postcodeInput.value.trim().length >= 5 && !deliveryQuote) requestDeliveryQuote();
});
deliveryQuoteButton.addEventListener('click', requestDeliveryQuote);

discountButton.addEventListener('click', async () => {
  const discountCode = discountInput.value.trim().toUpperCase();
  if (!discountCode || !order.length) {
    invalidateDiscount('Enter a code to apply.');
    discountStatus.classList.add('is-error');
    return;
  }
  if (selectedFulfilment() === 'delivery' && !deliveryQuote) {
    invalidateDiscount('Calculate delivery before applying a code.');
    discountStatus.classList.add('is-error');
    return;
  }
  discountButton.disabled = true;
  discountButton.textContent = 'Checking…';
  discountStatus.textContent = 'Checking this code securely…';
  try {
    const response = await fetch('/api/promotions/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discountCode, customerEmail: form.elements.email.value, fulfilment: selectedFulfilment(), postcode: postcodeInput.value, items: checkoutItems() }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'This code could not be applied.');
    appliedDiscount = result;
    discountInput.value = result.discountCode;
    discountStatus.textContent = `${result.promotionName} applied — you save ${currency.format(result.discountAmountPence / 100)}.`;
    discountStatus.className = 'discount-status is-success';
    renderOrder();
  } catch (error) {
    invalidateDiscount(error.message);
    discountStatus.classList.add('is-error');
    renderOrder();
  } finally {
    discountButton.disabled = false;
    discountButton.textContent = 'Apply';
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  errorBox.hidden = true;

  if (!form.reportValidity() || !order.length) return;
  if (selectedFulfilment() === 'delivery' && !deliveryQuote) {
    errorBox.textContent = 'Calculate delivery for this postcode before continuing to payment.';
    errorBox.hidden = false;
    return;
  }

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
    discountCode: appliedDiscount?.discountCode || '',
    items: checkoutItems(),
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
loadDeliverySettings();
