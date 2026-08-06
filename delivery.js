const elements = {
  pageTitle: document.querySelector('#page-title'),
  notice: document.querySelector('#delivery-notice'),
  card: document.querySelector('#delivery-card'),
  reference: document.querySelector('#order-reference'),
  status: document.querySelector('#order-status'),
  customerName: document.querySelector('#customer-name'),
  customerPhone: document.querySelector('#customer-phone'),
  address: document.querySelector('#delivery-address'),
  postcode: document.querySelector('#postcode'),
  notes: document.querySelector('#delivery-notes'),
  items: document.querySelector('#delivery-items'),
  total: document.querySelector('#total-paid'),
  form: document.querySelector('#completion-form'),
  note: document.querySelector('#completion-note'),
  complete: document.querySelector('#complete-delivery'),
};

const token = window.location.pathname.split('/').filter(Boolean).pop() || '';
const endpoint = `/api/delivery/${encodeURIComponent(token)}`;
const statusLabel = status => ({
  paid: 'Paid',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
}[status] || status);
const money = (amount, currency) => new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: currency.toUpperCase(),
}).format(amount / 100);
const customizationText = item => (item.customizations || []).flatMap(group =>
  (group.selections || []).map(selection => `${group.groupName}: ${selection.name}`)
).join(' · ');

const showNotice = (message, type = '') => {
  elements.notice.textContent = message;
  elements.notice.className = `delivery-notice${type ? ` is-${type}` : ''}`;
  elements.notice.hidden = false;
};

const renderOrder = order => {
  elements.pageTitle.textContent = order.deliveryAgentName ? `Delivery for ${order.deliveryAgentName}` : 'Customer delivery';
  elements.reference.textContent = order.reference;
  elements.status.textContent = statusLabel(order.status);
  elements.customerName.textContent = order.customerName;
  elements.customerPhone.textContent = order.customerPhone;
  elements.customerPhone.href = `tel:${order.customerPhone.replace(/[^+\d]/g, '')}`;
  elements.address.textContent = order.deliveryAddress;
  elements.postcode.textContent = order.postcode;
  elements.notes.textContent = order.deliveryNotes || 'No delivery notes provided.';
  elements.total.textContent = money(order.totalPaid, order.currency);
  elements.items.replaceChildren();
  order.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'delivery-item';
    const quantity = document.createElement('span');
    quantity.textContent = `${item.quantity}×`;
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = item.name;
    copy.append(name);
    const customizations = customizationText(item);
    if (customizations) {
      const details = document.createElement('small');
      details.textContent = customizations;
      copy.append(details);
    }
    const lineTotal = document.createElement('span');
    lineTotal.textContent = money(item.lineTotal, order.currency);
    row.append(quantity, copy, lineTotal);
    elements.items.append(row);
  });
  elements.notice.hidden = true;
  elements.card.hidden = false;
};

const request = async options => {
  const response = await fetch(endpoint, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Delivery details could not be loaded.');
  return data;
};

const load = async () => {
  try {
    const data = await request();
    renderOrder(data.order);
  } catch (error) {
    elements.pageTitle.textContent = 'Delivery link unavailable';
    showNotice(error.message, 'error');
  }
};

elements.form.addEventListener('submit', async event => {
  event.preventDefault();
  elements.complete.disabled = true;
  elements.complete.textContent = 'Confirming delivery…';
  try {
    const data = await request({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryCompletionNote: elements.note.value }),
    });
    elements.status.textContent = statusLabel(data.order.status);
    elements.form.hidden = true;
    showNotice(`Delivery completed at ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.deliveredAt))}.`, 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    showNotice(error.message, 'error');
    elements.complete.disabled = false;
    elements.complete.textContent = 'Mark as delivered';
  }
});

load();
