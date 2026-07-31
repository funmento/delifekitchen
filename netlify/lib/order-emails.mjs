const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
})[character]);
const textValue = value => value || 'None';
const customizationText = item => (item.customizations || [])
  .map(group => `${group.groupName}: ${group.selections.map(option => option.name).join(', ')}`)
  .join('; ');
const customizationHtml = item => (item.customizations || [])
  .map(group => `<div style="color:#666;font-size:12px;margin-top:3px;"><strong>${escapeHtml(group.groupName)}:</strong> ${escapeHtml(group.selections.map(option => option.name).join(', '))}</div>`)
  .join('');

const orderDetailsText = order => {
  const lines = order.items.map(item => `- ${item.quantity} × ${item.name}${customizationText(item) ? ` (${customizationText(item)})` : ''}: ${currency.format(item.lineTotal / 100)}`);
  return [
    `Order reference: ${order.reference}`,
    `Customer: ${order.customerName}`,
    `Email: ${order.customerEmail}`,
    `Phone: ${order.customerPhone}`,
    `Fulfilment: ${order.fulfilment === 'delivery' ? 'Delivery' : 'Collection'}`,
    `Address: ${order.fulfilment === 'delivery' ? `${order.deliveryAddress}, ${order.postcode}` : 'Collection from DeLife Kitchen'}`,
    `Notes: ${textValue(order.notes)}`,
    '',
    'Items:',
    ...lines,
    '',
    `Total paid: ${currency.format(order.amountTotal / 100)}`,
  ].join('\n');
};

const orderDetailsHtml = order => {
  const rows = order.items.map(item => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e4ded2;">${item.quantity} × ${escapeHtml(item.name)}${customizationHtml(item)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e4ded2;text-align:right;">${currency.format(item.lineTotal / 100)}</td>
    </tr>`).join('');
  const destination = order.fulfilment === 'delivery'
    ? `${escapeHtml(order.deliveryAddress)}, ${escapeHtml(order.postcode)}`
    : 'Collection from DeLife Kitchen';

  return `
    <div style="background:#f6f0e5;color:#1b2118;font-family:Arial,sans-serif;padding:28px;">
      <div style="background:#fff;max-width:620px;margin:0 auto;padding:30px;">
        <p style="color:#e95028;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Order ${escapeHtml(order.reference)}</p>
        <h1 style="font-family:Georgia,serif;font-size:30px;margin:0 0 22px;">Order details</h1>
        <p><strong>Customer:</strong> ${escapeHtml(order.customerName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(order.customerEmail)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}</p>
        <p><strong>Fulfilment:</strong> ${order.fulfilment === 'delivery' ? 'Delivery' : 'Collection'}</p>
        <p><strong>Address:</strong> ${destination}</p>
        <p><strong>Notes:</strong> ${escapeHtml(textValue(order.notes))}</p>
        <table style="border-collapse:collapse;margin-top:24px;width:100%;">${rows}</table>
        <p style="font-size:20px;font-weight:700;text-align:right;">Total paid: ${currency.format(order.amountTotal / 100)}</p>
      </div>
    </div>`;
};

export const createMerchantEmail = order => ({
  subject: `New paid order ${order.reference} — ${currency.format(order.amountTotal / 100)}`,
  text: `A new Stripe order has been paid.\n\n${orderDetailsText(order)}`,
  html: orderDetailsHtml(order),
  replyTo: order.customerEmail,
});

export const createCustomerEmail = order => ({
  subject: `DeLife Kitchen order confirmation — ${order.reference}`,
  text: `Hi ${order.customerName},\n\nThank you for your order. Your payment was successful and DeLife Kitchen has received your order.\n\n${orderDetailsText(order)}\n\nPlease keep your order reference handy.`,
  html: `
    <div style="background:#f6f0e5;color:#1b2118;font-family:Arial,sans-serif;padding:28px;">
      <div style="background:#fff;max-width:620px;margin:0 auto;padding:30px;">
        <p style="color:#e95028;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Payment confirmed</p>
        <h1 style="font-family:Georgia,serif;font-size:30px;margin:0 0 18px;">Thank you, ${escapeHtml(order.customerName)}.</h1>
        <p>DeLife Kitchen has received your paid order. Please keep reference <strong>${escapeHtml(order.reference)}</strong> handy.</p>
      </div>
      ${orderDetailsHtml(order)}
    </div>`,
});

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
