import { verifyRequestOrigin } from '@netlify/identity';
import { json, requireAdmin } from '../lib/admin-auth.mjs';
import { getDeliverySettings, saveDeliverySettings, sanitizeDeliverySettings } from '../lib/delivery-settings.mjs';
import { restrictionDescription } from '../lib/delivery-rules.mjs';

const serialize = settings => ({
  ...settings,
  updatedAt: settings.updatedAt instanceof Date ? settings.updatedAt.toISOString() : settings.updatedAt || null,
  activeRule: restrictionDescription(settings),
  orderingDisabled: !settings.deliveryEnabled && !settings.collectionEnabled,
});

export default async req => {
  const admin = await requireAdmin();
  if (!admin) return json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    if (req.method === 'GET') return json({ settings: serialize(await getDeliverySettings()) });
    if (req.method !== 'PUT') return json({ error: 'Method not allowed.' }, { status: 405 });

    verifyRequestOrigin(req);
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid settings request.' }, { status: 400 });
    }

    const settings = sanitizeDeliverySettings(body);
    if (!settings.deliveryEnabled && !settings.collectionEnabled && body.confirmOrderingDisabled !== true) {
      return json({ error: 'Confirm that ordering should be temporarily disabled.' }, { status: 409 });
    }
    if (settings.deliveryRestrictionMode === 'radius' && !settings.baseDeliveryPostcode) {
      return json({ error: 'Enter a valid base delivery postcode for radius mode.' }, { status: 400 });
    }
    if (settings.deliveryRestrictionMode === 'prefixes' && !settings.allowedPostcodePrefixes.length) {
      return json({ error: 'Add at least one allowed postcode prefix.' }, { status: 400 });
    }

    return json({ settings: serialize(await saveDeliverySettings(settings)) });
  } catch (error) {
    console.error('Admin delivery settings failed', error instanceof Error ? error.name : 'UnknownError');
    return json({ error: 'Delivery settings could not be saved.' }, { status: 500 });
  }
};

export const config = {
  path: '/api/admin/delivery-settings',
};
