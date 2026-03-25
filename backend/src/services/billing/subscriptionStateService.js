import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../../lib/http/HttpError.js';
import { getBillingSubscriptionByBusinessId } from '../../repositories/billingSubscriptionRepository.js';
import {
  BILLING_STATUSES,
  isTerminalBillingStatus,
} from './billingStatusMapper.js';
import { getPaymentOptions, normalizeBillingProvider } from './providerSelectionService.js';
import {
  getBillingProviderAvailability,
  getProviderAvailabilityByBusinessCountry,
  isDlocalFeatureEnabled,
} from './providerAvailabilityService.js';
import {
  getAutomaticCheckoutPolicyByMarketStatus,
  getMarketStatusForBillingCountry,
  getPlanDisplayCurrencyForBilling,
} from './billingMarketMetaService.js';

const SUB_STATE_LOG = '[billing-subscription-state]';

function summarizeAvailability(provider) {
  const a = getBillingProviderAvailability({ provider });
  return {
    provider: a.provider,
    enabled: a.enabled,
    supportsCheckout: a.supportsCheckout,
    supportsSubscriptions: a.supportsSubscriptions,
    reason: a.reason,
    mode: a.mode,
  };
}

/**
 * Snapshot para logs: candidatos, disponibilidad y si hubo fallback respecto al primary por país.
 */
