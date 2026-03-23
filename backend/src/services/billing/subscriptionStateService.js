import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../../lib/http/HttpError.js';
import { getBillingSubscriptionByBusinessId } from '../../repositories/billingSubscriptionRepository.js';
import {
  BILLING_STATUSES,
  isTerminalBillingStatus,
} from './billingStatusMapper.js';

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
    .select('id, plan_slug, trial_expires_at, plan_expires_at')
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

  const trialEndsAt = business?.trial_expires_at || null;
  const trialActive = isFutureDate(trialEndsAt);
  const provider = subscription?.provider || null;
  const providerStatus = subscription?.provider_status || null;
  const subscriptionStatus = subscription?.status || null;
  const hasSubscription = !!subscription
    && !isTerminalBillingStatus(subscriptionStatus)
    && !!subscription?.provider_subscription_id;

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

  return {
    ok: true,
    provider,
    plan_slug: normalizePlanSlug(subscription?.plan_slug || business?.plan_slug),
    billing_status: billingStatus,
    has_subscription: hasSubscription,
    provider_status: providerStatus,
    trial_ends_at: trialEndsAt,
    subscription_starts_at: subscriptionStartsAt,
    current_period_ends_at: subscription?.current_period_ends_at || null,
    charge_after_trial: billingStatus === BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION,
  };
}
