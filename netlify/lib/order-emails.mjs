const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
})[character]);

const money = order => new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: String(order.currency || 'gbp').toUpperCase(),
});
const textValue = value => value || 'None';
const fulfilmentLabel = order => order.fulfilment === 'delivery' ? 'Delivery' : 'Collection';
const destinationText = order => order.fulfilment === 'delivery'
  ? [order.deliveryAddress, order.postcode].filter(Boolean).join(', ')
  : 'Collection from DeLife Kitchen';
const prepText = order => Number.isInteger(order.estimatedPrepMinutes) && order.estimatedPrepMinutes > 0
  ? `Estimated preparation time: ${order.estimatedPrepMinutes} minutes.`
  : '';
const customizationText = item => (item.customizations || [])
  .map(group => `${group.groupName}: ${group.selections.map(option => option.name).join(', ')}`)
  .join('; ');
const customizationHtml = item => (item.customizations || [])
  .map(group => `<div style="color:#666;font-size:12px;margin-top:3px;"><strong>${escapeHtml(group.groupName)}:</strong> ${escapeHtml(group.selections.map(option => option.name).join(', '))}</div>`)
  .join('');

const helpText = ({ helpEmail, helpPhone } = {}) => {
  const contacts = [helpEmail, helpPhone].filter(Boolean).join(' or ');
  return contacts
    ? `Need help? Contact DeLife Kitchen at ${contacts} and quote your order reference.`
    : 'Need help? Reply to this email and quote your order reference.';
};

const orderDetailsText = (order, { includeCustomerContact = true } = {}) => {
  const currency = money(order);
  const lines = order.items.map(item => `- ${item.quantity} × ${item.name}${customizationText(item) ? ` (${customizationText(item)})` : ''}: ${currency.format(item.lineTotal / 100)}`);
  return [
    `Order reference: ${order.reference}`,
    `Customer: ${order.customerName}`,
    ...(includeCustomerContact ? [`Email: ${order.customerEmail}`, `Phone: ${order.customerPhone}`] : []),
    `Fulfilment: ${fulfilmentLabel(order)}`,
    `Address: ${destinationText(order)}`,
    `Order status: ${String(order.status || 'paid').replaceAll('_', ' ')}`,
    ...(prepText(order) ? [prepText(order)] : []),
    `Notes: ${textValue(order.notes)}`,
    '',
    'Items:',
    ...lines,
    '',
    `Total paid: ${currency.format(order.amountTotal / 100)}`,
  ].join('\n');
};

