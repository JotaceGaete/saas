import { HttpError } from '../../lib/http/HttpError.js';
import {
  getBillingSubscriptionByBusinessId,
  upsertBillingSubscriptionByBusiness,
} from '../../repositories/billingSubscriptionRepository.js';
import { createSubscription as createPaypalSubscription, getSubscription as getPaypalSubscription } from '../paypal/subscriptionService.js';
import { mapProviderStatus } from './billingStatusMapper.js';
import { normalizeBillingProvider, getPaymentOptions } from './providerSelectionService.js';
import { getBillingProviderAvailability } from './providerAvailabilityService.js';

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
  const businessCountryCode = business?.country_code || business?.countryCode || null;
  const paymentOptions = getPaymentOptions({ countryCode: businessCountryCode });
  const explicitProvider = normalizeBillingProvider(providerHint);
  if (providerHint && !explicitProvider) {
    throw new HttpError(400, `Unsupported billing provider: ${providerHint}`, {
      code: 'INVALID_PROVIDER',
      details: { providerHint },
    });
  }

  let provider = explicitProvider || paymentOptions.primary;
  if (provider === 'dlocal') {
    console.warn(`[billing] dlocal_disabled businessId=${business?.id || 'unknown'} requestedProvider=dlocal fallback=paypal`);
    provider = 'paypal';
  }
  let availability = getBillingProviderAvailability({ provider });
  const alternatives = paymentOptions.secondary.map((p) => getBillingProviderAvailability({ provider: p }));

  console.info('[BILLING_PROVIDER_SELECTION]', {
    route: '/api/v1/billing/subscriptions/create',
    businessId: business?.id || null,
    planSlug: normalizedPlan,
    businessCountryCode,
    requestedProvider: explicitProvider || null,
    selectedProvider: provider,
    availability,
    alternatives,
  });
  console.info(`[billing-provider] country=${String(businessCountryCode || 'NA').toUpperCase()} provider=${provider}`);

  if ((!availability.enabled || !availability.supportsCheckout) && !explicitProvider) {
    const fallback = alternatives.find((item) => item.enabled && item.supportsCheckout);
    if (fallback) {
      provider = fallback.provider;
      availability = fallback;
    }
  }

  if (!availability.enabled || !availability.supportsCheckout) {
    throw new HttpError(422, `[billing] Provider ${provider} is not ready`, {
      code: 'PROVIDER_NOT_READY',
      provider,
      details: {
        selectedProvider: provider,
        availability,
        alternatives,
        businessCountryCode,
      },
    });
  }

  if (provider === 'mercado_pago') {
    return {
      ok: true,
      provider: 'mercado_pago',
      mode: 'client_side_checkout',
      message: 'MercadoPago se procesa con el flujo existente del frontend.',
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
