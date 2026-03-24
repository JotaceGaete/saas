function isFutureDate(value) {
  if (!value) return false;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

function hasMinimumLocalBillingData(business) {
  return !!(
    business?.planSlug
    || business?.planExpiresAt
    || business?.trialExpiresAt
    || business?.scheduledPlanSlug
    || business?.scheduledChangeAt
  );
}

export function buildBillingFallbackState({ business, paymentProvider, checkoutProvider }) {
  const planExpiresAt = business?.planExpiresAt || null;
  const trialExpiresAt = business?.trialExpiresAt || null;
  const scheduledPlanSlug = business?.scheduledPlanSlug || null;
  const scheduledChangeAt = business?.scheduledChangeAt || null;
  const trialActive = isFutureDate(trialExpiresAt);
  const hasScheduledPaidPlan = !!scheduledPlanSlug && scheduledPlanSlug !== 'starter';
  const billingStatus = trialActive
    ? (hasScheduledPaidPlan ? 'trial_with_subscription' : 'trial_without_subscription')
    : 'active';

  return {
    ok: true,
    provider: checkoutProvider || paymentProvider,
    plan_slug: business?.planSlug || 'starter',
    billing_status: billingStatus,
    has_subscription: hasScheduledPaidPlan,
    provider_status: null,
    trial_ends_at: trialExpiresAt,
    subscription_starts_at: scheduledChangeAt,
    current_period_ends_at: planExpiresAt,
    charge_after_trial: trialActive && hasScheduledPaidPlan,
    billingProvider: {
      provider: paymentProvider,
      enabled: true,
      supportsCheckout: true,
      supportsSubscriptions: true,
      reason: null,
      mode: 'fallback',
      alternatives: [],
      recommendedProvider: paymentProvider,
    },
  };
}

export async function getBillingStatusSafe({
  business,
  authLoading,
  isAuthenticated,
  user,
  paymentProvider,
  checkoutProvider,
  getAccessToken,
}) {
  // Fallback se usa solo cuando no es posible leer el estado remoto
  // (token ausente/expirado, error HTTP o red). Puede quedar desincronizado
  // respecto a eventos backend (webhooks/cambios de plan), por eso se marca stale.
  const fallbackState = buildBillingFallbackState({
    business,
    paymentProvider,
    checkoutProvider,
  });
  const hasLocalData = hasMinimumLocalBillingData(business);

  if (!business?.id || authLoading || !isAuthenticated || !user) {
    console.info('[billing-status] skipped remote fetch: missing business/session context');
    return {
      state: fallbackState,
      source: 'fallback',
      isStale: true,
      shouldShowNeutralNotice: !hasLocalData,
    };
  }

  const token = await getAccessToken();
  if (!token) {
    console.warn('[billing-status] missing valid bearer token; using fallback');
    return {
      state: fallbackState,
      source: 'fallback',
      isStale: true,
      shouldShowNeutralNotice: !hasLocalData,
    };
  }

  try {
    const query = new URLSearchParams({ businessId: business.id });
    const res = await fetch(`/api/v1/billing/subscription-state?${query.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      console.warn('[billing-status] endpoint returned non-ok', {
        httpStatus: res.status,
        code: data?.code || null,
        error: data?.error || null,
        hasBearer: !!token,
      });
      return {
        state: fallbackState,
        source: 'fallback',
        shouldShowNeutralNotice: !hasLocalData,
      };
    }
    console.info('[billing-status] loaded from api', {
      provider: data?.billingProvider?.provider || data?.provider || null,
      billing_status: data?.billing_status || null,
    });
    return {
      state: data,
      source: 'remote',
      isStale: false,
      shouldShowNeutralNotice: false,
    };
  } catch (err) {
    console.warn('[billing-status] request failed; using fallback', {
      message: err?.message || 'unknown_error',
    });
    return {
      state: fallbackState,
      source: 'fallback',
      isStale: true,
      shouldShowNeutralNotice: !hasLocalData,
    };
  }
}

/**
 * Hook futuro para sincronización activa cuando detectamos fallback stale.
 * Idea: refrescar backend y/o reconciliar campos locales si hay divergencia.
 * No-op por ahora para no introducir side effects en esta iteración.
 */
export async function syncBillingStateIfStale({ isStale }) {
  if (!isStale) return { attempted: false, reason: 'not_stale' };
  return { attempted: false, reason: 'not_implemented_yet' };
}