const orderDetailsHtml = (order, { includeCustomerContact = true } = {}) => {
  const currency = money(order);
  const rows = order.items.map(item => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e4ded2;">${item.quantity} × ${escapeHtml(item.name)}${customizationHtml(item)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e4ded2;text-align:right;">${currency.format(item.lineTotal / 100)}</td>
    </tr>`).join('');

  return `
    <div style="background:#fff;max-width:620px;margin:0 auto;padding:30px;box-sizing:border-box;">
      <p style="color:#e95028;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Order ${escapeHtml(order.reference)}</p>
      <h2 style="font-family:Georgia,serif;font-size:27px;margin:0 0 22px;">Order details</h2>
      <p><strong>Customer:</strong> ${escapeHtml(order.customerName)}</p>
      ${includeCustomerContact ? `<p><strong>Email:</strong> ${escapeHtml(order.customerEmail)}</p><p><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}</p>` : ''}
      <p><strong>Fulfilment:</strong> ${fulfilmentLabel(order)}</p>
      <p><strong>Address:</strong> ${escapeHtml(destinationText(order))}</p>
      <p><strong>Order status:</strong> ${escapeHtml(String(order.status || 'paid').replaceAll('_', ' '))}</p>
      ${prepText(order) ? `<p><strong>${escapeHtml(prepText(order))}</strong></p>` : ''}
      <p><strong>Notes:</strong> ${escapeHtml(textValue(order.notes))}</p>
      <table style="border-collapse:collapse;margin-top:24px;width:100%;">${rows}</table>
      <p style="font-size:20px;font-weight:700;text-align:right;">Total paid: ${currency.format(order.amountTotal / 100)}</p>
    </div>`;
};

const customerFrame = content => `
  <div style="background:#f6f0e5;color:#1b2118;font-family:Arial,sans-serif;padding:28px;">
    ${content}
  </div>`;

export const createMerchantEmail = order => ({
  subject: `New paid order ${order.reference} — ${money(order).format(order.amountTotal / 100)}`,
  text: `A new Stripe order has been paid.\n\n${orderDetailsText(order)}`,
  html: customerFrame(orderDetailsHtml(order)),
  replyTo: order.customerEmail,
});

export const createCustomerEmail = (order, help = {}) => ({
  subject: `DeLife Kitchen order confirmation — ${order.reference}`,
  text: `Hi ${order.customerName},\n\nThank you for your order. Your payment was successful and DeLife Kitchen has received your order.\n\n${orderDetailsText(order, { includeCustomerContact: false })}\n\n${helpText(help)}`,
  html: customerFrame(`
    <div style="background:#fff;max-width:620px;margin:0 auto 12px;padding:30px;box-sizing:border-box;">
      <p style="color:#e95028;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Payment confirmed</p>
      <h1 style="font-family:Georgia,serif;font-size:30px;margin:0 0 18px;">Thank you, ${escapeHtml(order.customerName)}.</h1>
      <p>DeLife Kitchen has received your paid order. Please keep reference <strong>${escapeHtml(order.reference)}</strong> handy.</p>
    </div>
    ${orderDetailsHtml(order, { includeCustomerContact: false })}
    <div style="background:#fff;max-width:620px;margin:12px auto 0;padding:24px 30px;box-sizing:border-box;">
      <p style="margin:0;">${escapeHtml(helpText(help))}</p>
    </div>`),
  ...(help.helpEmail ? { replyTo: help.helpEmail } : {}),
});

const statusContent = {
  paid: {
    label: 'Order received',
    message: 'Your payment is confirmed and DeLife Kitchen has received your order.',
  },
  preparing: {
    label: 'Your order is being prepared',
    message: 'Your order is now being prepared in the kitchen.',
  },
  ready: {
    label: 'Your order is ready',
    message: 'Your order is ready for collection or the next delivery step.',
  },
  completed: {
    label: 'Order completed',
    message: 'Your order has been completed. Thank you for ordering from DeLife Kitchen.',
  },
  cancelled: {
    label: 'Order cancelled',
    message: 'Your order has been cancelled. Please contact DeLife Kitchen if you need help.',
  },
};

export const createStatusEmail = (order, status, help = {}) => {
  const content = statusContent[status];
  if (!content) throw new Error(`Unsupported customer email status: ${status}`);
  const preparation = status === 'preparing' && prepText(order) ? ` ${prepText(order)}` : '';
  const message = `${content.message}${preparation}`;

  return {
    subject: `${content.label} — ${order.reference}`,
    text: `Hi ${order.customerName},\n\n${message}\n\nOrder reference: ${order.reference}\nOrder status: ${status}\n${prepText(order) ? `${prepText(order)}\n` : ''}\n${helpText(help)}`,
    html: customerFrame(`
      <div style="background:#fff;max-width:620px;margin:0 auto;padding:30px;box-sizing:border-box;">
        <p style="color:#e95028;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Order ${escapeHtml(order.reference)}</p>
        <h1 style="font-family:Georgia,serif;font-size:30px;margin:0 0 18px;">${escapeHtml(content.label)}</h1>
        <p>${escapeHtml(message)}</p>
        ${prepText(order) ? `<p><strong>${escapeHtml(prepText(order))}</strong></p>` : ''}
        <p style="margin-top:28px;">${escapeHtml(helpText(help))}</p>
      </div>`),
    ...(help.helpEmail ? { replyTo: help.helpEmail } : {}),
  };
};

export const sendOrderEmail = async ({ apiKey, from, to, email, idempotencyKey }) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: email.subject,
      text: email.text,
      html: email.html,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
  });

  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
};
