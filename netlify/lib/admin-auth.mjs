import { getUser } from '@netlify/identity';

export const ADMIN_ROLE = 'admin';

export const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
};

export const json = (body, init = {}) => Response.json(body, {
  ...init,
  headers: {
    ...noStoreHeaders,
    ...init.headers,
  },
});

export const requireAdmin = async () => {
  const user = await getUser();
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isAdmin = roles.includes(ADMIN_ROLE) || user?.role === ADMIN_ROLE;

  if (!user || !isAdmin) return null;

  return {
    id: user.id,
    email: user.email || '',
    name: user.name || '',
  };
};
