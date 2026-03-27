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

function extractPlanSlug(payload) {
  const raw = String(
    payload?.plan_slug
    || payload?.planSlug
    || payload?.metadata?.plan_slug
    || payload?.metadata?.planSlug
    || payload?.data?.plan_slug
    || payload?.data?.planSlug
    || payload?.data?.metadata?.plan_slug
    || payload?.data?.metadata?.planSlug
    || '',
  ).trim().toLowerCase();
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
    || payload?.external_reference
    || payload?.externalReference
    || payload?.metadata?.order_id
    || payload?.metadata?.external_reference
    || payload?.data?.order_id
    || payload?.data?.orderId
    || payload?.data?.external_reference
    || payload?.data?.externalReference
    || payload?.data?.metadata?.order_id
    || payload?.data?.metadata?.external_reference
    || payload?.reference
    || '',
  ).trim() || null;
}

function extractBusinessIdFromPayload(payload) {
  return String(
    payload?.business_id
    || payload?.businessId
    || payload?.metadata?.business_id
    || payload?.metadata?.businessId
    || payload?.data?.business_id
    || payload?.data?.businessId
    || payload?.data?.metadata?.business_id
    || payload?.data?.metadata?.businessId
    || '',
  ).trim() || null;
}

function extractUserId(payload) {
  return String(
    payload?.user_id
    || payload?.userId
    || payload?.metadata?.user_id
    || payload?.metadata?.userId
    || payload?.data?.user_id
    || payload?.data?.userId
    || payload?.data?.metadata?.user_id
    || payload?.data?.metadata?.userId
    || '',
  ).trim() || null;
}

function extractProviderStatus(payload) {
  return normalizeStatus(
    payload?.subscription_status
    || payload?.status
    || payload?.event?.status
    || payload?.payment_status
    || payload?.data?.subscription_status
    || payload?.data?.status
    || payload?.data?.payment_status
    || null,
  );
}

async function resolveBusinessIdByOrderId(orderId) {
  if (!orderId) return null;
  const admin = getAdminClient();

  const { data: payment, error: paymentErr } = await admin
    .from('wa_payments')
    .select('business_id')
    .eq('external_reference', orderId)
    .not('business_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!paymentErr && payment?.business_id) {
    return String(payment.business_id).trim() || null;
  }

  const { data: subscription, error: subscriptionErr } = await admin
    .from('billing_subscriptions')
    .select('business_id')
    .eq('metadata_json->>order_id', orderId)
    .not('business_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscriptionErr && subscription?.business_id) {
    return String(subscription.business_id).trim() || null;
  }

  return null;
}

export async function resolveDlocalWebhookContext(payload = {}) {
  const orderId = extractOrderId(payload);
  const businessIdFromPayload = extractBusinessIdFromPayload(payload);
  const businessId = businessIdFromPayload || await resolveBusinessIdByOrderId(orderId);
  const paymentId = String(
    payload?.payment_id
    || payload?.paymentId
    || payload?.id
    || payload?.data?.payment_id
    || payload?.data?.paymentId
    || payload?.data?.id
    || '',
  ).trim() || null;
  const eventType = String(
    payload?.event_type
    || payload?.eventType
    || payload?.type
    || payload?.event?.type
    || payload?.data?.event_type
    || payload?.data?.type
    || 'unknown',
  ).trim() || 'unknown';

  return {
    businessId: businessId || null,
    planSlug: extractPlanSlug(payload),
    userId: extractUserId(payload),
    orderId,
    providerStatus: extractProviderStatus(payload),
    paymentId,
    eventType,
  };
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

async function syncPaymentRecord({ businessId, orderId, paymentId, providerStatus, payload, status }) {
  if (!orderId && !paymentId) return;
  const admin = getAdminClient();
  const mapped = status === 'active' ? 'approved' : providerStatus === 'REJECTED' ? 'rejected' : 'pending';
  const updatePayload = {
    status: mapped,
    provider: 'dlocal_go',
    provider_payment_id: String(paymentId || payload?.id || payload?.payment_id || '').trim() || null,
    provider_status: providerStatus,
    raw_mp_response: { provider: 'dlocal_go', payload },
    plan_activated_at: status === 'active' ? new Date().toISOString() : null,
  };
  let query = admin
    .from('wa_payments')
    .update(updatePayload)
    .eq('business_id', businessId);
  if (paymentId) {
    query = query.eq('provider_payment_id', paymentId);
  } else {
    query = query.eq('external_reference', orderId);
  }
  const { error } = await query;
  if (error) {
    console.error('[DLOCAL_WEBHOOK_PAYMENT_UPDATE_ERROR]', {
      businessId,
      orderId,
      paymentId,
      message: error.message,
    });
  }
}

export async function processDlocalWebhook({ headers, payload }) {
  if (!verifySignature(headers)) {
    throw new HttpError(400, '[dlocal-webhook] Invalid signature');
  }

  console.info('[DLOCAL_WEBHOOK_INPUT]', {
    event_id: String(payload?.event_id || payload?.id || '').trim() || null,
    event_type: String(payload?.event_type || payload?.eventType || payload?.type || payload?.event?.type || payload?.data?.event_type || payload?.data?.type || 'unknown').trim() || 'unknown',
    has_business_id: !!extractBusinessIdFromPayload(payload),
    has_order_id: !!extractOrderId(payload),
  });

  const context = await resolveDlocalWebhookContext(payload);
  console.info('[DLOCAL_WEBHOOK_CONTEXT]', context);

  const businessId = context.businessId;
  if (!businessId) {
    const message = '[dlocal-webhook] Missing business context (business_id/order_id/external_reference)';
    const isLikelyManual = !context.orderId && !context.paymentId && context.eventType === 'unknown';
    console.warn('[DLOCAL_WEBHOOK_RESOLVE_FAILED]', {
      reason: message,
      event_type: context.eventType,
      order_id: context.orderId,
      payment_id: context.paymentId,
      is_manual_test: isLikelyManual,
    });
    if (isLikelyManual) {
      return { ok: true, ignored: true, reason: 'missing business context' };
    }
    throw new HttpError(400, message);
  }

  const existing = await getBillingSubscriptionByBusinessId(businessId);
  const providerStatus = normalizeStatus(
    context.providerStatus
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
    plan_slug: context.planSlug || existing?.plan_slug || 'starter',
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
      order_id: context.orderId || existing?.metadata_json?.order_id || null,
      user_id: context.userId || existing?.metadata_json?.user_id || null,
      payment_id: context.paymentId || existing?.metadata_json?.payment_id || null,
      event_type: context.eventType || existing?.metadata_json?.event_type || null,
    },
  });

  const orderId = context.orderId || updated?.metadata_json?.order_id || null;
  await syncPaymentRecord({
    businessId,
    orderId,
    paymentId: context.paymentId || null,
    providerStatus,
    payload,
    status,
  });
  if (isActiveStatus(status)) {
    await syncBusinessPlanAfterApprovedPayment({
      businessId,
      planSlug: updated?.plan_slug || context.planSlug,
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
