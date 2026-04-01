import { getCountryPricingRow } from '../../config/countryPricing';
import { getAutomaticCheckoutPolicyByStatus } from '../country/market-config';
import { resolveBillingProvider } from './defaultProviderByCountry';

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

const PROVIDER_REASON_LABELS = Object.freeze({
  feature_disabled: 'desactivado en el servidor (revisa BILLING_DLOCAL_ENABLED).',
  missing_provider_env: 'falta configuración de credenciales o URL del proveedor en el servidor.',
  provider_not_supported: 'proveedor no soportado.',
});

/**
 * Texto legible para UI cuando hay reason en billingProvider o en alternativas (p. ej. dLocal caído).
 * @param {string} [provider]
 * @param {string|null|undefined} reason
 * @returns {string|null}
 */
export function describeBillingProviderReason(provider, reason) {
  if (!reason) return null;
  const label = PROVIDER_REASON_LABELS[reason];
  if (label) return label;
  return `${provider || 'proveedor'}: ${reason}`;
}

/** @param {object | null | undefined} billingProvider billingProvider del JSON subscription-state */
export function getBillingUiDiagnostics(billingProvider) {
  if (!billingProvider) return null;
  const parts = [];
  if (billingProvider.reason) {
    const line = describeBillingProviderReason(billingProvider.provider, billingProvider.reason);
    if (line) parts.push(line);
  }
  const dlocalAlt = Array.isArray(billingProvider.alternatives)
    ? billingProvider.alternatives.find((a) => a?.provider === 'dlocal' && a?.reason)
    : null;
  if (dlocalAlt) {
    const line = describeBillingProviderReason('dlocal', dlocalAlt.reason);
    if (line) parts.push(`Medios locales (dLocal) no disponibles: ${line}`);
  }
  return parts.length ? parts.join(' ') : null;
}

/**
 * Mensaje UI: fallback de proveedor (backend) + diagnósticos de billingProvider.
 * @param {object | null | undefined} state - respuesta subscription-state
 */
export function getBillingResolutionUiMessage(state) {
  if (!state) return null;
  const pr = state.providerResolution;
  const parts = [];
  if (pr?.fallbackUsed && pr.fallbackReason) {
    parts.push(
      `Método previsto por país (${pr.primaryCandidate}) no disponible (${pr.fallbackReason}). Activo: ${pr.selectedProvider}.`,
    );
  } else if (pr?.subscriptionProviderOverride) {
    parts.push(`Suscripción asociada al proveedor: ${pr.subscriptionProviderOverride}.`);
  }
  const extra = getBillingUiDiagnostics(state.billingProvider);
  if (extra) parts.push(extra);
  return parts.length ? parts.join(' ') : null;
}

/**
 * Estado local cuando no hay subscription-state remoto.
 * Si existe `business.country_code` (countryCodeDb), resuelve proveedor con `resolveBillingProvider`
 * (CL/AR → mercado_pago, resto → dlocal) para desbloquear UI de /planes.
 */