function buildProviderSelectionSnapshot(paymentOptions, recommendation) {
  const unique = [...new Set([paymentOptions.primary, ...paymentOptions.secondary])];
  const availabilityByProvider = {};
  for (const p of unique) {
    availabilityByProvider[p] = summarizeAvailability(p);
  }
  const primarySkipped = recommendation.selectedProvider !== paymentOptions.primary;
  let fallbackReason = null;
  if (primarySkipped) {
    const primarySnap = availabilityByProvider[paymentOptions.primary];
    fallbackReason = primarySnap?.reason || 'primary_unavailable';
  }
  return {
    paymentOptions: { primary: paymentOptions.primary, secondary: [...paymentOptions.secondary] },
    availabilityByProvider,
    selectedProvider: recommendation.selectedProvider,
    selectionMatchesPrimary: !primarySkipped,
    fallbackReason,
    selectedAvailability: summarizeAvailability(recommendation.selectedProvider),
    alternativesSummaries: (recommendation.alternatives || []).map((a) => ({
      provider: a.provider,
      enabled: a.enabled,
      reason: a.reason,
      mode: a.mode,
    })),
    dlocalBackendFlag: isDlocalFeatureEnabled(),
  };
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
    throw new HttpError(503, '[billing-subscription-state] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

async function getBusinessById(businessId) {
  const client = getAdminClient();
  const { data, error } = await client
    .from('wa_businesses')
    .select('id, plan_slug, trial_expires_at, plan_expires_at, country_code, currency')
    .eq('id', businessId)
    .maybeSingle();
  if (error) {
    throw new HttpError(503, `[billing-subscription-state] business read failed: ${error.message}`);
  }
  if (!data) {
    throw new HttpError(404, '[billing-subscription-state] Business not found');
  }
  return data;
}

function isFutureDate(value) {
  if (!value) return false;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

function normalizePlanSlug(planSlug) {
  const raw = String(planSlug || '').trim().toLowerCase();
  if (raw === 'full') return 'business';
  if (raw === 'business') return 'business';
  if (raw === 'pro') return 'pro';
  return 'starter';
}

export async function getBillingSubscriptionState({ businessId }) {
  const id = String(businessId || '').trim();
  if (!id) throw new HttpError(400, 'businessId is required');

  const [business, subscription] = await Promise.all([
    getBusinessById(id),
    getBillingSubscriptionByBusinessId(id),
  ]);
  console.info('[subscription-state] source=billing_subscriptions', {
    hasSubscription: !!subscription,
  });

  const trialEndsAt = business?.trial_expires_at || null;
  const trialActive = isFutureDate(trialEndsAt);
  const provider = normalizeBillingProvider(subscription?.provider) || null;
  const providerStatus = subscription?.provider_status || null;
  const subscriptionStatus = subscription?.status || null;
  const hasSubscription = !!subscription
    && !isTerminalBillingStatus(subscriptionStatus)
    && !!subscription?.provider_subscription_id;

  const billingCountry = business?.country_code || null;
  const paymentOptions = getPaymentOptions({ countryCode: billingCountry });
  const recommendation = getProviderAvailabilityByBusinessCountry({ businessCountryCode: billingCountry });
  const subscriptionNorm = normalizeBillingProvider(subscription?.provider);
  const selectedProvider = subscriptionNorm || recommendation.selectedProvider;
  const selectedAvailability = getBillingProviderAvailability({ provider: selectedProvider });
  const alternatives = recommendation.alternatives;

  const marketStatus = getMarketStatusForBillingCountry(billingCountry);
  const checkoutPolicy = getAutomaticCheckoutPolicyByMarketStatus(marketStatus);
  const planDisplayCurrency = getPlanDisplayCurrencyForBilling(billingCountry, business?.currency);

  let billingStatus = subscriptionStatus || BILLING_STATUSES.PENDING_PAYMENT;
  if (!subscription) {
    billingStatus = trialActive
      ? BILLING_STATUSES.TRIAL_WITHOUT_SUBSCRIPTION
      : (normalizePlanSlug(business?.plan_slug) === 'starter'
        ? BILLING_STATUSES.EXPIRED
        : BILLING_STATUSES.ACTIVE);
  } else if (trialActive && hasSubscription) {
    billingStatus = BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION;
  } else if (trialActive && !hasSubscription) {
    billingStatus = BILLING_STATUSES.TRIAL_WITHOUT_SUBSCRIPTION;
  }

  const startsAt = subscription?.starts_at || null;
  const subscriptionStartsAt = billingStatus === BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION
    ? trialEndsAt
    : (startsAt || subscription?.current_period_starts_at || null);

  const selectionSnapshot = buildProviderSelectionSnapshot(paymentOptions, recommendation);
  console.info(`${SUB_STATE_LOG} structured`, {
    route: 'getBillingSubscriptionState',
    businessId: id,
    billingCountryCode: business?.country_code ?? null,
    subscriptionProviderRaw: subscription?.provider ?? null,
    subscriptionProviderNormalized: provider,
    hasSubscriptionRow: !!subscription,
    ...selectionSnapshot,
  });

  const providerResolution = {
    primaryCandidate: paymentOptions.primary,
    availabilitySelectedProvider: recommendation.selectedProvider,
    selectedProvider,
    fallbackUsed: !selectionSnapshot.selectionMatchesPrimary,
    fallbackReason: selectionSnapshot.fallbackReason,
    availabilityByProvider: selectionSnapshot.availabilityByProvider,
    subscriptionProviderOverride: subscriptionNorm || null,
  };

  return {
    ok: true,
    billingCountry,
    currency: planDisplayCurrency,
    marketStatus,
    checkoutPolicy,
    providerResolution,
    provider,
    plan_slug: normalizePlanSlug(subscription?.plan_slug || business?.plan_slug),
    billing_status: billingStatus,
    has_subscription: hasSubscription,
    provider_status: providerStatus,
    trial_ends_at: trialEndsAt,
    subscription_starts_at: subscriptionStartsAt,
    current_period_ends_at: subscription?.current_period_ends_at || null,
    charge_after_trial: billingStatus === BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION,
    billingProvider: {
      provider: selectedProvider,
      enabled: selectedAvailability.enabled,
      supportsCheckout: selectedAvailability.supportsCheckout,
      supportsSubscriptions: selectedAvailability.supportsSubscriptions,
      reason: selectedAvailability.reason,
      mode: selectedAvailability.mode,
      alternatives,
      recommendedProvider: recommendation.selectedProvider,
    },
  };
}
