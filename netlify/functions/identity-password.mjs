import { acceptInvite, AuthError, recoverPassword, verifyRequestOrigin } from '@netlify/identity';

const json = (body, init = {}) => Response.json(body, {
  ...init,
  headers: {
    'Cache-Control': 'no-store, max-age=0',
    ...init.headers,
  },
});

export default async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, { status: 405 });

  try {
    verifyRequestOrigin(req);
    const body = await req.json();
    const flow = body?.flow;
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!['invite', 'recovery'].includes(flow) || !token || token.length > 4096 || password.length < 6 || password.length > 300) {
      return json({ error: 'Enter a valid password to continue.' }, { status: 422 });
    }

    if (flow === 'invite') await acceptInvite(token, password);
    else await recoverPassword(token, password);

    return json({ completed: true });
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.status === 422 ? 422 : 400;
      return json({ error: status === 422 ? error.message : 'This link is invalid or has expired.' }, { status });
    }

    console.error('Identity password flow failed', error instanceof Error ? error.name : 'UnknownError');
    return json({ error: 'Password setup is temporarily unavailable.' }, { status: 503 });
  }
};

export const config = {
  path: '/api/identity/password',
};