export function buildBillingFallbackState({ business }) {
  const planExpiresAt = business?.planExpiresAt || null;
  const trialExpiresAt = business?.trialExpiresAt || null;
  const scheduledPlanSlug = business?.scheduledPlanSlug || null;
  const scheduledChangeAt = business?.scheduledChangeAt || null;
  const trialActive = isFutureDate(trialExpiresAt);
  const hasScheduledPaidPlan = !!scheduledPlanSlug && scheduledPlanSlug !== 'starter';
  const billingStatus = trialActive
    ? (hasScheduledPaidPlan ? 'trial_with_subscription' : 'trial_without_subscription')
    : 'active';

  const rawCountry =
    business?.countryCodeDb ??
    business?.routingCountryCode ??
    business?.countryCode ??
    null;
  const billingCountry =
    rawCountry != null && String(rawCountry).trim() !== ''
      ? String(rawCountry).trim().toUpperCase()
      : null;

  let pricingRow = null;
  let resolvedProvider = null;
  let checkoutPolicy = { allowed: false, message: null };

  if (billingCountry) {
    pricingRow = getCountryPricingRow(billingCountry);
    resolvedProvider = resolveBillingProvider(billingCountry);
    checkoutPolicy = getAutomaticCheckoutPolicyByStatus(pricingRow.marketStatus);
  }

  const currency =
    pricingRow?.settlementCurrency ||
    business?.currency ||
    null;

  const providerResolution =
    billingCountry && resolvedProvider
      ? {
          selectedProvider: resolvedProvider,
          primaryCandidate: resolvedProvider,
          fallbackUsed: false,
        }
      : null;

  const billingProvider =
    billingCountry && resolvedProvider
      ? {
          provider: resolvedProvider,
          enabled: true,
          supportsCheckout: checkoutPolicy.allowed !== false,
          supportsSubscriptions: checkoutPolicy.allowed !== false,
          reason: null,
          mode: 'client_fallback',
          alternatives: [],
          recommendedProvider: resolvedProvider,
        }
      : {
          provider: null,
          enabled: false,
          supportsCheckout: false,
          supportsSubscriptions: false,
          reason: 'remote_unavailable',
          mode: 'unknown',
          alternatives: [],
          recommendedProvider: null,
        };

  return {
    ok: true,
    billingCountry,
    currency,
    marketStatus: pricingRow?.marketStatus ?? null,
    checkoutPolicy,
    providerResolution,
    provider: resolvedProvider,
    plan_slug: business?.planSlug || 'starter',
    billing_status: billingStatus,
    has_subscription: hasScheduledPaidPlan,
    has_paid_subscription: hasScheduledPaidPlan,
    activates_after_trial: trialActive && hasScheduledPaidPlan,
    provider_status: null,
    trial_ends_at: trialExpiresAt,
    subscription_starts_at: scheduledChangeAt,
    current_period_ends_at: planExpiresAt,
    charge_after_trial: trialActive && hasScheduledPaidPlan,
    billingProvider,
  };
}

export async function getBillingStatusSafe({
  business,
  authLoading,
  isAuthenticated,
  user,
  getAccessToken,
}) {
  // Endpoint oficial UI para estado de suscripción/billing: /api/v1/billing/subscription-state
  // (current-subscription queda solo para compat temporal).
  // Fallback se usa solo cuando no es posible leer el estado remoto
  // (token ausente/expirado, error HTTP o red). Puede quedar desincronizado
  // respecto a eventos backend (webhooks/cambios de plan), por eso se marca stale.
  const fallbackState = buildBillingFallbackState({ business });
  const fallbackBillingReady = !!fallbackState?.providerResolution?.selectedProvider;
  const hasLocalData = hasMinimumLocalBillingData(business);

  if (!business?.id || authLoading || !isAuthenticated || !user) {
    console.info('[billing-status] skipped remote fetch: missing business/session context');
    return {
      state: fallbackState,
      source: 'fallback',
      isStale: true,
      shouldShowNeutralNotice: !hasLocalData,
      remoteError: null,
      billingReady: false,
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
      remoteError: null,
      billingReady: false,
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
        hint: data?.hint || null,
        hasBearer: !!token,
      });
      return {
        state: fallbackState,
        source: 'fallback',
        isStale: true,
        shouldShowNeutralNotice: !hasLocalData,
        billingReady: fallbackBillingReady,
        remoteError: {
          httpStatus: res.status,
          code: data?.code ?? null,
          error: data?.error ?? null,
          hint: data?.hint ?? null,
          details: data?.details ?? null,
        },
      };
    }
    console.info('[billing-status] loaded from api', {
      provider: data?.billingProvider?.provider || data?.provider || null,
      billing_status: data?.billing_status || null,
      selectedProvider: data?.providerResolution?.selectedProvider ?? null,
    });
    return {
      state: data,
      source: 'remote',
      isStale: false,
      shouldShowNeutralNotice: false,
      remoteError: null,
      billingReady: true,
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
      billingReady: fallbackBillingReady,
      remoteError: {
        httpStatus: null,
        code: 'NETWORK_OR_PARSE',
        error: err?.message || 'network_error',
        hint: 'No se pudo contactar al servidor de facturación. Revisa tu conexión.',
        details: null,
      },
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
