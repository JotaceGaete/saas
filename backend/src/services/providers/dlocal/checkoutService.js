import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../../../lib/http/HttpError.js';
import { resolveDlocalAmount, resolveDlocalCurrency } from './subscriptionService.js';
import { mapProviderStatus } from '../../billing/billingStatusMapper.js';
import { upsertBillingSubscriptionByBusiness } from '../../../repositories/billingSubscriptionRepository.js';

function getBaseUrl() {
  return String(process.env.DLOCAL_BASE_URL || '').trim().replace(/\/$/, '');
}

function getApiKey() {
  return String(process.env.DLOCAL_API_KEY || '').trim();
}

function getSecretKey() {
  return String(process.env.DLOCAL_SECRET_KEY || '').trim();
}

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
}

function getServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function getAdminClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new HttpError(503, '[dlocal-checkout] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

function buildAuthorization(apiKey, secretKey) {
  return `Bearer ${apiKey}:${secretKey}`;
}

function mask(value) {
  const raw = String(value || '');
  if (!raw) return 'missing';
  if (raw.length <= 4) return '*'.repeat(raw.length);
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

function normalizePlanSlug(planSlug) {
  const raw = String(planSlug || '').trim().toLowerCase();
  if (raw === 'full') return 'business';
  if (raw === 'business') return 'business';
  if (raw === 'pro') return 'pro';
  throw new HttpError(400, 'planSlug must be pro or business');
}

function buildOrderId({ businessId, planSlug }) {
  return ['dlocal', businessId, planSlug, Date.now()]
    .join('-')
    .replace(/[^A-Za-z0-9-_]/g, '-');
}

function normalizeEmailForSubscription(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s || !s.includes('@')) return null;
  return s;
}

/**
 * Email requerido por wa_subscriptions (NOT NULL).
 * Orden: payer del payload hacia dLocal → usuario autenticado → columnas típicas de negocio.
 */
function resolveSubscriptionEmailForWa({ payerEmailFromPayload, authUser, business }) {
  const candidates = [
    payerEmailFromPayload,
    authUser?.email,
    business?.email,
    business?.contact_email,
    business?.business_email,
  ];
  for (const c of candidates) {
    const normalized = normalizeEmailForSubscription(c);
    if (normalized) return normalized;
  }
  return null;
}

async function insertPendingPayment({
  businessId,
  userId,
  planSlug,
  amount,
  currency,
  orderId,
  payload,
}) {
  const admin = getAdminClient();
  const paymentPayload = {
    business_id: businessId,
    user_id: userId,
    plan_slug: planSlug,
    amount,
    currency,
    status: 'pending',
    external_reference: orderId,
    raw_mp_response: { provider: 'dlocal', payload },
  };
  const { data, error } = await admin
    .from('wa_payments')
    .insert(paymentPayload)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[DLOCAL_CHECKOUT_PAYMENT_INSERT_ERROR]', {
      message: error.message,
      businessId,
      planSlug,
      orderId,
    });
    return null;
  }
  return data?.id || null;
}

