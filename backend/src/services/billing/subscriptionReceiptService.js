import {
  formatReceiptAmount,
  formatReceiptDate,
  getDashboardUrl,
  getPaymentProviderLabel,
  getPlanName,
  getPlanPeriodLabel,
  sendSubscriptionReceiptEmail,
} from '../loops/subscriptionReceiptEmail.js';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

function receiptSentAtFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  return metadata.receipt_email_sent_at || metadata.subscription_receipt_email_sent_at || null;
}

function normalizeMetadata(metadata) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

async function getAuthUserEmailAndName(admin, userId) {
  const id = String(userId || '').trim();
  if (!id || !admin?.auth?.admin?.getUserById) return { email: '', name: '' };
  try {
    const { data } = await admin.auth.admin.getUserById(id);
    const user = data?.user || null;
    return {
      email: user?.email || '',
      name: user?.user_metadata?.name || user?.user_metadata?.full_name || '',
    };
  } catch {
    return { email: '', name: '' };
  }
}

async function updatePaymentReceiptState(admin, paymentId, patch) {
  const id = String(paymentId || '').trim();
  if (!id) return;
  const fullPatch = {
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from('wa_payments').update(fullPatch).eq('id', id);
  if (!error) return;

  const fallbackPatch = {
    metadata: patch.metadata,
    updated_at: fullPatch.updated_at,
  };
  await admin.from('wa_payments').update(fallbackPatch).eq('id', id);
}

async function updateSubscriptionReceiptState(admin, businessId, metadata) {
  const id = String(businessId || '').trim();
  if (!id) return;
  await admin
    .from('billing_subscriptions')
    .update({ metadata_json: metadata, updated_at: new Date().toISOString() })
    .eq('business_id', id);
}

function buildReceiptData({
  email,
  customerName,
  businessName,
  planSlug,
  intervalUnit,
  amount,
  currency,
  provider,
  providerPaymentId,
  subscriptionStatus,
  paidAt,
  nextRenewalDate,
}) {
  return {
    email,
    customerName,
    businessName,
    planName: getPlanName(planSlug),
    planPeriod: getPlanPeriodLabel(intervalUnit),
    amountFormatted: formatReceiptAmount(amount, currency),
    currency: String(currency || '').trim().toUpperCase(),
    paymentProvider: getPaymentProviderLabel(provider),
    paymentId: String(providerPaymentId || '').trim(),
    subscriptionStatus: String(subscriptionStatus || '').trim(),
    paidAtFormatted: formatReceiptDate(paidAt),
    nextRenewalDateFormatted: formatReceiptDate(nextRenewalDate),
    dashboardUrl: getDashboardUrl(),
  };
}

export async function maybeSendSubscriptionReceiptForPayment({
  admin,
  paymentId,
  provider,
  providerPaymentId,
  subscriptionStatus = 'active',
  paidAt,
  nextRenewalDate,
} = {}) {
  const id = String(paymentId || '').trim();
  const client = admin || getAdminClient();
  if (!client || !id) return { ok: true, sent: false, skippedReason: 'missing_payment_id' };

  const { data: payment, error } = await client
    .from('wa_payments')
    .select('id, business_id, user_id, plan_slug, amount, currency, status, provider, provider_payment_id, mp_payment_id, plan_activated_at, plan_expires_at, metadata')
    .eq('id', id)
    .maybeSingle();

  if (error || !payment) {
    return { ok: true, sent: false, skippedReason: 'payment_not_found' };
  }

  const metadata = normalizeMetadata(payment.metadata);
  if (receiptSentAtFromMetadata(metadata)) {
    return { ok: true, sent: false, skippedReason: 'receipt_already_sent' };
  }

  const { data: business } = await client
    .from('wa_businesses')
    .select('id, name, email')
    .eq('id', payment.business_id)
    .maybeSingle();
  const authUser = await getAuthUserEmailAndName(client, payment.user_id);
  const email = authUser.email || business?.email || '';
  const receiptData = buildReceiptData({
    email,
    customerName: authUser.name || business?.name || '',
    businessName: business?.name || '',
    planSlug: payment.plan_slug,
    intervalUnit: 'month',
    amount: payment.amount,
    currency: payment.currency,
    provider: provider || payment.provider,
    providerPaymentId: providerPaymentId || payment.provider_payment_id || payment.mp_payment_id || payment.id,
    subscriptionStatus,
    paidAt: paidAt || payment.plan_activated_at || new Date().toISOString(),
    nextRenewalDate: nextRenewalDate || payment.plan_expires_at || null,
  });
  const result = await sendSubscriptionReceiptEmail(receiptData);

  const nowIso = new Date().toISOString();
  const nextMetadata = {
    ...metadata,
    receipt_email_provider: 'loops',
    receipt_email_payment_provider: provider || payment.provider || null,
    receipt_email_error: result.sent ? null : result.skippedReason || 'send_failed',
    ...(result.sent ? { receipt_email_sent_at: nowIso } : {}),
  };

  await updatePaymentReceiptState(client, payment.id, {
    metadata: nextMetadata,
    receipt_email_provider: 'loops',
    receipt_email_error: result.sent ? null : result.skippedReason || 'send_failed',
    ...(result.sent ? { receipt_email_sent_at: nowIso } : {}),
  });

  return result;
}

export async function maybeSendSubscriptionReceiptForSubscription({
  admin,
  subscription,
  providerPaymentId,
  amount,
  currency,
  paidAt,
  nextRenewalDate,
} = {}) {
  const client = admin || getAdminClient();
  if (!client || !subscription?.business_id) {
    return { ok: true, sent: false, skippedReason: 'missing_subscription' };
  }

  const metadata = normalizeMetadata(subscription.metadata_json);
  if (receiptSentAtFromMetadata(metadata)) {
    return { ok: true, sent: false, skippedReason: 'receipt_already_sent' };
  }

  const { data: business } = await client
    .from('wa_businesses')
    .select('id, name, email, user_id')
    .eq('id', subscription.business_id)
    .maybeSingle();
  const authUser = await getAuthUserEmailAndName(client, business?.user_id);
  const email = metadata.contact_email || metadata.subscriber_email || authUser.email || business?.email || '';

  const receiptData = buildReceiptData({
    email,
    customerName: authUser.name || business?.name || '',
    businessName: business?.name || '',
    planSlug: subscription.plan_slug,
    intervalUnit: subscription.interval_unit || 'month',
    amount: amount ?? subscription.amount,
    currency: currency || subscription.currency_code,
    provider: subscription.provider,
    providerPaymentId: providerPaymentId || subscription.provider_subscription_id,
    subscriptionStatus: subscription.status,
    paidAt: paidAt || subscription.current_period_starts_at || new Date().toISOString(),
    nextRenewalDate: nextRenewalDate || subscription.current_period_ends_at || null,
  });
  const result = await sendSubscriptionReceiptEmail(receiptData);

  const nowIso = new Date().toISOString();
  await updateSubscriptionReceiptState(client, subscription.business_id, {
    ...metadata,
    receipt_email_provider: 'loops',
    receipt_email_payment_provider: subscription.provider || null,
    receipt_email_error: result.sent ? null : result.skippedReason || 'send_failed',
    ...(result.sent ? { receipt_email_sent_at: nowIso } : {}),
  });

  return result;
}
