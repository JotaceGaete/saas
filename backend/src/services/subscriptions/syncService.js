import { getPaypalMode } from '../../config/paypal/index.js';
import { getInternalPlanFromPaypalPlanId, normalizePlanSlugForBilling } from '../billing/planMappingService.js';
import {
  getSubscriptionRecordByPaypalId,
  saveOrUpdateSubscriptionRecord,
} from '../../repositories/paypalSubscriptionRepository.js';
import {
  inferPaypalStatusFromEventType,
  mapPaypalStatusToInternal,
  normalizePaypalEventType,
} from './paypalStateMapper.js';
import {
  getBillingSubscriptionByBusinessId,
  getBillingSubscriptionByProviderSubscriptionId,
  upsertBillingSubscriptionByBusiness,
} from '../../repositories/billingSubscriptionRepository.js';
import { mapProviderStatus } from '../billing/billingStatusMapper.js';
import { maybeSendSubscriptionReceiptForSubscription } from '../billing/subscriptionReceiptService.js';

function normalizeStatus(rawStatus) {
  const value = String(rawStatus || '').trim().toUpperCase();
  return value || null;
}

function parseCustomId(rawCustomId) {
  const value = String(rawCustomId || '').trim();
  if (!value) return { userId: null, businessId: null, customId: null };
  if (value.startsWith('business:')) {
    return { businessId: value.slice('business:'.length) || null, userId: null, customId: value };
  }
  if (value.startsWith('user:')) {
    return { userId: value.slice('user:'.length) || null, businessId: null, customId: value };
  }
  return { userId: null, businessId: null, customId: value };
}

/**
 * Resuelve business_id de forma priorizada -- nunca depende únicamente del
 * JSON local efímero (paypalSubscriptionRepository, /tmp bajo Vercel, no
 * persiste entre invocaciones serverless):
 *   1. custom_id del propio evento/API call actual (fuente más fresca).
 *   2. billing_subscriptions (Supabase real, durable) por
 *      (provider, provider_subscription_id) -- sobrevive a cualquier
 *      cold start, es la fuente correcta para eventos que llegan mucho
 *      después de la creación de la suscripción (ej. PAYMENT.SALE.COMPLETED
 *      en una renovación, semanas/meses después).
 *   3. JSON local -- último recurso, solo cache/compatibilidad, nunca
 *      requisito.
 * Fallos del lookup durable (red, Supabase caído) se registran y degradan
 * al paso 3 -- nunca inventan ni asocian un business_id incorrecto.
 */
async function resolveBusinessId({ customBusinessId, paypalSubscriptionId, existingBusinessId }) {
  if (customBusinessId) return customBusinessId;

  const id = String(paypalSubscriptionId || '').trim();
  if (id) {
    try {
      const durable = await getBillingSubscriptionByProviderSubscriptionId('paypal', id);
      if (durable?.business_id) return durable.business_id;
    } catch (error) {
      console.warn('[sync-service] durable billing_subscriptions lookup failed', {
        paypalSubscriptionId: id,
        message: error?.message || 'unknown_error',
      });
    }
  }

  return existingBusinessId || null;
}

async function resolveInternalPlanSlug({ internalPlanSlug, paypalPlanId }) {
  const normalized = normalizePlanSlugForBilling(internalPlanSlug);
  if (normalized === 'pro' || normalized === 'full') return normalized;
  if (paypalPlanId) {
    const fromPaypal = await getInternalPlanFromPaypalPlanId(paypalPlanId);
    if (fromPaypal) return fromPaypal;
  }
  return null;
}

function toBusinessPlanSlug(internalPlanSlug) {
  const slug = String(internalPlanSlug || '').trim().toLowerCase();
  if (slug === 'full') return 'business';
  if (slug === 'pro') return 'pro';
  return 'starter';
}

async function mirrorToBillingSubscription({
  businessId,
  paypalSubscriptionId,
  internalPlanSlug,
  providerStatus,
  subscriberEmail,
  startsAt,
  currentPeriodStartsAt,
  currentPeriodEndsAt,
  cancelAtPeriodEnd,
  cancelledAt,
  metadata = {},
}) {
  const business = String(businessId || '').trim();
  if (!business) return null;
  const existing = await getBillingSubscriptionByBusinessId(business).catch(() => null);
  const normalizedProviderStatus = String(providerStatus || '').trim().toUpperCase() || null;
  const status = mapProviderStatus('paypal', normalizedProviderStatus);
  return upsertBillingSubscriptionByBusiness({
    business_id: business,
    provider: 'paypal',
    provider_subscription_id: String(paypalSubscriptionId || '').trim() || null,
    plan_slug: toBusinessPlanSlug(internalPlanSlug),
    currency_code: 'USD',
    amount: null,
    interval_unit: 'month',
    status,
    provider_status: normalizedProviderStatus,
    starts_at: startsAt || null,
    current_period_starts_at: currentPeriodStartsAt || null,
    current_period_ends_at: currentPeriodEndsAt || null,
    cancel_at_period_end: cancelAtPeriodEnd === true,
    cancelled_at: cancelledAt || null,
    metadata_json: {
      ...(existing?.metadata_json || {}),
      ...(metadata || {}),
      subscriber_email: subscriberEmail || null,
    },
  });
}

