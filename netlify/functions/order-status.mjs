export default async req => {
  if (req.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405 });

  const sessionId = new URL(req.url).searchParams.get('session_id') || '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return Response.json({ error: 'A valid checkout session is required.' }, { status: 400 });
  }

  const stripeSecretKey = Netlify.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) return Response.json({ error: 'Payments are not configured yet.' }, { status: 503 });

  try {
    const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    });
    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {
      console.error('Stripe Checkout Session lookup failed', session.error?.type || stripeResponse.status);
      return Response.json({ error: 'Order not found.' }, { status: stripeResponse.status === 404 ? 404 : 502 });
    }

    const reference = session.metadata?.order_reference || session.client_reference_id;
    if (!reference) {
      console.error('Stripe Checkout Session metadata missing', {
        sessionId,
        missingFields: ['order_reference'],
      });
      return Response.json({ error: 'Order reference not found.' }, { status: 502 });
    }

    return Response.json({
      reference,
      status: session.payment_status === 'paid' ? 'paid' : 'pending',
    });
  } catch (error) {
    console.error('Stripe Checkout Session lookup request failed', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: 'Order details could not be loaded.' }, { status: 502 });
  }
};

export const config = {
  path: '/api/order-status',
};
