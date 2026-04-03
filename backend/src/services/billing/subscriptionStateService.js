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
import { getPaypalPlanCatalogReadiness } from './planMappingService.js';

const SUB_STATE_LOG = '[billing-subscription-state]';
const MANUAL_BILLING_COUNTRIES = new Set(['CL', 'AR']);

function resolveBillingMode(billingCountryCode) {
  const code = String(billingCountryCode || '').trim().toUpperCase();
  return MANUAL_BILLING_COUNTRIES.has(code) ? 'manual' : 'subscription';
}

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
    .select(
      'id, plan_slug, trial_expires_at, plan_expires_at, country_code, currency, scheduled_plan_slug, scheduled_change_at',
    )
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

/** Último pago aprobado (webhook MP actualiza wa_businesses; billing_subscriptions puede seguir pending_payment). */
async function fetchLatestApprovedWaPayment(businessId) {
  const client = getAdminClient();
  const { data, error } = await client
    .from('wa_payments')
    .select('id, status, plan_slug, metadata, created_at')
    .eq('business_id', businessId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn(`${SUB_STATE_LOG} wa_payments read failed: ${error.message}`);
    return null;
  }
  return data;
}

/**
 * CL/AR + Mercado Pago: reconciliar pending_payment de billing_subscriptions con wa_payments + wa_businesses
 * tras el webhook (misma lógica para Chile y Argentina).
 */
async function applyMercadoPagoManualBillingOverride({
  billingCountry,
  business,
  subscription,
  billingStatus,
  trialActive,
  businessId,
}) {
  const cc = String(billingCountry || '').trim().toUpperCase();
  if (!MANUAL_BILLING_COUNTRIES.has(cc)) return billingStatus;
  // Permitir rows legacy (provider=signup → null) además de rows explícitas mercado_pago.
  // Bloquear solo si hay un provider reconocido que NO es mercado_pago (ej. paypal).
  const subProviderNorm = normalizeBillingProvider(subscription?.provider);
  if (subProviderNorm !== null && subProviderNorm !== 'mercado_pago') return billingStatus;
  if (billingStatus !== BILLING_STATUSES.PENDING_PAYMENT) return billingStatus;

  const approved = await fetchLatestApprovedWaPayment(businessId);
  if (!approved) return billingStatus;

  const bizPlan = normalizePlanSlug(business?.plan_slug);
  const exp = business?.plan_expires_at;
  const scheduled = normalizePlanSlug(business?.scheduled_plan_slug);
  const payPlan = normalizePlanSlug(approved.plan_slug);

  if (trialActive && (scheduled === 'pro' || scheduled === 'business') && payPlan === scheduled) {
    return BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION;
  }

  if (
    !trialActive
    && (bizPlan === 'pro' || bizPlan === 'business')
    && isFutureDate(exp)
  ) {
    return BILLING_STATUSES.ACTIVE;
  }

  return billingStatus;
}

/**
 * PayPal: el usuario completó el acuerdo de cobro (no abandonó en APPROVAL_PENDING).
 * Sin esto no debe mostrarse "pago confirmado" ni trial_with_subscription por fila creada al iniciar checkout.
 */
function isPaypalSubscriptionApprovedForBilling(provider, providerStatus) {
  if (normalizeBillingProvider(provider) !== 'paypal') return true;
  const ps = String(providerStatus || '').trim().toUpperCase();
  if (!ps || ps === 'APPROVAL_PENDING') return false;
  return ['ACTIVE', 'APPROVED', 'SUSPENDED'].includes(ps);
}

/**
 * Plan operativo expuesto en `subscription-state.plan_slug` (fuente de verdad para UI / permisos).
 *
 * Casos validados (plan desde `wa_businesses.plan_slug` = bizPlan):
 * - APPROVAL_PENDING o `billing_status` pending_payment → bizPlan (intento de checkout, no operativo).
 * - Fila `billing_subscriptions.status` cancelled / expired → bizPlan.
 * - PayPal sin estado aprobado operativo (solo ACTIVE / APPROVED / SUSPENDED cuentan) → bizPlan.
 *
 * Caso validado (plan desde `billing_subscriptions`):
 * - Suscripción realmente aprobada/activa (p. ej. PayPal ACTIVE/APPROVED/SUSPENDED) → `subscription.plan_slug` (fallback biz).
 */
