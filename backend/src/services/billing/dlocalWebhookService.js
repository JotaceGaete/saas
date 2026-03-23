import { HttpError } from '../../lib/http/HttpError.js';
import { getBillingSubscriptionByBusinessId, upsertBillingSubscriptionByBusiness } from '../../repositories/billingSubscriptionRepository.js';
import { mapProviderStatus } from './billingStatusMapper.js';

function getWebhookSecret() {
  return String(process.env.DLOCAL_WEBHOOK_SECRET || '').trim();
}

function readSignature(headers) {
  return String(headers.get('x-dlocal-signature') || headers.get('x-signature') || '').trim();
}

function verifySignature(headers) {
  const expected = getWebhookSecret();
  if (!expected) return true;
  const received = readSignature(headers);
  return received && received === expected;
}

function normalizeStatus(rawStatus) {
  return String(rawStatus || '').trim().toUpperCase() || null;
}

function extractBusinessId(payload) {
  return String(
    payload?.business_id
    || payload?.businessId
    || payload?.metadata?.business_id
    || payload?.metadata?.businessId
    || '',
  ).trim() || null;
}

function extractPlanSlug(payload) {
  const raw = String(payload?.plan_slug || payload?.planSlug || payload?.metadata?.plan_slug || '').trim().toLowerCase();
  if (raw === 'full') return 'business';
  if (raw === 'business') return 'business';
  if (raw === 'pro') return 'pro';
  return 'starter';
}

export async function processDlocalWebhook({ headers, payload }) {
  if (!verifySignature(headers)) {
    throw new HttpError(400, '[dlocal-webhook] Invalid signature');
  }

  const businessId = extractBusinessId(payload);
  if (!businessId) {
    throw new HttpError(400, '[dlocal-webhook] Missing business_id in payload');
  }
  const existing = await getBillingSubscriptionByBusinessId(businessId);
  const providerStatus = normalizeStatus(
    payload?.subscription_status
    || payload?.status
    || payload?.event?.status
    || payload?.payment_status
    || existing?.provider_status
    || 'PENDING',
  );
  const status = mapProviderStatus('dlocal', providerStatus);

  const subscriptionId = String(
    payload?.subscription_id
    || payload?.id
    || payload?.provider_subscription_id
    || existing?.provider_subscription_id
    || '',
  ).trim() || null;

  const updated = await upsertBillingSubscriptionByBusiness({
    business_id: businessId,
    provider: 'dlocal',
    provider_subscription_id: subscriptionId,
    plan_slug: extractPlanSlug(payload) || existing?.plan_slug || 'starter',
    currency_code: String(payload?.currency || existing?.currency_code || 'USD').trim().toUpperCase(),
    amount: payload?.amount ?? existing?.amount ?? null,
    interval_unit: String(payload?.interval_unit || existing?.interval_unit || 'month').trim().toLowerCase(),
    status,
    provider_status: providerStatus,
    trial_ends_at: payload?.trial_ends_at || existing?.trial_ends_at || null,
    starts_at: payload?.starts_at || existing?.starts_at || null,
    current_period_starts_at: payload?.current_period_starts_at || existing?.current_period_starts_at || null,
    current_period_ends_at: payload?.current_period_ends_at || existing?.current_period_ends_at || null,
    cancel_at_period_end: payload?.cancel_at_period_end === true || existing?.cancel_at_period_end === true,
    cancelled_at: payload?.cancelled_at || (status === 'cancelled' ? new Date().toISOString() : existing?.cancelled_at || null),
    metadata_json: {
      ...(existing?.metadata_json || {}),
      last_webhook_payload: payload,
      last_webhook_received_at: new Date().toISOString(),
    },
  });

  return {
    ok: true,
    businessId,
    provider: 'dlocal',
    provider_status: updated?.provider_status || providerStatus,
    status: updated?.status || status,
  };
}
