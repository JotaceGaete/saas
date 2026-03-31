import { getPaymentOptions, normalizeBillingProvider } from './providerSelectionService.js';
import { getEnv } from '../../config/env.js';

function isTruthy(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function isDlocalFeatureEnabled() {
  return false;
}

function detectDlocalMode() {
  const mockUrl = String(process.env.DLOCAL_MOCK_CHECKOUT_URL || '').trim();
  const mode = String(process.env.DLOCAL_MODE || '').trim().toLowerCase();
  if (mockUrl) return 'mock';
  if (mode === 'live') return 'live';
  if (mode === 'sandbox') return 'sandbox';
  return 'sandbox';
}

function getDlocalAvailability() {
  return {
    provider: 'dlocal',
    enabled: false,
    supportsCheckout: false,
    supportsSubscriptions: false,
    reason: 'feature_disabled',
    mode: detectDlocalMode(),
  };
}

function getMercadopagoAvailability() {
  return {
    provider: 'mercado_pago',
    enabled: true,
    supportsCheckout: true,
    supportsSubscriptions: true,
    reason: null,
    mode: 'live',
  };
}

function getPaypalAvailability() {
  let mode = String(process.env.PAYPAL_MODE || '').trim().toLowerCase() || 'sandbox';
  let enabled = false;
  let reason = 'missing_provider_env';
  const hasClientId = !!String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const hasClientSecret = !!String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
  const hasWebhookId = !!String(process.env.PAYPAL_WEBHOOK_ID || '').trim();
  try {
    const env = getEnv();
    mode = env?.paypal?.mode || mode;
    enabled = true;
    reason = null;
  } catch (err) {
    enabled = false;
    reason = 'missing_provider_env';
    console.warn('[billing-paypal-debug] getEnv validation failed', {
      message: err?.message || 'unknown_error',
    });
  }
  console.info(
    `[billing-paypal-debug] country=NA provider=paypal enabled=${enabled} supportsCheckout=${enabled} supportsSubscriptions=${enabled} reason=${reason || 'none'} mode=${mode} hasClientId=${hasClientId} hasClientSecret=${hasClientSecret} hasWebhookId=${hasWebhookId}`,
  );
  return {
    provider: 'paypal',
    enabled,
    supportsCheckout: enabled,
    supportsSubscriptions: enabled,
    reason,
    mode,
  };
}

export function getBillingProviderAvailability({ provider }) {
  const normalized = normalizeBillingProvider(provider);
  if (normalized === 'dlocal') return getDlocalAvailability();
  if (normalized === 'mercado_pago') return getMercadopagoAvailability();
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
