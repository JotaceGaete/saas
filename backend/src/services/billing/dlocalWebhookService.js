import { HttpError } from '../../lib/http/HttpError.js';
import { createClient } from '@supabase/supabase-js';
import { getBillingSubscriptionByBusinessId, upsertBillingSubscriptionByBusiness } from '../../repositories/billingSubscriptionRepository.js';
import { mapProviderStatus } from './billingStatusMapper.js';
import { maybeSendSubscriptionReceiptForPayment, maybeSendSubscriptionReceiptForSubscription } from './subscriptionReceiptService.js';

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

/**
 * Misma fecha para plan_expires_at (wa_businesses) y current_period_ends_at (billing_subscriptions).
 * +30 días desde el vencimiento vigente más lejano (plan_expires_at o trial_expires_at si > now);
 * si no hay fecha futura o están vencidas, desde now (mes completo desde el pago).
 */
async function computeActivationPeriodEndIso(businessId) {
  const admin = getAdminClient();
  const { data: business, error } = await admin
    .from('wa_businesses')
    .select('plan_expires_at, trial_expires_at')
    .eq('id', businessId)
    .maybeSingle();
  const now = new Date();
  if (error || !business) {
    const d = new Date(now);
    d.setDate(d.getDate() + 30);
    return d.toISOString();
  }
  const candidates = [business?.plan_expires_at, business?.trial_expires_at]
    .map((v) => (v ? new Date(v) : null))
    .filter((d) => d && Number.isFinite(d.getTime()));
  const futureEnds = candidates.filter((d) => d > now);
  const base = futureEnds.length > 0
    ? new Date(Math.max(...futureEnds.map((d) => d.getTime())))
    : new Date(now);
  const periodEnd = new Date(base);
  periodEnd.setDate(periodEnd.getDate() + 30);
  return periodEnd.toISOString();
}

async function syncBusinessPlanAfterApprovedPayment({ businessId, planSlug, periodEndIso: periodEndIsoArg }) {
  const admin = getAdminClient();
  const periodEndIso = periodEndIsoArg || (await computeActivationPeriodEndIso(businessId));
  const nowIso = new Date().toISOString();

  const { error: activateErr } = await admin
    .from('wa_businesses')
    .update({
      plan_slug: planSlug,
      plan_expires_at: periodEndIso,
      trial_expires_at: null,
      scheduled_plan_slug: null,
      scheduled_change_at: null,
      updated_at: nowIso,
    })
    .eq('id', businessId);

  if (activateErr) {
    console.error('[DLOCAL_WEBHOOK_ACTIVATE_PLAN_ERROR]', { businessId, planSlug, message: activateErr.message });
  }
}

