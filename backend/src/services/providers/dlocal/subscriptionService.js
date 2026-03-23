import { HttpError } from '../../../lib/http/HttpError.js';
import { getBillingProviderAvailability } from '../../billing/providerAvailabilityService.js';

const COUNTRY_TO_CURRENCY = Object.freeze({
  AR: 'ARS',
  BO: 'BOB',
  BR: 'BRL',
  CO: 'COP',
  CR: 'CRC',
  EC: 'USD',
  GT: 'GTQ',
  MX: 'MXN',
  PA: 'USD',
  PE: 'PEN',
  PY: 'PYG',
  UY: 'UYU',
});

const PLAN_PRICES_BY_CURRENCY = Object.freeze({
  USD: { pro: 6, business: 10 },
  ARS: { pro: 15000, business: 30000 },
  COP: { pro: 25000, business: 42000 },
  PEN: { pro: 25, business: 42 },
  MXN: { pro: 120, business: 200 },
  BRL: { pro: 30, business: 50 },
  GTQ: { pro: 45, business: 75 },
  CRC: { pro: 3200, business: 5400 },
  BOB: { pro: 42, business: 70 },
  PYG: { pro: 45000, business: 76000 },
  UYU: { pro: 240, business: 400 },
});

function getDlocalBaseUrl() {
  return String(process.env.DLOCAL_BASE_URL || '').trim().replace(/\/$/, '');
}

function getDlocalApiKey() {
  return String(process.env.DLOCAL_API_KEY || '').trim();
}

function getDlocalSecretKey() {
  return String(process.env.DLOCAL_SECRET_KEY || '').trim();
}

function normalizeCountryCode(code) {
  return String(code || '').trim().toUpperCase();
}

function normalizePlanSlug(planSlug) {
  const slug = String(planSlug || '').trim().toLowerCase();
  if (slug === 'full') return 'business';
  return slug;
}

export function resolveDlocalCurrency(countryCode) {
  const code = normalizeCountryCode(countryCode);
  return COUNTRY_TO_CURRENCY[code] || 'USD';
}

export function resolveDlocalAmount({ planSlug, currencyCode }) {
  const normalizedPlan = normalizePlanSlug(planSlug);
  if (normalizedPlan !== 'pro' && normalizedPlan !== 'business') {
    throw new HttpError(400, '[dlocal] Unsupported plan for subscription');
  }
  const currency = String(currencyCode || 'USD').trim().toUpperCase();
  const table = PLAN_PRICES_BY_CURRENCY[currency] || PLAN_PRICES_BY_CURRENCY.USD;
  return table[normalizedPlan];
}

/**
 * Crea intención de suscripción dLocal.
 * Nota: por compatibilidad, admite modo mock con DLOCAL_MOCK_CHECKOUT_URL.
 */
export async function createDlocalSubscriptionIntent({
  businessId,
  userId,
  planSlug,
  countryCode,
  returnUrl,
  cancelUrl,
  subscriberEmail,
}) {
  const availability = getBillingProviderAvailability({ provider: 'dlocal' });
  if (!availability.enabled || !availability.supportsCheckout) {
    throw new HttpError(422, '[dlocal] Provider not ready for checkout', {
      code: 'PROVIDER_NOT_READY',
      provider: 'dlocal',
      details: availability,
    });
  }

  const currencyCode = resolveDlocalCurrency(countryCode);
  const amount = resolveDlocalAmount({ planSlug, currencyCode });

  const mockCheckoutUrl = String(process.env.DLOCAL_MOCK_CHECKOUT_URL || '').trim();
  if (mockCheckoutUrl) {
    const providerSubscriptionId = `dlocal-mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      provider: 'dlocal',
      providerSubscriptionId,
      providerStatus: 'PENDING',
      checkoutUrl: mockCheckoutUrl,
      currencyCode,
      amount,
      metadata: {
        mode: 'mock',
        businessId,
        userId,
        planSlug,
        returnUrl,
        cancelUrl,
        subscriberEmail: subscriberEmail || null,
      },
    };
  }

  const baseUrl = getDlocalBaseUrl();
  const apiKey = getDlocalApiKey();
  const secret = getDlocalSecretKey();
  if (!baseUrl || !apiKey || !secret) {
    throw new HttpError(422, '[dlocal] Missing provider configuration', {
      code: 'PROVIDER_NOT_READY',
      provider: 'dlocal',
      details: { reason: 'missing_provider_env' },
    });
  }

  throw new HttpError(501, '[dlocal] Live API integration pending endpoint contract', {
    code: 'PROVIDER_NOT_IMPLEMENTED',
    provider: 'dlocal',
    details: { reason: 'endpoint_contract_not_implemented' },
  });
}
