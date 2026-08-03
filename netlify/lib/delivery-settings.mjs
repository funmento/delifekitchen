import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { deliverySettings } from '../../db/schema.js';
import {
  DEFAULT_DELIVERY_SETTINGS,
  DELIVERY_RESTRICTION_MODES,
  normalizePostcodePrefixes,
  normalizeUkPostcode,
} from './delivery-rules.mjs';

const fromRow = row => ({
  ...DEFAULT_DELIVERY_SETTINGS,
  ...row,
  deliveryRadiusMiles: Number(row?.deliveryRadiusMiles ?? DEFAULT_DELIVERY_SETTINGS.deliveryRadiusMiles),
  allowedPostcodePrefixes: normalizePostcodePrefixes(row?.allowedPostcodePrefixes ?? DEFAULT_DELIVERY_SETTINGS.allowedPostcodePrefixes),
});

export const getDeliverySettings = async (database = db) => {
  const [row] = await database.select().from(deliverySettings).where(eq(deliverySettings.id, 1)).limit(1);
  return fromRow(row);
};

export const sanitizeDeliverySettings = input => {
  const mode = DELIVERY_RESTRICTION_MODES.includes(input?.deliveryRestrictionMode)
    ? input.deliveryRestrictionMode
    : DEFAULT_DELIVERY_SETTINGS.deliveryRestrictionMode;
  const radius = Number(input?.deliveryRadiusMiles);
  const basePostcode = normalizeUkPostcode(input?.baseDeliveryPostcode);
  const unavailableMessage = typeof input?.deliveryUnavailableMessage === 'string'
    ? input.deliveryUnavailableMessage.trim().slice(0, 300)
    : '';

  return {
    deliveryEnabled: input?.deliveryEnabled === true,
    collectionEnabled: input?.collectionEnabled === true,
    deliveryRestrictionMode: mode,
    baseDeliveryPostcode: basePostcode,
    deliveryRadiusMiles: Number.isFinite(radius) && radius > 0 && radius <= 100 ? Number(radius.toFixed(1)) : 15,
    allowedPostcodePrefixes: normalizePostcodePrefixes(input?.allowedPostcodePrefixes),
    deliveryUnavailableMessage: unavailableMessage || DEFAULT_DELIVERY_SETTINGS.deliveryUnavailableMessage,
  };
};

export const saveDeliverySettings = async (input, database = db) => {
  const settings = sanitizeDeliverySettings(input);
  const updatedAt = new Date();
  await database.insert(deliverySettings).values({ id: 1, ...settings, updatedAt }).onConflictDoUpdate({
    target: deliverySettings.id,
    set: { ...settings, updatedAt },
  });
  return { ...settings, updatedAt };
};
