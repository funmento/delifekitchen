const catalog = {
  'fried-plantain': { name: 'Fried Plantain', unitAmount: 1000 },
  'delife-yamarita': { name: 'DeLife Yamarita', unitAmount: 1200 },
  'egusi-soup': { name: 'Egusi Soup', unitAmount: 1500 },
  'fish-peppersoup': { name: 'Fish Peppersoup', unitAmount: 700 },
  'fried-rice': { name: 'Fried Rice', unitAmount: 1800 },
  'jollof-rice-chicken': { name: 'Jollof Rice & Chicken', unitAmount: 2000 },
  'jollof-rice': { name: 'Jollof Rice', unitAmount: 1200 },
  'meat-pie': { name: 'Meat Pie', unitAmount: 1500 },
  'moi-moi': { name: 'Moi Moi', unitAmount: 700 },
  nkwobi: { name: 'Nkwobi', unitAmount: 1500 },
  'nsala-soup': { name: 'Nsala Soup', unitAmount: 1300 },
  'okra-soup': { name: 'Okra Soup', unitAmount: 1700 },
  'stewed-chicken': { name: 'Stewed Chicken', unitAmount: 1400 },
  'stewed-turkey': { name: 'Stewed Turkey', unitAmount: 1300 },
  'stewed-turkey-2': { name: 'Stewed Turkey', unitAmount: 1300 },
  'tilapia-fish': { name: 'Tilapia Fish', unitAmount: 3300 },
  'yam-tomato-stew': { name: 'Yam & Tomato Stew', unitAmount: 3300 },
};

const clean = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
const addMetadata = (params, metadata) => {
  Object.entries(metadata).forEach(([key, value]) => {
    params.append(`metadata[${key}]`, value);
    params.append(`payment_intent_data[metadata][${key}]`, value);
  });
};

export default async req => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });

  const stripeSecretKey = Netlify.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) return Response.json({ error: 'Payments are not configured yet.' }, { status: 503 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid checkout request.' }, { status: 400 });
  }

  const name = clean(body.customer?.name, 100);
  const email = clean(body.customer?.email, 200);
  const phone = clean(body.customer?.phone, 40);
  const fulfilment = body.fulfilment === 'delivery' ? 'delivery' : body.fulfilment === 'collection' ? 'collection' : '';
  const address = clean(body.address, 300);
  const postcode = clean(body.postcode, 20);
  const notes = clean(body.notes, 400);
  const items = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!name || !validEmail || !phone || !fulfilment) {
    return Response.json({ error: 'Please provide valid customer and fulfilment details.' }, { status: 400 });
  }
  if (fulfilment === 'delivery' && (!address || !postcode)) {
    return Response.json({ error: 'A delivery address and postcode are required.' }, { status: 400 });
  }

  const validatedItems = items.map(item => ({
    id: clean(item?.id, 80),
    quantity: Number(item?.quantity),
  })).filter(item => catalog[item.id] && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 20);

  if (!validatedItems.length || validatedItems.length !== items.length) {
    return Response.json({ error: 'Your order contains an invalid item. Please return to the menu and try again.' }, { status: 400 });
  }

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('customer_email', email);
  params.set('success_url', `${new URL(req.url).origin}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${new URL(req.url).origin}/cancelled.html`);
  params.set('submit_type', 'pay');

  validatedItems.forEach((item, index) => {
    const product = catalog[item.id];
    params.set(`line_items[${index}][price_data][currency]`, 'gbp');
    params.set(`line_items[${index}][price_data][unit_amount]`, String(product.unitAmount));
    params.set(`line_items[${index}][price_data][product_data][name]`, product.name);
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
  });

  const orderSummary = validatedItems.map(item => `${item.quantity}x ${catalog[item.id].name}`).join(', ').slice(0, 500);
  addMetadata(params, {
    customer_name: name,
    customer_phone: phone,
    fulfilment,
    delivery_address: fulfilment === 'delivery' ? address : 'Collection',
    postcode: fulfilment === 'delivery' ? postcode : 'N/A',
    order_details: orderSummary,
    order_notes: notes || 'None',
  });

  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const session = await stripeResponse.json();

  if (!stripeResponse.ok) {
    console.error('Stripe Checkout Session error', session.error?.type || stripeResponse.status);
    return Response.json({ error: 'Secure payment could not be opened. Please try again.' }, { status: 502 });
  }

  return Response.json({ url: session.url });
};

export const config = {
  path: '/api/create-checkout-session',
};
