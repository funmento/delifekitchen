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
const cuisineDescription = 'African and Caribbean Cuisine';
const itemSubtotalPence = order => Number.isInteger(order.orderSubtotalPence)
  ? order.orderSubtotalPence
  : order.items.reduce((total, item) => total + item.lineTotal, 0);
const deliveryFeePence = order => Number.isInteger(order.deliveryFeePence) ? order.deliveryFeePence : 0;
const discountAmountPence = order => Number.isInteger(order.discountAmountPence) ? order.discountAmountPence : 0;
const orderTotalPence = order => Number.isInteger(order.totalAfterDiscountPence) ? order.totalAfterDiscountPence : order.amountTotal;
const promotionLines = order => discountAmountPence(order) > 0 ? [
  `Promotion: ${order.promotionName || 'Promotion'}`,
  `Discount code: ${order.discountCodeUsed}`,
  `Discount: -${money(order).format(discountAmountPence(order) / 100)}`,
] : [];
const distanceText = order => Number.isFinite(order.deliveryDistanceMiles) ? `${order.deliveryDistanceMiles.toFixed(1)} miles` : '';

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
    `Item subtotal: ${currency.format(itemSubtotalPence(order) / 100)}`,
    ...promotionLines(order),
    `Delivery fee: ${currency.format(deliveryFeePence(order) / 100)}`,
    `Total paid: ${currency.format(orderTotalPence(order) / 100)}`,
    ...(distanceText(order) ? [`Delivery distance: ${distanceText(order)}`] : []),
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
      <div style="margin-top:18px;text-align:right;">
        <p style="margin:4px 0;">Item subtotal: ${currency.format(itemSubtotalPence(order) / 100)}</p>
        ${discountAmountPence(order) > 0 ? `<p style="margin:4px 0;">Promotion: ${escapeHtml(order.promotionName || 'Promotion')} (${escapeHtml(order.discountCodeUsed)})</p><p style="color:#2e653d;margin:4px 0;">Discount: -${currency.format(discountAmountPence(order) / 100)}</p>` : ''}
        <p style="margin:4px 0;">Delivery fee: ${currency.format(deliveryFeePence(order) / 100)}</p>
        <p style="font-size:20px;font-weight:700;margin:8px 0;">Total paid: ${currency.format(orderTotalPence(order) / 100)}</p>
        ${distanceText(order) ? `<p style="color:#666;font-size:12px;margin:4px 0;">Delivery distance: ${escapeHtml(distanceText(order))}</p>` : ''}
      </div>
    </div>`;
};

const emailBrandHeader = ({ logoUrl } = {}) => logoUrl
  ? `<div style="background:transparent;max-width:620px;margin:0 auto;padding:22px 30px 14px;box-sizing:border-box;text-align:center;"><img src="${escapeHtml(logoUrl)}" width="280" alt="Delife Kitchen African and Caribbean Cuisine" style="display:block;height:auto;margin:0 auto;max-width:100%;width:280px;"></div>`
  : `<div style="background:transparent;max-width:620px;margin:0 auto;padding:24px 30px 12px;box-sizing:border-box;text-align:center;"><strong style="color:#3b0909;font-family:Georgia,serif;font-size:26px;">Delife Kitchen</strong><div style="color:#8a6000;font-size:11px;font-weight:700;letter-spacing:.08em;margin-top:6px;text-transform:uppercase;">${cuisineDescription}</div></div>`;

const customerFrame = (content, branding = {}) => `
  <div style="background:#f6f0e5;color:#1b2118;font-family:Arial,sans-serif;padding:28px;">
    ${emailBrandHeader(branding)}
    ${content}
    <div style="color:#697063;font-size:11px;letter-spacing:.04em;margin:18px auto 0;max-width:620px;text-align:center;">Delife Kitchen · ${cuisineDescription}</div>
  </div>`;

export const createMerchantEmail = (order, branding = {}) => ({
  subject: `New Delife Kitchen paid order ${order.reference} — ${money(order).format(orderTotalPence(order) / 100)}`,
  text: `Delife Kitchen · ${cuisineDescription}\n\nA new Stripe order has been paid.\n\n${orderDetailsText(order)}`,
  html: customerFrame(orderDetailsHtml(order), branding),
  replyTo: order.customerEmail,
});

export const createCustomerEmail = (order, help = {}, branding = {}) => ({
  subject: `Delife Kitchen order confirmation — ${order.reference}`,
  text: `Delife Kitchen · ${cuisineDescription}\n\nHi ${order.customerName},\n\nThank you for your order. Your payment was successful and Delife Kitchen has received your order.\n\n${orderDetailsText(order, { includeCustomerContact: false })}\n\n${helpText(help)}`,
  html: customerFrame(`
    <div style="background:#fff;max-width:620px;margin:0 auto 12px;padding:30px;box-sizing:border-box;">
      <p style="color:#e95028;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Payment confirmed</p>
      <h1 style="font-family:Georgia,serif;font-size:30px;margin:0 0 18px;">Thank you, ${escapeHtml(order.customerName)}.</h1>
      <p>DeLife Kitchen has received your paid order. Please keep reference <strong>${escapeHtml(order.reference)}</strong> handy.</p>
    </div>
    ${orderDetailsHtml(order, { includeCustomerContact: false })}
    <div style="background:#fff;max-width:620px;margin:12px auto 0;padding:24px 30px;box-sizing:border-box;">
      <p style="margin:0;">${escapeHtml(helpText(help))}</p>
    </div>`, branding),
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
  out_for_delivery: {
    label: 'Your order is out for delivery',
    message: 'Your order has left the kitchen and is on its way to you.',
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

export const createStatusEmail = (order, status, help = {}, branding = {}) => {
  const content = statusContent[status];
  if (!content) throw new Error(`Unsupported customer email status: ${status}`);
  const preparation = status === 'preparing' && prepText(order) ? ` ${prepText(order)}` : '';
  const message = `${content.message}${preparation}`;

  return {
    subject: `Delife Kitchen: ${content.label} — ${order.reference}`,
    text: `Delife Kitchen · ${cuisineDescription}\n\nHi ${order.customerName},\n\n${message}\n\nOrder reference: ${order.reference}\nOrder status: ${status}\n${prepText(order) ? `${prepText(order)}\n` : ''}Item subtotal: ${money(order).format(itemSubtotalPence(order) / 100)}\n${promotionLines(order).join('\n')}${promotionLines(order).length ? '\n' : ''}Delivery fee: ${money(order).format(deliveryFeePence(order) / 100)}\nTotal paid: ${money(order).format(orderTotalPence(order) / 100)}\n${distanceText(order) ? `Delivery distance: ${distanceText(order)}\n` : ''}${helpText(help)}`,
    html: customerFrame(`
      <div style="background:#fff;max-width:620px;margin:0 auto;padding:30px;box-sizing:border-box;">
        <p style="color:#e95028;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Order ${escapeHtml(order.reference)}</p>
        <h1 style="font-family:Georgia,serif;font-size:30px;margin:0 0 18px;">${escapeHtml(content.label)}</h1>
        <p>${escapeHtml(message)}</p>
        ${prepText(order) ? `<p><strong>${escapeHtml(prepText(order))}</strong></p>` : ''}
        <p style="margin-top:24px;">Item subtotal: ${money(order).format(itemSubtotalPence(order) / 100)}${discountAmountPence(order) > 0 ? `<br>Promotion: ${escapeHtml(order.promotionName || 'Promotion')} (${escapeHtml(order.discountCodeUsed)})<br>Discount: -${money(order).format(discountAmountPence(order) / 100)}` : ''}<br>Delivery fee: ${money(order).format(deliveryFeePence(order) / 100)}<br><strong>Total paid: ${money(order).format(orderTotalPence(order) / 100)}</strong>${distanceText(order) ? `<br>Delivery distance: ${escapeHtml(distanceText(order))}` : ''}</p>
        <p style="margin-top:28px;">${escapeHtml(helpText(help))}</p>
      </div>`, branding),
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
