import { HttpError } from '../../lib/http/HttpError.js';
import {
  getBillingSubscriptionByBusinessId,
  upsertBillingSubscriptionByBusiness,
} from '../../repositories/billingSubscriptionRepository.js';
import { createDlocalSubscriptionIntent } from '../providers/dlocal/subscriptionService.js';
import { createSubscription as createPaypalSubscription, getSubscription as getPaypalSubscription } from '../paypal/subscriptionService.js';
import { mapProviderStatus } from './billingStatusMapper.js';
import { normalizeBillingProvider, resolvePrimaryBillingProvider } from './providerSelectionService.js';

function normalizePlanSlug(planSlug) {
  const slug = String(planSlug || '').trim().toLowerCase();
  if (slug === 'full') return 'business';
  if (slug === 'business') return 'business';
  if (slug === 'pro') return 'pro';
  throw new HttpError(400, 'planSlug must be pro or business');
}

function toPaypalInternalPlanSlug(planSlug) {
  return planSlug === 'business' ? 'full' : planSlug;
}

export async function createBillingSubscription({
  business,
  authUser,
  planSlug,
  provider: providerHint,
  returnUrl,
  cancelUrl,
}) {
  const normalizedPlan = normalizePlanSlug(planSlug);
  const explicitProvider = normalizeBillingProvider(providerHint);
  const provider = explicitProvider || resolvePrimaryBillingProvider({
      businessCountryCode: business?.country_code || business?.countryCode || null,
    });
  if (providerHint && !explicitProvider) {
    throw new HttpError(400, `Unsupported billing provider: ${providerHint}`);
  }

  if (provider === 'mercadopago') {
    return {
      ok: true,
      provider: 'mercadopago',
      mode: 'client_side_checkout',
      message: 'MercadoPago se procesa con el flujo existente del frontend.',
    };
  }

  if (provider === 'dlocal') {
    const dlocal = await createDlocalSubscriptionIntent({
      businessId: business.id,
      userId: authUser.id,
      planSlug: normalizedPlan,
      countryCode: business?.country_code || business?.countryCode || null,
      returnUrl,
      cancelUrl,
      subscriberEmail: authUser?.email || null,
    });
    const status = mapProviderStatus('dlocal', dlocal.providerStatus);
    await upsertBillingSubscriptionByBusiness({
      business_id: business.id,
      provider: 'dlocal',
      provider_subscription_id: dlocal.providerSubscriptionId,
      plan_slug: normalizedPlan,
      currency_code: dlocal.currencyCode,
      amount: dlocal.amount,
      interval_unit: 'month',
      status,
      provider_status: dlocal.providerStatus,
      metadata_json: dlocal.metadata || {},
    });
    return {
      ok: true,
      provider: 'dlocal',
      providerSubscriptionId: dlocal.providerSubscriptionId,
      providerStatus: dlocal.providerStatus,
      checkoutUrl: dlocal.checkoutUrl,
      currencyCode: dlocal.currencyCode,
      amount: dlocal.amount,
    };
  }

  if (provider === 'paypal') {
    const paypal = await createPaypalSubscription({
      internalPlanSlug: toPaypalInternalPlanSlug(normalizedPlan),
      userId: authUser.id,
      businessId: business.id,
      subscriberEmail: authUser?.email || null,
      returnUrl,
      cancelUrl,
    });
    const status = mapProviderStatus('paypal', paypal.status || 'APPROVAL_PENDING');
    await upsertBillingSubscriptionByBusiness({
      business_id: business.id,
      provider: 'paypal',
      provider_subscription_id: paypal.id,
      plan_slug: normalizedPlan,
      currency_code: 'USD',
      amount: null,
      interval_unit: 'month',
      status,
      provider_status: paypal.status || 'APPROVAL_PENDING',
      metadata_json: {
        customId: paypal.customId || null,
        paypalPlanId: paypal.paypalPlanId || null,
      },
    });
    return {
      ok: true,
      provider: 'paypal',
      providerSubscriptionId: paypal.id,
      providerStatus: paypal.status || null,
      checkoutUrl: paypal.approveUrl,
      currencyCode: 'USD',
      amount: null,
    };
  }

  throw new HttpError(400, `Unsupported billing provider: ${provider}`);
}

export async function confirmBillingSubscription({ businessId }) {
  const subscription = await getBillingSubscriptionByBusinessId(businessId);
  if (!subscription) {
    return { ok: true, has_subscription: false };
  }

  if (subscription.provider === 'paypal' && subscription.provider_subscription_id) {
    const remote = await getPaypalSubscription(subscription.provider_subscription_id);
    const providerStatus = String(remote?.status || '').trim().toUpperCase() || subscription.provider_status;
    const status = mapProviderStatus('paypal', providerStatus);
    const updated = await upsertBillingSubscriptionByBusiness({
      ...subscription,
      status,
      provider_status: providerStatus,
      starts_at: remote?.start_time || subscription.starts_at || null,
      current_period_ends_at: remote?.billing_info?.next_billing_time || subscription.current_period_ends_at || null,
      metadata_json: {
        ...(subscription.metadata_json || {}),
        remote_status: remote?.status || null,
      },
    });
    return { ok: true, provider: updated.provider, provider_status: updated.provider_status, status: updated.status };
  }

  return {
    ok: true,
    provider: subscription.provider,
    provider_status: subscription.provider_status,
    status: subscription.status,
  };
}
