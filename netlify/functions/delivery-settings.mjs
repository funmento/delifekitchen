import { getDeliverySettings } from '../lib/delivery-settings.mjs';
import { restrictionDescription } from '../lib/delivery-rules.mjs';

export default async req => {
  if (req.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405 });

  try {
    const settings = await getDeliverySettings();
    return Response.json({
      deliveryEnabled: settings.deliveryEnabled,
      collectionEnabled: settings.collectionEnabled,
      deliveryRestrictionMode: settings.deliveryRestrictionMode,
      baseDeliveryPostcode: settings.deliveryRestrictionMode === 'radius' ? settings.baseDeliveryPostcode : null,
      deliveryRadiusMiles: settings.deliveryRestrictionMode === 'radius' ? settings.deliveryRadiusMiles : null,
      deliveryUnavailableMessage: settings.deliveryUnavailableMessage,
      activeRule: restrictionDescription(settings),
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('Delivery settings load failed', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: 'Delivery options could not be loaded.' }, { status: 503 });
  }
};

export const config = {
  path: '/api/delivery-settings',
};