async function syncPaymentRecord({ businessId: _businessId, orderId, paymentId, providerStatus, payload, status }) {
  if (!orderId && !paymentId) return null;
  const admin = getAdminClient();

  // Normalizamos el estado para la DB
  const mapped =
    status === 'active' || providerStatus === 'PAID'
      ? 'approved'
      : providerStatus === 'REJECTED'
        ? 'rejected'
        : 'pending';

  const updatePayload = {
    status: mapped,
    provider: 'dlocal_go',
    provider_payment_id: paymentId,
    provider_status: providerStatus,
    raw_mp_response: { provider: 'dlocal_go', payload },
    plan_activated_at:
      status === 'active' || providerStatus === 'PAID' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  console.log(`[DLOCAL_DEBUG] Intentando actualizar Pago: ${paymentId} u Orden: ${orderId}`);

  // INTENTO 1: Buscar por el ID de dLocal (DP-XXXX)
  if (paymentId) {
    const { data: updatedByProvider, error: err1 } = await admin
      .from('wa_payments')
      .update(updatePayload)
      .eq('provider_payment_id', paymentId)
      .select('id')
      .maybeSingle();
    if (err1) console.error('[DLOCAL_ERROR]', err1.message);
    if (updatedByProvider?.id) return updatedByProvider.id;
  }

  // INTENTO 2: Respaldo por referencia externa (order_id)
  if (orderId) {
    const { data: updatedByOrder, error: err2 } = await admin
      .from('wa_payments')
      .update(updatePayload)
      .eq('external_reference', orderId)
      .select('id')
      .maybeSingle();
    if (err2) console.error('[DLOCAL_ERROR]', err2.message);
    if (updatedByOrder?.id) return updatedByOrder.id;
  }
  return null;
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
  let trialEndsHistorical = existing?.trial_ends_at ?? null;
  if (!trialEndsHistorical) {
    const { data: bizRow } = await getAdminClient()
      .from('wa_businesses')
      .select('trial_expires_at')
      .eq('id', businessId)
      .maybeSingle();
    const raw = bizRow?.trial_expires_at ?? null;
    if (raw) trialEndsHistorical = typeof raw === 'string' ? raw : new Date(raw).toISOString();
  }
  const providerStatus = normalizeStatus(
    context.providerStatus
    || existing?.provider_status
    || 'PENDING',
  );
  const status = mapProviderStatus('dlocal', providerStatus);
  const active = isActiveStatus(status);
  const periodEndIso = active ? await computeActivationPeriodEndIso(businessId) : null;

  const subscriptionId = String(
    payload?.subscription_id
    || payload?.id
    || payload?.provider_subscription_id
    || existing?.provider_subscription_id
    || '',
  ).trim() || null;

  // Email de respaldo: payload → negocio en wa_businesses → fallback fijo (evita NULL en billing_subscriptions)
  const { data: bizData } = await getAdminClient()
    .from('wa_businesses')
    .select('email')
    .eq('id', businessId)
    .maybeSingle();

  const userEmail =
    payload?.payer?.email
    || payload?.email
    || bizData?.email
    || 'soporte@ventalink.app';

  const updated = await upsertBillingSubscriptionByBusiness({
    business_id: businessId,
    email: userEmail,
    provider: 'dlocal',
    provider_subscription_id: subscriptionId,
    plan_slug: context.planSlug || existing?.plan_slug || 'starter',
    currency_code: String(payload?.currency || existing?.currency_code || 'USD').trim().toUpperCase(),
    amount: payload?.amount ?? existing?.amount ?? null,
    interval_unit: String(payload?.interval_unit || existing?.interval_unit || 'month').trim().toLowerCase(),
    status,
    provider_status: providerStatus,
    /** Conservar fin de trial original como referencia histórica al pasar a activo. */
    trial_ends_at: trialEndsHistorical ?? payload?.trial_ends_at ?? null,
    starts_at: payload?.starts_at || existing?.starts_at || null,
    current_period_starts_at: payload?.current_period_starts_at || existing?.current_period_starts_at || null,
    current_period_ends_at: active
      ? periodEndIso
      : (payload?.current_period_ends_at || existing?.current_period_ends_at || null),
    cancel_at_period_end: payload?.cancel_at_period_end === true || existing?.cancel_at_period_end === true,
    cancelled_at: payload?.cancelled_at || (status === 'cancelled' ? new Date().toISOString() : existing?.cancelled_at || null),
    metadata_json: {
      ...(existing?.metadata_json || {}),
      last_webhook_payload: payload,
      order_id: context.orderId,
    },
  });

  const orderId = context.orderId || updated?.metadata_json?.order_id || null;
  const updatedPaymentId = await syncPaymentRecord({
    businessId,
    orderId,
    paymentId: context.paymentId || null,
    providerStatus,
    payload,
    status,
  });
  if (active) {
    await syncBusinessPlanAfterApprovedPayment({
      businessId,
      planSlug: updated?.plan_slug || context.planSlug,
      periodEndIso,
    });
    if (updatedPaymentId) {
      maybeSendSubscriptionReceiptForPayment({
        admin: getAdminClient(),
        paymentId: updatedPaymentId,
        provider: 'dlocal',
        providerPaymentId: context.paymentId || orderId,
        subscriptionStatus: updated?.status || status,
        paidAt: new Date().toISOString(),
        nextRenewalDate: periodEndIso,
      }).catch((error) => {
        console.warn('[DLOCAL_RECEIPT_EMAIL_SKIPPED]', {
          businessId,
          paymentId: context.paymentId || null,
          message: error?.message || 'unknown_error',
        });
      });
    } else {
      maybeSendSubscriptionReceiptForSubscription({
        admin: getAdminClient(),
        subscription: updated,
        providerPaymentId: context.paymentId || orderId || updated?.provider_subscription_id,
        amount: payload?.amount ?? updated?.amount,
        currency: payload?.currency || updated?.currency_code,
        paidAt: new Date().toISOString(),
        nextRenewalDate: periodEndIso,
      }).catch((error) => {
        console.warn('[DLOCAL_RECEIPT_EMAIL_SKIPPED]', {
          businessId,
          paymentId: context.paymentId || null,
          message: error?.message || 'unknown_error',
        });
      });
    }
  }

  return {
    ok: true,
    businessId,
    provider: 'dlocal',
    provider_status: updated?.provider_status || providerStatus,
    status: updated?.status || status,
  };
}
