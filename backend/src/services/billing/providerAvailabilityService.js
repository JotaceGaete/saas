import { getPaymentOptions, normalizeBillingProvider } from './providerSelectionService.js';

function detectDlocalMode() {
  const mockUrl = String(process.env.DLOCAL_MOCK_CHECKOUT_URL || '').trim();
  const mode = String(process.env.DLOCAL_MODE || '').trim().toLowerCase();
  if (mockUrl) return 'mock';
  if (mode === 'live') return 'live';
  if (mode === 'sandbox') return 'sandbox';
  return 'sandbox';
}

function getDlocalAvailability() {
  const mockUrl = String(process.env.DLOCAL_MOCK_CHECKOUT_URL || '').trim();
  const baseUrl = String(process.env.DLOCAL_BASE_URL || '').trim();
  const apiKey = String(process.env.DLOCAL_API_KEY || '').trim();
  const secret = String(process.env.DLOCAL_SECRET_KEY || '').trim();
  const mode = detectDlocalMode();

  if (mockUrl) {
    return {
      provider: 'dlocal',
      enabled: true,
      supportsCheckout: true,
      supportsSubscriptions: true,
      reason: null,
      mode,
    };
  }

  if (!baseUrl || !apiKey || !secret) {
    return {
      provider: 'dlocal',
      enabled: false,
      supportsCheckout: false,
      supportsSubscriptions: false,
      reason: 'missing_provider_env',
      mode,
    };
  }

  return {
    provider: 'dlocal',
    enabled: false,
    supportsCheckout: false,
    supportsSubscriptions: false,
    reason: 'endpoint_contract_not_implemented',
    mode,
  };
}

function getMercadopagoAvailability() {
  return {
    provider: 'mercadopago',
    enabled: true,
    supportsCheckout: true,
    supportsSubscriptions: true,
    reason: null,
    mode: 'live',
  };
}

function getPaypalAvailability() {
  const mode = String(process.env.PAYPAL_MODE || '').trim().toLowerCase() || 'sandbox';
  const hasCreds = !!String(process.env.PAYPAL_CLIENT_ID || '').trim()
    && !!String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
  return {
    provider: 'paypal',
    enabled: hasCreds,
    supportsCheckout: hasCreds,
    supportsSubscriptions: hasCreds,
    reason: hasCreds ? null : 'missing_provider_env',
    mode,
  };
}

export function getBillingProviderAvailability({ provider }) {
  const normalized = normalizeBillingProvider(provider);
  if (normalized === 'dlocal') return getDlocalAvailability();
  if (normalized === 'mercadopago') return getMercadopagoAvailability();
  if (normalized === 'paypal') return getPaypalAvailability();
  return {
    provider: normalized || String(provider || 'unknown'),
    enabled: false,
    supportsCheckout: false,
    supportsSubscriptions: false,
    reason: 'provider_not_supported',
    mode: 'unknown',
  };
}

export function getProviderAvailabilityByBusinessCountry({ businessCountryCode }) {
  const options = getPaymentOptions({ countryCode: businessCountryCode });
  const primaryAvailability = getBillingProviderAvailability({ provider: options.primary });
  if (primaryAvailability.enabled && primaryAvailability.supportsCheckout) {
    return {
      selectedProvider: options.primary,
      selectedAvailability: primaryAvailability,
      alternatives: options.secondary.map((provider) => getBillingProviderAvailability({ provider })),
      paymentOptions: options,
    };
  }

  const alternativeAvailabilities = options.secondary.map((provider) => getBillingProviderAvailability({ provider }));
  const firstAvailable = alternativeAvailabilities.find((item) => item.enabled && item.supportsCheckout) || null;
  if (firstAvailable) {
    return {
      selectedProvider: firstAvailable.provider,
      selectedAvailability: firstAvailable,
      alternatives: [primaryAvailability, ...alternativeAvailabilities.filter((item) => item.provider !== firstAvailable.provider)],
      paymentOptions: options,
    };
  }

  return {
    selectedProvider: options.primary,
    selectedAvailability: primaryAvailability,
    alternatives: alternativeAvailabilities,
    paymentOptions: options,
  };
}