function resolveOperationalPlanSlug({
  business,
  subscription,
  billingStatus,
  provider,
  providerStatus,
  paypalAwaitingApproval,
  subscriptionRowStatus,
}) {
  const bizPlan = normalizePlanSlug(business?.plan_slug);
  if (!subscription) return bizPlan;

  const rowStatusNorm = String(subscriptionRowStatus || '').trim().toLowerCase();
  if (isTerminalBillingStatus(rowStatusNorm)) {
    return bizPlan;
  }
  if (billingStatus === BILLING_STATUSES.PENDING_PAYMENT || paypalAwaitingApproval) {
    return bizPlan;
  }
  const p = normalizeBillingProvider(provider);
  if (p === 'paypal' && !isPaypalSubscriptionApprovedForBilling(provider, providerStatus)) {
    return bizPlan;
  }
  /** MP no actualiza billing_subscriptions al aprobar; el plan operativo vive en wa_businesses (y scheduled_* en trial pagado). */
  if (
    p === 'mercado_pago'
    && (billingStatus === BILLING_STATUSES.ACTIVE || billingStatus === BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION)
  ) {
    if (billingStatus === BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION) {
      const sched = normalizePlanSlug(business?.scheduled_plan_slug);
      if (sched === 'pro' || sched === 'business') return sched;
    }
    return normalizePlanSlug(business?.plan_slug || subscription?.plan_slug);
  }
  return normalizePlanSlug(subscription?.plan_slug || business?.plan_slug);
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
  const isSignupTrialRow = subscriptionStatus === BILLING_STATUSES.TRIAL_SIGNUP;
  const hasSubscription = !!subscription
    && !isTerminalBillingStatus(subscriptionStatus)
    && (!!subscription?.provider_subscription_id || isSignupTrialRow);

  const billingCountry = business?.country_code || null;
  const paymentOptions = getPaymentOptions({ countryCode: billingCountry });
  const recommendation = getProviderAvailabilityByBusinessCountry({ businessCountryCode: billingCountry });
  const subscriptionNorm = normalizeBillingProvider(subscription?.provider);
  const billingMode = resolveBillingMode(billingCountry);
  const selectedProvider = recommendation.selectedProvider;
  if (subscriptionNorm && subscriptionNorm !== recommendation.selectedProvider) {
    console.warn(`[billing] legacy_fallback businessId=${id} from=${subscriptionNorm} to=${recommendation.selectedProvider}`);
  }
  const selectedAvailability = getBillingProviderAvailability({ provider: selectedProvider });
  const alternatives = recommendation.alternatives;
  const source = subscription ? 'billing_subscriptions' : 'legacy_wa_businesses';
  if (!subscription) {
    console.warn(`${SUB_STATE_LOG} businessId=${id} source=legacy reason=no_billing_subscription_row`);
  }

  const marketStatus = getMarketStatusForBillingCountry(billingCountry);
  const checkoutPolicy = getAutomaticCheckoutPolicyByMarketStatus(marketStatus);
  const planDisplayCurrency = getPlanDisplayCurrencyForBilling(billingCountry, business?.currency);

  let billingStatus = subscriptionStatus || BILLING_STATUSES.PENDING_PAYMENT;
  const subscriptionStatusNorm = String(subscriptionStatus || '').trim().toLowerCase();
  const providerStatusUpper = String(providerStatus || '').trim().toUpperCase();
  const paypalAwaitingApproval = provider === 'paypal' && providerStatusUpper === 'APPROVAL_PENDING';

  if (!subscription) {
    billingStatus = trialActive
      ? BILLING_STATUSES.TRIAL_WITHOUT_SUBSCRIPTION
      : (normalizePlanSlug(business?.plan_slug) === 'starter'
        ? BILLING_STATUSES.EXPIRED
        : BILLING_STATUSES.ACTIVE);
  } else if (
    subscriptionStatusNorm === BILLING_STATUSES.PENDING_PAYMENT
    || paypalAwaitingApproval
  ) {
    /** Checkout iniciado pero usuario no aprobó en PayPal: mantener pending (UI ámbar), no trial “sin suscripción”. */
    billingStatus = BILLING_STATUSES.PENDING_PAYMENT;
  } else if (trialActive && hasSubscription && isPaypalSubscriptionApprovedForBilling(provider, providerStatus)) {
    billingStatus = BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION;
  } else if (trialActive && (!hasSubscription || !isPaypalSubscriptionApprovedForBilling(provider, providerStatus))) {
    billingStatus = BILLING_STATUSES.TRIAL_WITHOUT_SUBSCRIPTION;
  }

  billingStatus = await applyMercadoPagoManualBillingOverride({
    billingCountry,
    business,
    subscription,
    billingStatus,
    trialActive,
    businessId: id,
  });

  const startsAt = subscription?.starts_at || null;
  const subscriptionStartsAt = billingStatus === BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION
    ? trialEndsAt
    : (startsAt || subscription?.current_period_starts_at || null);
  /** PayPal: aprobación real. Mercado Pago manual: reconciliado arriba vía wa_payments + wa_businesses. */
  let hasPaidSubscription =
    hasSubscription
    && !!provider
    && provider !== 'mercado_pago'
    && isPaypalSubscriptionApprovedForBilling(provider, providerStatus);
  if (
    provider === 'mercado_pago'
    && (billingStatus === BILLING_STATUSES.ACTIVE || billingStatus === BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION)
  ) {
    hasPaidSubscription = true;
  }
  // Patch: para CL/AR con billing_subscriptions legacy (provider=signup → null), hasPaidSubscription
  // queda false porque !!provider = false. Verificar wa_payments directamente como fuente de verdad.
  if (
    billingMode === 'manual'
    && !hasPaidSubscription
    && (billingStatus === BILLING_STATUSES.ACTIVE || billingStatus === BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION)
  ) {
    const approvedWaPayment = await fetchLatestApprovedWaPayment(id);
    if (approvedWaPayment) {
      hasPaidSubscription = true;
      console.info(`${SUB_STATE_LOG} businessId=${id} hasPaidSubscription=true via wa_payments fallback (billing_subscriptions.provider=${subscription?.provider ?? 'none'})`);
    }
  }
  const activatesAfterTrial = billingStatus === BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION
    || (trialActive && hasPaidSubscription);

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

  console.info(`${SUB_STATE_LOG} businessId=${id} source=${source} provider=${selectedProvider || 'unknown'} status=${billingStatus} billingMode=${billingMode}`);
  console.info(
    `[billing-subscription-state-debug] businessId=${id} status=${billingStatus} providerStatus=${providerStatus || 'null'} trialEndsAt=${trialEndsAt || 'null'} currentPeriodEndsAt=${subscription?.current_period_ends_at || 'null'} hasPaidSubscription=${hasPaidSubscription} activatesAfterTrial=${activatesAfterTrial}`,
  );

  const paypalPlanCatalog = await getPaypalPlanCatalogReadiness();
  if (paypalPlanCatalog.ready === false) {
    console.warn(`${SUB_STATE_LOG} paypalPlanCatalog incomplete`, {
      businessId: id,
      environment: paypalPlanCatalog.environment,
      missing_plans: paypalPlanCatalog.missing_plans,
    });
  }

  const operationalPlanSlug = resolveOperationalPlanSlug({
    business,
    subscription,
    billingStatus,
    provider,
    providerStatus,
    paypalAwaitingApproval,
    subscriptionRowStatus: subscriptionStatus,
  });

  return {
    ok: true,
    source,
    billing_mode: billingMode,
    billingCountry,
    currency: planDisplayCurrency,
    marketStatus,
    checkoutPolicy,
    providerResolution,
    provider: selectedProvider,
    plan_slug: operationalPlanSlug,
    billing_status: billingStatus,
    has_subscription: hasSubscription,
    has_paid_subscription: hasPaidSubscription,
    activates_after_trial: activatesAfterTrial,
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
    /** Catálogo PayPal (pro/full): DB `paypal_plan_mappings` o env PAYPAL_PLAN_ID_* */
    paypalPlanCatalog,
  };
}
