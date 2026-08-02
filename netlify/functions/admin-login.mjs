import { AuthError, login, logout, verifyRequestOrigin } from '@netlify/identity';
import { ADMIN_ROLE } from '../lib/admin-auth.mjs';

const redirect = location => new Response(null, {
  status: 303,
  headers: {
    'Cache-Control': 'no-store, max-age=0',
    Location: location,
  },
});

export default async req => {
  if (req.method !== 'POST') return redirect('/admin/?error=method');

  try {
    verifyRequestOrigin(req);
    const form = await req.formData();
    const email = String(form.get('email') || '').trim().toLowerCase().slice(0, 200);
    const password = String(form.get('password') || '');

    if (!email || !password || password.length > 300) {
      return redirect('/admin/?error=credentials');
    }

    const user = await login(email, password);
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const isAdmin = roles.includes(ADMIN_ROLE) || user.role === ADMIN_ROLE;

    if (!isAdmin) {
      await logout();
      return redirect('/admin/?error=access');
    }

    return redirect('/admin/');
  } catch (error) {
    if (error instanceof AuthError) return redirect('/admin/?error=credentials');
    console.error('Admin login failed', error instanceof Error ? error.name : 'UnknownError');
    return redirect('/admin/?error=unavailable');
  }
};

export const config = {
  path: '/api/admin/login',
};