export async function createDlocalPlanCheckout({
  business,
  authUser,
  planSlug,
  returnUrl,
  cancelUrl,
}) {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  const secretKey = getSecretKey();
  if (!baseUrl || !apiKey || !secretKey) {
    throw new HttpError(422, '[dlocal-checkout] Missing DLOCAL_BASE_URL/DLOCAL_API_KEY/DLOCAL_SECRET_KEY', {
      code: 'PROVIDER_NOT_READY',
      provider: 'dlocal',
      details: {
        hasBaseUrl: !!baseUrl,
        hasApiKey: !!apiKey,
        hasSecretKey: !!secretKey,
      },
    });
  }

  const normalizedPlan = normalizePlanSlug(planSlug);
  const countryCode = String(business?.country_code || business?.countryCode || 'PE').trim().toUpperCase();
  const currencyCode = resolveDlocalCurrency(countryCode);
  const amount = resolveDlocalAmount({ planSlug: normalizedPlan, currencyCode });
  const orderId = buildOrderId({ businessId: business.id, planSlug: normalizedPlan });
  const endpointPath = '/v1/payments';

  const safeReturnUrl = String(returnUrl || '').trim();

  const payload = {
    amount: Number(amount),
    currency: currencyCode,
    country: countryCode,
    order_id: orderId,
    payment_method_flow: 'REDIRECT',
    payer: {
      name: String(authUser?.user_metadata?.full_name || authUser?.email || 'Ventalink User').trim(),
      email: String(authUser?.email || 'qa@ventalink.app').trim().toLowerCase(),
    },
    // dLocal Create Payment: redirect back to merchant after hosted checkout (REDIRECT flow).
    // https://docs.dlocal.com/reference/create-payment — not read from metadata.
    callback_url: safeReturnUrl || undefined,
    metadata: {
      business_id: business.id,
      user_id: authUser.id,
      plan_slug: normalizedPlan,
    },
  };

  console.log('[DLOCAL PAYLOAD]', JSON.stringify(payload, null, 2));

  console.info('[DLOCAL_CHECKOUT_REQUEST]', {
    baseUrl,
    endpointPath,
    apiKeyLength: apiKey.length,
    secretKeyLength: secretKey.length,
    apiKeyMasked: mask(apiKey),
    secretKeyMasked: mask(secretKey),
    authorizationMasked: `Bearer ${mask(apiKey)}:${mask(secretKey)}`,
    businessId: business.id,
    planSlug: normalizedPlan,
    countryCode,
    currencyCode,
    amount,
    callback_url: safeReturnUrl || null,
    cancelUrl: String(cancelUrl || '').trim() || null,
  });

  let upstream;
  try {
    upstream = await fetch(`${baseUrl}${endpointPath}`, {
      method: 'POST',
      headers: {
        Authorization: buildAuthorization(apiKey, secretKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new HttpError(502, `[dlocal-checkout] upstream request failed: ${err?.message || 'network_error'}`, {
      code: 'DLOCAL_UPSTREAM_REQUEST_FAILED',
      provider: 'dlocal',
      details: { endpointPath },
    });
  }

  const rawText = await upstream.text().catch(() => '');
  console.log('[DLOCAL RESPONSE]', upstream.status, rawText);
  let parsed;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = rawText || null;
  }

  if (!upstream.ok) {
    throw new HttpError(422, `[dlocal-checkout] upstream rejected request (${upstream.status})`, {
      code: 'DLOCAL_CHECKOUT_REJECTED',
      provider: 'dlocal',
      details: {
        endpointPath,
        status: upstream.status,
        body: parsed,
      },
    });
  }

  const redirectUrl = String(parsed?.redirect_url || '').trim();
  const paymentId = String(parsed?.id || '').trim();
  const providerStatus = String(parsed?.status || 'PENDING').trim().toUpperCase();
  if (!redirectUrl || !paymentId) {
    throw new HttpError(422, '[dlocal-checkout] Missing redirect_url or payment id in response', {
      code: 'DLOCAL_INVALID_RESPONSE',
      provider: 'dlocal',
      details: {
        endpointPath,
        body: parsed,
      },
    });
  }

  const mappedStatus = mapProviderStatus('dlocal', providerStatus);
  const subscriptionEmail = resolveSubscriptionEmailForWa({
    payerEmailFromPayload: payload?.payer?.email,
    authUser,
    business,
  });
  if (!subscriptionEmail) {
    throw new HttpError(422, '[dlocal-checkout] Missing email for wa_subscriptions (payer, authenticated user, or business)', {
      code: 'MISSING_SUBSCRIPTION_EMAIL',
      provider: 'dlocal',
    });
  }

  await upsertBillingSubscriptionByBusiness({
    business_id: business.id,
    email: subscriptionEmail,
    provider: 'dlocal',
    provider_subscription_id: paymentId,
    plan_slug: normalizedPlan,
    currency_code: currencyCode,
    amount,
    interval_unit: 'month',
    status: mappedStatus,
    provider_status: providerStatus,
    metadata_json: {
      source: 'dlocal_checkout',
      order_id: orderId,
      merchant_checkout_token: parsed?.merchant_checkout_token || null,
      redirect_url: redirectUrl,
    },
  });

  const paymentRecordId = await insertPendingPayment({
    businessId: business.id,
    userId: authUser.id,
    planSlug: normalizedPlan,
    amount,
    currency: currencyCode,
    orderId,
    payload,
  });

  return {
    ok: true,
    provider: 'dlocal',
    endpointUsed: endpointPath,
    redirectUrl,
    paymentId,
    paymentRecordId,
    status: providerStatus,
    merchantCheckoutToken: parsed?.merchant_checkout_token || null,
    orderId,
    currencyCode,
    amount,
    raw: {
      direct: parsed?.direct ?? null,
    },
  };
}
