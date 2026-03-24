import { HttpError } from '../../lib/http/HttpError.js';
import { createClient } from '@supabase/supabase-js';
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
    throw new HttpError(503, '[dlocal-webhook] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

function extractOrderId(payload) {
  return String(
    payload?.order_id
    || payload?.orderId
    || payload?.metadata?.order_id
    || payload?.reference
    || '',
  ).trim() || null;
}

function isActiveStatus(status) {
  return String(status || '').trim().toLowerCase() === 'active';
}

function addDaysIso(days) {
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  return dt.toISOString();
}

async function syncBusinessPlanAfterApprovedPayment({ businessId, planSlug }) {
  const admin = getAdminClient();
  const { data: business, error } = await admin
    .from('wa_businesses')
    .select('id, plan_slug, trial_expires_at')
    .eq('id', businessId)
    .maybeSingle();
  if (error || !business) {
    console.error('[DLOCAL_WEBHOOK_BUSINESS_READ_ERROR]', {
      businessId,
      message: error?.message || 'business_not_found',
    });
    return;
  }

  const trialEndsAt = business?.trial_expires_at ? new Date(business.trial_expires_at) : null;
  const now = new Date();
  const hasActiveTrial = !!trialEndsAt && Number.isFinite(trialEndsAt.getTime()) && trialEndsAt > now;

  if (hasActiveTrial) {
    const { error: updateErr } = await admin
      .from('wa_businesses')
      .update({
        scheduled_plan_slug: planSlug,
        scheduled_change_at: trialEndsAt.toISOString(),
      })
      .eq('id', businessId);
    if (updateErr) {
      console.error('[DLOCAL_WEBHOOK_SCHEDULE_PLAN_ERROR]', {
        businessId,
        planSlug,
        message: updateErr.message,
      });
    }
    return;
  }

  const { error: activateErr } = await admin
    .from('wa_businesses')
    .update({
      plan_slug: planSlug,
      plan_expires_at: addDaysIso(30),
      scheduled_plan_slug: null,
      scheduled_change_at: null,
    })
    .eq('id', businessId);
  if (activateErr) {
    console.error('[DLOCAL_WEBHOOK_ACTIVATE_PLAN_ERROR]', {
      businessId,
      planSlug,
      message: activateErr.message,
    });
  }
}

async function syncPaymentRecord({ businessId, orderId, providerStatus, payload, status }) {
  if (!orderId) return;
  const admin = getAdminClient();
  const mapped = status === 'active' ? 'approved' : providerStatus === 'REJECTED' ? 'rejected' : 'pending';
  const updatePayload = {
    status: mapped,
    mp_payment_id: String(payload?.id || '').trim() || null,
    mp_status: providerStatus,
    raw_mp_response: { provider: 'dlocal', payload },
    plan_activated_at: status === 'active' ? new Date().toISOString() : null,
  };
  const { error } = await admin
    .from('wa_payments')
    .update(updatePayload)
    .eq('business_id', businessId)
    .eq('external_reference', orderId);
  if (error) {
    console.error('[DLOCAL_WEBHOOK_PAYMENT_UPDATE_ERROR]', {
      businessId,
      orderId,
      message: error.message,
    });
  }
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
      order_id: extractOrderId(payload) || existing?.metadata_json?.order_id || null,
    },
  });

  const orderId = extractOrderId(payload) || updated?.metadata_json?.order_id || null;
  await syncPaymentRecord({
    businessId,
    orderId,
    providerStatus,
    payload,
    status,
  });
  if (isActiveStatus(status)) {
    await syncBusinessPlanAfterApprovedPayment({
      businessId,
      planSlug: updated?.plan_slug || extractPlanSlug(payload),
    });
  }

  return {
    ok: true,
    businessId,
    provider: 'dlocal',
    provider_status: updated?.provider_status || providerStatus,
    status: updated?.status || status,
  };
}