/**
 * Upsert de snapshot local después de create subscription.
 */
export async function applyCreateSnapshot({
  paypalSubscriptionId,
  paypalPlanId,
  internalPlanSlug,
  status,
  customId,
  userId,
  businessId,
  approveUrl,
  subscriberEmail,
}) {
  const environment = getPaypalMode();
  const planSlug = await resolveInternalPlanSlug({ internalPlanSlug, paypalPlanId });
  const custom = parseCustomId(customId);

  const saved = await saveOrUpdateSubscriptionRecord(environment, {
    paypalSubscriptionId: String(paypalSubscriptionId || '').trim(),
    paypalPlanId: paypalPlanId || null,
    internalPlanSlug: planSlug,
    status: normalizeStatus(status) || 'APPROVAL_PENDING',
    internalStatus: mapPaypalStatusToInternal(status || 'APPROVAL_PENDING'),
    customId: custom.customId,
    userId: String(userId || '').trim() || custom.userId || null,
    businessId: String(businessId || '').trim() || custom.businessId || null,
    approveUrl: approveUrl || null,
    subscriberEmail: String(subscriberEmail || '').trim() || null,
  });
  await mirrorToBillingSubscription({
    businessId: saved?.businessId,
    paypalSubscriptionId: saved?.paypalSubscriptionId,
    internalPlanSlug: saved?.internalPlanSlug,
    providerStatus: saved?.status,
    subscriberEmail: saved?.subscriberEmail,
    metadata: { source: 'applyCreateSnapshot' },
  });
  return saved;
}

/**
 * Upsert de snapshot local usando payload de GET subscription de PayPal.
 */
export async function applyRemoteSnapshot(paypalSubscriptionBody) {
  const body = paypalSubscriptionBody || {};
  const paypalSubscriptionId = String(body.id || '').trim();
  if (!paypalSubscriptionId) {
    throw new Error('[sync-service] paypal subscription body missing id');
  }

  const environment = getPaypalMode();
  const existing = await getSubscriptionRecordByPaypalId(environment, paypalSubscriptionId);
  const paypalPlanId = body.plan_id || existing?.paypalPlanId || null;
  const planSlug = await resolveInternalPlanSlug({
    internalPlanSlug: existing?.internalPlanSlug || null,
    paypalPlanId,
  });
  const custom = parseCustomId(body.custom_id || existing?.customId || null);

  const saved = await saveOrUpdateSubscriptionRecord(environment, {
    paypalSubscriptionId,
    paypalPlanId,
    internalPlanSlug: planSlug,
    status: normalizeStatus(body.status) || existing?.status || null,
    internalStatus: mapPaypalStatusToInternal(body.status || existing?.status),
    customId: custom.customId,
    userId: custom.userId || existing?.userId || null,
    businessId: custom.businessId || existing?.businessId || null,
    subscriberEmail: body?.subscriber?.email_address || existing?.subscriberEmail || null,
    approveUrl: existing?.approveUrl || null,
  });
  await mirrorToBillingSubscription({
    businessId: saved?.businessId,
    paypalSubscriptionId: saved?.paypalSubscriptionId,
    internalPlanSlug: saved?.internalPlanSlug,
    providerStatus: saved?.status,
    subscriberEmail: saved?.subscriberEmail,
    startsAt: body?.start_time || null,
    currentPeriodStartsAt: body?.billing_info?.last_payment?.time || null,
    currentPeriodEndsAt: body?.billing_info?.next_billing_time || null,
    cancelAtPeriodEnd: body?.status === 'CANCELLED',
    cancelledAt: body?.status === 'CANCELLED' ? new Date().toISOString() : null,
    metadata: { source: 'applyRemoteSnapshot' },
  }).then((subscription) => {
    if (subscription?.status === 'active') {
      const lastPayment = body?.billing_info?.last_payment || {};
      maybeSendSubscriptionReceiptForSubscription({
        subscription,
        providerPaymentId: lastPayment?.transaction_id || paypalSubscriptionId,
        amount: lastPayment?.amount?.value ?? subscription.amount,
        currency: lastPayment?.amount?.currency_code || subscription.currency_code || 'USD',
        paidAt: lastPayment?.time || subscription.current_period_starts_at || new Date().toISOString(),
        nextRenewalDate: body?.billing_info?.next_billing_time || subscription.current_period_ends_at || null,
      }).catch((error) => {
        console.warn('[PAYPAL_RECEIPT_EMAIL_SKIPPED]', {
          subscriptionId: paypalSubscriptionId,
          businessId: subscription.business_id || null,
          message: error?.message || 'unknown_error',
        });
      });
    }
  });
  return saved;
}

