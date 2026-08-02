import { requireAdmin, json } from '../lib/admin-auth.mjs';

export default async req => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed.' }, { status: 405 });

  const admin = await requireAdmin();
  if (!admin) return json({ authenticated: false }, { status: 401 });

  return json({ authenticated: true, admin });
};

export const config = {
  path: '/api/admin/session',
};
