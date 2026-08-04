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
  baseDeliveryFeePence: Number(row?.baseDeliveryFeePence ?? DEFAULT_DELIVERY_SETTINGS.baseDeliveryFeePence),
  includedBaseMiles: Number(row?.includedBaseMiles ?? DEFAULT_DELIVERY_SETTINGS.includedBaseMiles),
  additionalMileFeePence: Number(row?.additionalMileFeePence ?? DEFAULT_DELIVERY_SETTINGS.additionalMileFeePence),
  freeDeliveryThresholdPence: Number.isInteger(row?.freeDeliveryThresholdPence) ? row.freeDeliveryThresholdPence : null,
  minimumDeliveryOrderPence: Number.isInteger(row?.minimumDeliveryOrderPence) ? row.minimumDeliveryOrderPence : null,
  minimumCollectionOrderPence: Number.isInteger(row?.minimumCollectionOrderPence) ? row.minimumCollectionOrderPence : null,
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
  const positivePence = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000_000 ? parsed : fallback;
  };
  const nullablePence = value => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000_000 ? parsed : null;
  };
  const includedBaseMiles = Number(input?.includedBaseMiles);

  return {
    deliveryEnabled: input?.deliveryEnabled === true,
    collectionEnabled: input?.collectionEnabled === true,
    deliveryRestrictionMode: mode,
    baseDeliveryPostcode: basePostcode,
    deliveryRadiusMiles: Number.isFinite(radius) && radius > 0 && radius <= 100 ? Number(radius.toFixed(1)) : 15,
    allowedPostcodePrefixes: normalizePostcodePrefixes(input?.allowedPostcodePrefixes),
    deliveryUnavailableMessage: unavailableMessage || DEFAULT_DELIVERY_SETTINGS.deliveryUnavailableMessage,
    deliveryFeeEnabled: input?.deliveryFeeEnabled !== false,
    baseDeliveryFeePence: positivePence(input?.baseDeliveryFeePence, DEFAULT_DELIVERY_SETTINGS.baseDeliveryFeePence),
    includedBaseMiles: Number.isFinite(includedBaseMiles) && includedBaseMiles >= 0 && includedBaseMiles <= 100
      ? Number(includedBaseMiles.toFixed(1))
      : DEFAULT_DELIVERY_SETTINGS.includedBaseMiles,
    additionalMileFeePence: positivePence(input?.additionalMileFeePence, DEFAULT_DELIVERY_SETTINGS.additionalMileFeePence),
    freeDeliveryEnabled: input?.freeDeliveryEnabled === true,
    freeDeliveryThresholdPence: nullablePence(input?.freeDeliveryThresholdPence),
    minimumDeliveryOrderPence: nullablePence(input?.minimumDeliveryOrderPence),
    minimumCollectionOrderPence: nullablePence(input?.minimumCollectionOrderPence),
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