/**
 * Marca cancelación local (sin webhook todavía).
 */
export async function applyCancelSnapshot({ paypalSubscriptionId, reason }) {
  const environment = getPaypalMode();
  const existing = await getSubscriptionRecordByPaypalId(environment, paypalSubscriptionId);
  const saved = await saveOrUpdateSubscriptionRecord(environment, {
    paypalSubscriptionId: String(paypalSubscriptionId || '').trim(),
    paypalPlanId: existing?.paypalPlanId || null,
    internalPlanSlug: existing?.internalPlanSlug || null,
    status: 'CANCELLED',
    internalStatus: 'cancelled',
    customId: existing?.customId || null,
    userId: existing?.userId || null,
    businessId: existing?.businessId || null,
    approveUrl: existing?.approveUrl || null,
    subscriberEmail: existing?.subscriberEmail || null,
    cancelReason: String(reason || '').trim() || null,
  });
  await mirrorToBillingSubscription({
    businessId: saved?.businessId,
    paypalSubscriptionId: saved?.paypalSubscriptionId,
    internalPlanSlug: saved?.internalPlanSlug,
    providerStatus: saved?.status,
    subscriberEmail: saved?.subscriberEmail,
    cancelAtPeriodEnd: true,
    cancelledAt: new Date().toISOString(),
    metadata: { source: 'applyCancelSnapshot', reason: String(reason || '').trim() || null },
  });
  return saved;
}

/**
 * Aplica snapshot local basado en evento webhook PayPal (sin ruta HTTP aún).
 */
export async function applyEventSnapshot({
  eventType,
  paypalSubscriptionId,
  paypalStatus,
  paypalPlanId,
  customId,
  subscriberEmail,
}) {
  const environment = getPaypalMode();
  const existing = await getSubscriptionRecordByPaypalId(environment, paypalSubscriptionId);
  const effectivePaypalStatus = normalizeStatus(paypalStatus)
    || inferPaypalStatusFromEventType(eventType)
    || existing?.status
    || 'APPROVAL_PENDING';
  const planSlug = await resolveInternalPlanSlug({
    internalPlanSlug: existing?.internalPlanSlug || null,
    paypalPlanId: paypalPlanId || existing?.paypalPlanId || null,
  });
  const custom = parseCustomId(customId || existing?.customId || null);
  const resolvedBusinessId = await resolveBusinessId({
    customBusinessId: custom.businessId,
    paypalSubscriptionId,
    existingBusinessId: existing?.businessId,
  });

  const saved = await saveOrUpdateSubscriptionRecord(environment, {
    paypalSubscriptionId: String(paypalSubscriptionId || '').trim(),
    paypalPlanId: paypalPlanId || existing?.paypalPlanId || null,
    internalPlanSlug: planSlug,
    status: effectivePaypalStatus,
    internalStatus: mapPaypalStatusToInternal(effectivePaypalStatus),
    customId: custom.customId,
    userId: custom.userId || existing?.userId || null,
    businessId: resolvedBusinessId,
    subscriberEmail: String(subscriberEmail || '').trim() || existing?.subscriberEmail || null,
    lastEventType: normalizePaypalEventType(eventType),
  });
  await mirrorToBillingSubscription({
    businessId: saved?.businessId,
    paypalSubscriptionId: saved?.paypalSubscriptionId,
    internalPlanSlug: saved?.internalPlanSlug,
    providerStatus: saved?.status,
    subscriberEmail: saved?.subscriberEmail,
    cancelAtPeriodEnd: saved?.status === 'CANCELLED',
    cancelledAt: saved?.status === 'CANCELLED' ? new Date().toISOString() : null,
    metadata: { source: 'applyEventSnapshot', eventType: normalizePaypalEventType(eventType) },
  });
  return saved;
}

