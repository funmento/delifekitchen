import { AuthError, logout, verifyRequestOrigin } from '@netlify/identity';

export default async req => {
  if (req.method !== 'POST') return new Response('Method not allowed.', { status: 405 });

  try {
    verifyRequestOrigin(req);
    await logout();
  } catch (error) {
    if (!(error instanceof AuthError)) {
      console.error('Admin logout failed', error instanceof Error ? error.name : 'UnknownError');
    }
  }

  return new Response(null, {
    status: 303,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      Location: '/admin/',
    },
  });
};

export const config = {
  path: '/api/admin/logout',
};
