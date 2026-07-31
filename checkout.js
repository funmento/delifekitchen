const catalog = {
  'fried-plantain': { name: 'Fried Plantain', price: 10 },
  'delife-yamarita': { name: 'DeLife Yamarita', price: 12 },
  'egusi-soup': { name: 'Egusi Soup', price: 15 },
  'fish-peppersoup': { name: 'Fish Peppersoup', price: 7 },
  'fried-rice': { name: 'Fried Rice', price: 18 },
  'jollof-rice-chicken': { name: 'Jollof Rice & Chicken', price: 20 },
  'jollof-rice': { name: 'Jollof Rice', price: 12 },
  'meat-pie': { name: 'Meat Pie', price: 15 },
  'moi-moi': { name: 'Moi Moi', price: 7 },
  nkwobi: { name: 'Nkwobi', price: 15 },
  'nsala-soup': { name: 'Nsala Soup', price: 13 },
  'okra-soup': { name: 'Okra Soup', price: 17 },
  'stewed-chicken': { name: 'Stewed Chicken', price: 14 },
  'stewed-turkey': { name: 'Stewed Turkey', price: 13 },
  'stewed-turkey-2': { name: 'Stewed Turkey', price: 13 },
  'tilapia-fish': { name: 'Tilapia Fish', price: 33 },
  'yam-tomato-stew': { name: 'Yam & Tomato Stew', price: 33 },
};

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
let storedOrder = [];
try {
  storedOrder = JSON.parse(sessionStorage.getItem('delifeOrder') || '[]');
  if (!Array.isArray(storedOrder)) storedOrder = [];
} catch {
  sessionStorage.removeItem('delifeOrder');
}
let order = storedOrder
  .filter(item => catalog[item.id] && Number.isInteger(item.quantity) && item.quantity > 0)
  .map(item => ({ id: item.id, quantity: Math.min(item.quantity, 20) }));

if (requestedItem && catalog[requestedItem]) {
  const existingItem = order.find(item => item.id === requestedItem);
  if (existingItem) existingItem.quantity = Math.min(existingItem.quantity + 1, 20);
  else order.push({ id: requestedItem, quantity: 1 });
  sessionStorage.setItem('delifeOrder', JSON.stringify(order));
  window.history.replaceState({}, '', 'checkout.html');
}

const renderOrder = () => {
  if (!order.length) {
    itemContainer.innerHTML = '<div class="empty-order"><p>Your order is empty.</p><a href="menu.html">Choose from the menu</a></div>';
    totalLabel.textContent = currency.format(0);
    submitButton.disabled = true;
    return;
  }

  itemContainer.innerHTML = order.map(item => {
    const product = catalog[item.id];
    return `<div class="order-item"><span class="order-quantity">${item.quantity}×</span><span>${product.name}</span><strong>${currency.format(product.price * item.quantity)}</strong></div>`;
  }).join('');

  const total = order.reduce((sum, item) => sum + catalog[item.id].price * item.quantity, 0);
  totalLabel.textContent = currency.format(total);
};

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
    items: order,
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
