export const DELIVERY_RESTRICTION_MODES = ['none', 'prefixes', 'radius'];

export const DEFAULT_ALLOWED_POSTCODE_PREFIXES = [
  'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M11', 'M12', 'M13', 'M14', 'M15',
  'M16', 'M18', 'M19', 'M20', 'M21', 'M22', 'M23', 'M24', 'M25', 'M26', 'M27', 'M28',
  'M29', 'M30', 'M32', 'M33', 'M34', 'M38', 'M40', 'M41', 'M43', 'M44', 'M45', 'M46',
];

export const DEFAULT_DELIVERY_SETTINGS = Object.freeze({
  deliveryEnabled: true,
  collectionEnabled: true,
  deliveryRestrictionMode: 'none',
  baseDeliveryPostcode: 'M13 0XX',
  deliveryRadiusMiles: 15,
  allowedPostcodePrefixes: DEFAULT_ALLOWED_POSTCODE_PREFIXES,
  deliveryUnavailableMessage: 'Delivery is currently unavailable. Collection is still available.',
});

export const normalizeUkPostcode = value => {
  const compact = typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : '';
  if (!compact || compact.length < 5 || compact.length > 7) return '';
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
};

export const normalizePostcodePrefixes = value => {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,]+/) : [];
  return [...new Set(values
    .map(prefix => String(prefix).toUpperCase().replace(/\s+/g, ''))
    .filter(prefix => /^[A-Z]{1,2}\d[A-Z\d]?$/.test(prefix)))];
};

export const postcodeDistrict = postcode => normalizeUkPostcode(postcode).split(' ')[0] || '';

export const restrictionDescription = settings => {
  if (!settings.deliveryEnabled) return settings.deliveryUnavailableMessage;
  if (settings.deliveryRestrictionMode === 'radius') {
    return `Delivery is available within ${settings.deliveryRadiusMiles} miles of ${settings.baseDeliveryPostcode}.`;
  }
  if (settings.deliveryRestrictionMode === 'prefixes') {
    return 'Delivery is currently only available to selected Manchester postcodes.';
  }
  return 'Delivery is available to all valid UK postcodes.';
};

export const distanceMiles = (from, to) => {
  const toRadians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const startLatitude = toRadians(from.latitude);
  const endLatitude = toRadians(to.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const lookupUkPostcode = async (postcode, { fetchImpl = fetch, timeoutMs = 5000 } = {}) => {
  const normalized = normalizeUkPostcode(postcode);
  if (!normalized) return { ok: false, reason: 'invalid-postcode' };

  try {
    const response = await fetchImpl(`https://api.postcodes.io/postcodes/${encodeURIComponent(normalized)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) return { ok: false, reason: 'invalid-postcode' };
    if (!response.ok) return { ok: false, reason: 'lookup-unavailable' };

    const body = await response.json();
    const result = body?.result;
    if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
      return { ok: false, reason: 'invalid-postcode' };
    }
    return {
      ok: true,
      postcode: normalizeUkPostcode(result.postcode || normalized),
      latitude: result.latitude,
      longitude: result.longitude,
    };
  } catch {
    return { ok: false, reason: 'lookup-unavailable' };
  }
};

const rejected = (reason, message, extra = {}) => ({ allowed: false, reason, message, ...extra });

export const validateFulfilmentAvailability = (fulfilment, settings, confirmedDisabled = false) => {
  if (fulfilment === 'delivery' && !settings.deliveryEnabled) {
    return rejected('delivery-disabled', settings.deliveryUnavailableMessage || DEFAULT_DELIVERY_SETTINGS.deliveryUnavailableMessage);
  }
  if (fulfilment === 'collection' && !settings.collectionEnabled) {
    return rejected('collection-disabled', 'Collection is currently unavailable. Delivery may still be available.');
  }
  if (!settings.deliveryEnabled && !settings.collectionEnabled && !confirmedDisabled) {
    return rejected('ordering-disabled-confirmation-required', 'Confirm that ordering should be temporarily disabled.');
  }
  return { allowed: true };
};

export const validateDeliveryPostcode = async (postcode, settings, options = {}) => {
  const availability = validateFulfilmentAvailability('delivery', settings);
  if (!availability.allowed) return availability;

  const customer = await lookupUkPostcode(postcode, options);
  if (!customer.ok) {
    return customer.reason === 'lookup-unavailable'
      ? rejected('postcode-lookup-unavailable', 'We could not check delivery availability right now. Please try again.')
      : rejected('invalid-postcode', 'Please enter a valid UK postcode for delivery.');
  }

  if (settings.deliveryRestrictionMode === 'prefixes') {
    const prefixes = normalizePostcodePrefixes(settings.allowedPostcodePrefixes);
    if (!prefixes.includes(postcodeDistrict(customer.postcode))) {
      return rejected('outside-delivery-area', 'Sorry, delivery is currently only available within our delivery area.', { postcode: customer.postcode });
    }
  }

  if (settings.deliveryRestrictionMode === 'radius') {
    const base = await lookupUkPostcode(settings.baseDeliveryPostcode, options);
    if (!base.ok) {
      return rejected('base-postcode-unavailable', 'Delivery distance is temporarily unavailable. Please choose collection or try again later.');
    }
    const distance = distanceMiles(base, customer);
    if (distance > Number(settings.deliveryRadiusMiles)) {
      return rejected('outside-delivery-area', 'Sorry, delivery is currently only available within our delivery area.', {
        postcode: customer.postcode,
        distanceMiles: Number(distance.toFixed(1)),
      });
    }
    return {
      allowed: true,
      postcode: customer.postcode,
      distanceMiles: Number(distance.toFixed(1)),
      restrictionMode: 'radius',
      validationResult: 'accepted',
    };
  }

  return {
    allowed: true,
    postcode: customer.postcode,
    distanceMiles: null,
    restrictionMode: settings.deliveryRestrictionMode,
    validationResult: 'accepted',
  };
};
