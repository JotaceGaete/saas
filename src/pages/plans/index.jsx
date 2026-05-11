import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PanelHeader from 'components/ui/PanelHeader';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PremiumLoader from 'components/ui/PremiumLoader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmedEmailGuard } from '../../hooks/useConfirmedEmailGuard';
import { supabase } from '../../lib/supabase';
import { getAppBaseUrl } from '../../config/appUrl';
import { formatSubscriptionPlanPrice } from '../../utils/formatCLP';
import { PLAN_SLUGS, getPlanLimits, getPlanLabel } from '../../constants/plans';
import {
  normalizeBillingProvider,
  PAYMENT_PROVIDERS,
  getBillingStatusSafe,
  resolveMarket,
  resolveBillingProvider,
  resolveBillingDisplayCurrency,
  getLocaleForBillingDisplayCurrency,
  getPlanPrice,
  getPlanConfig,
  getPlanUnavailableCopy,
} from '../../lib/billing';
import { getPlansActivationWhatsappUrl } from '../../config/plansActivation';
import { SUPPORT_WHATSAPP_NUMBER } from '../../config/support';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { openWhatsAppUrl } from '../../utils/openWhatsAppUrl';
import { trackEvent } from '../../lib/analytics';
import { getCurrentSubscription } from '../../lib/billing/subscriptionService';
import { normalizePlanSlugForBilling } from '../../lib/billing/billingSubscriptionsClient';
import { buildUnifiedSubscriptionViewModel } from '../../lib/billing/unifiedSubscriptionCardModel';
import { useBillingSubscriptionDisplayRow } from '../../hooks/useBillingSubscriptionDisplayRow';
import { resolveCountryState, resolveBillingSetup, logCountryStateDebug } from '../../lib/country/state-model';
import UnifiedSubscriptionCard from './components/UnifiedSubscriptionCard';
import { useToast } from '../../components/ui/Toast';
import { isRestaurantBusiness } from '../../utils/businessType';

const PAYMENT_DEBUG_PREFIX = '[plans-payment-debug]';

/** Copy y alternativa manual bajo el CTA PayPal (sin tocar backend). */
function PayPalCheckoutHelper({ planSlug, onOpenManualPayment }) {
  const handlePayWithCard = () => {
    const plan = String(planSlug || 'unknown').toLowerCase();
    trackEvent('manual_payment_requested', {
      plan,
      provider: 'dlocal_manual',
    });
    onOpenManualPayment?.();
  };

  return (
    <div className="w-full space-y-2 pt-0.5">
      <p className="text-xs text-center leading-snug" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
        Pago automático mensual con tu cuenta PayPal
      </p>
      <p className="text-[11px] text-center leading-snug" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
        Necesitas una cuenta PayPal para usar este método
      </p>
      <div className="pt-2 mt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-[11px] text-center leading-snug" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
          Puedes pagar con tarjeta sin necesidad de tener cuenta PayPal.
        </p>
        <p className="text-[11px] text-center mt-1.5 leading-snug" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
          Te enviaremos un link de pago seguro para completar tu suscripción.
        </p>
        <button
          type="button"
          onClick={handlePayWithCard}
          className="mt-2.5 w-full py-2 px-3 rounded-lg text-xs font-medium transition-colors hover:opacity-90"
          style={{
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-background)',
            fontFamily: 'var(--font-caption)',
          }}
        >
          Pagar con tarjeta
        </button>
      </div>
    </div>
  );
}

function ManualPaymentLinkModal({ open, onClose, planSlug, user, business }) {
  if (!open) return null;
  const message = [
    'Hola, quiero solicitar un link de pago con tarjeta para mi plan en Walinka (prefiero no usar PayPal).',
    planSlug ? `Plan: ${planSlug}` : null,
    `Email: ${user?.email || ''}`,
    `Negocio: ${business?.name || ''}`,
  ].filter(Boolean).join('\n\n');
  const waUrl = buildWhatsAppUrl(message, SUPPORT_WHATSAPP_NUMBER);

  const handleWhatsApp = () => {
    const plan = String(planSlug || 'unknown').toLowerCase();
    trackEvent('manual_payment_whatsapp_continue', {
      plan,
      provider: 'dlocal_manual',
    });
    if (waUrl) openWhatsAppUrl(waUrl);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border p-5 shadow-xl"
        style={{ backgroundColor: '#fff', borderColor: 'var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="manual-payment-title"
      >
        <h3 id="manual-payment-title" className="text-sm font-semibold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
          Pago con tarjeta (link manual)
        </h3>
        <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
          Te enviaremos un enlace seguro para pagar con tarjeta por WhatsApp o email. No necesitas cuenta PayPal.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={handleWhatsApp}
            className="flex-1 py-2.5 px-3 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#25D366', fontFamily: 'var(--font-caption)' }}
          >
            Continuar por WhatsApp
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
            style={{ color: 'var(--color-muted-foreground)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-caption)' }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Badge de confianza bajo el botón "Elegir plan" (método principal). */
function PlanPrimaryTrustBadge({ provider, billingCountryCode }) {
  const n = normalizeBillingProvider(provider);
  if (!n) return null;
  if (n === PAYMENT_PROVIDERS.MANUAL) {
    return (
      <div className="flex justify-center pt-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50/80 px-2.5 py-1 text-[10px] text-slate-600 font-[family-name:var(--font-caption)] max-w-full text-center leading-snug">
          <Icon name="ShieldCheck" size={12} className="text-emerald-600 shrink-0" aria-hidden />
          Activación coordinada por el equipo
        </span>
      </div>
    );
  }
  const label =
    n === PAYMENT_PROVIDERS.MERCADO_PAGO
      ? 'Mercado Pago es el método principal para tu negocio'
      : n === PAYMENT_PROVIDERS.PAYPAL
        ? 'PayPal disponible para tu región'
        : null;
  if (!label) return null;
  return (
    <div className="flex justify-center pt-1">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50/90 px-2.5 py-1 text-[10px] text-slate-600 font-[family-name:var(--font-caption)] max-w-full text-center leading-snug">
        <Icon name="ShieldCheck" size={12} className="text-slate-600 shrink-0" aria-hidden />
        {label}
      </span>
    </div>
  );
}

export default function PlansPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, business, businessLoading, refreshBusiness, loading: authLoading, isAuthenticated } = useAuth();
  const guard = useConfirmedEmailGuard();
  const toast = useToast();
  const [paymentReturnStatus, setPaymentReturnStatus] = useState(null); // 'success' | 'failure' | 'pending' al volver del checkout
  const [loadingPlanSlug, setLoadingPlanSlug] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewPlanSlug, setPreviewPlanSlug] = useState(null);
  const [manualPaymentModalOpen, setManualPaymentModalOpen] = useState(false);
  const [manualPaymentPlanSlug, setManualPaymentPlanSlug] = useState(null);
  const [subscriptionState, setSubscriptionState] = useState(null);

  const openManualPaymentModal = useCallback((planSlug) => {
    setManualPaymentPlanSlug(planSlug ?? null);
    setManualPaymentModalOpen(true);
  }, []);

  const closeManualPaymentModal = useCallback(() => {
    setManualPaymentModalOpen(false);
    setManualPaymentPlanSlug(null);
  }, []);
  const [billingReady, setBillingReady] = useState(false);
  const [billingRemoteError, setBillingRemoteError] = useState(null);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  /** `billing_subscriptions` o, si falta, fila virtual desde `wa_businesses` (legacy). */
  const { row: billingSubscriptionRow, refetch: refetchBillingSubscriptionRow } = useBillingSubscriptionDisplayRow(
    business?.id,
    business?.planSlug,
  );
  const currentPlan = useMemo(() => {
    if (billingSubscriptionRow?._displaySource === 'legacy_wa_businesses' && billingSubscriptionRow?.plan_slug) {
      const n = normalizePlanSlugForBilling(billingSubscriptionRow.plan_slug);
      if (n) return n;
    }
    return currentSubscription?.planSlug || business?.planSlug || 'starter';
  }, [billingSubscriptionRow, currentSubscription?.planSlug, business?.planSlug]);
  /** Fuente de verdad: columna `country_code` en BD (`countryCodeDb`). */
  const businessCountryCode =
    business?.countryCodeDb ?? business?.routingCountryCode ?? business?.countryCode ?? null;
  /** Facturación y precios solo desde el país persistido del negocio (onboarding). */
  const countryState = useMemo(
    () =>
      resolveCountryState({
        businessCountryCode,
        onboardingCountryCode: null,
        userCountryCode: null,
        hostnameSuggestionCountryCode: null,
      }),
    [businessCountryCode],
  );
  const resolvedBillingSetup = useMemo(
    () => resolveBillingSetup(countryState),
    [countryState],
  );
  const market = useMemo(
    () =>
      resolveMarket({
        businessCountryCode,
        userCountryCode: null,
        hostnameCountryCode: null,
      }),
    [businessCountryCode],
  );
  const { countryCode, marketCode } = market;
  const billingCountryForUi = countryState.businessCountry || businessCountryCode || null;
  const isChileBilling = countryState.billingCountry === 'CL';
  const checkoutProvider = useMemo(() => {
    if (!billingReady) return null;
    const raw = subscriptionState?.providerResolution?.selectedProvider
      ?? subscriptionState?.billingProvider?.provider
      ?? null;
    return normalizeBillingProvider(raw);
  }, [
    billingReady,
    subscriptionState?.providerResolution?.selectedProvider,
    subscriptionState?.billingProvider?.provider,
  ]);
  /** Proveedor efectivo para precios en pantalla: servidor si ya cargó; si no, regla por país (CL/AR → MP, resto → PayPal). */
  const effectiveProviderForPlanDisplay = useMemo(() => {
    if (checkoutProvider) return checkoutProvider;
    if (businessCountryCode) return resolveBillingProvider(businessCountryCode);
    return null;
  }, [checkoutProvider, businessCountryCode]);
  /** Moneda mostrada en tarjetas de planes / resumen: por proveedor de facturación, no por moneda del negocio en BD. */
  const planBillingDisplayCurrency = useMemo(() => {
    if (!businessCountryCode || !effectiveProviderForPlanDisplay) return 'USD';
    return resolveBillingDisplayCurrency({
      countryCode: businessCountryCode,
      provider: effectiveProviderForPlanDisplay,
    });
  }, [businessCountryCode, effectiveProviderForPlanDisplay]);
  const planBillingDisplayLocale = useMemo(
    () => getLocaleForBillingDisplayCurrency(planBillingDisplayCurrency),
    [planBillingDisplayCurrency],
  );
  const hasServerSelectedProvider = !!subscriptionState?.providerResolution?.selectedProvider;
  const isManualBillingMode = subscriptionState?.billing_mode === 'manual';
  const hasPersistedBusinessCountry = !!businessCountryCode;
  const secondaryCheckoutProviders = useMemo(() => {
    if (!billingReady || !hasServerSelectedProvider || !checkoutProvider || !Array.isArray(subscriptionState?.billingProvider?.alternatives)) {
      return [];
    }
    return subscriptionState.billingProvider.alternatives
      .map((alt) => normalizeBillingProvider(alt?.provider))
      .filter((provider) => provider && provider !== checkoutProvider);
  }, [billingReady, hasServerSelectedProvider, checkoutProvider, subscriptionState?.billingProvider?.alternatives]);
  const isAutomaticCheckoutBlocked = useMemo(() => {
    if (!hasPersistedBusinessCountry) return true;
    if (!billingReady) return true;
    if (!checkoutProvider) return true;
    if (!hasServerSelectedProvider) return true;
    if (subscriptionState?.checkoutPolicy?.allowed === false) return true;
    return false;
  }, [hasPersistedBusinessCountry, billingReady, checkoutProvider, hasServerSelectedProvider, subscriptionState?.checkoutPolicy?.allowed]);
  const automaticCheckoutBlockedMessage = useMemo(() => {
    if (!hasPersistedBusinessCountry) {
      return 'Tu negocio no tiene un país de facturación persistido. No se puede habilitar el checkout automático.';
    }
    if (!billingReady) {
      return billingRemoteError?.hint
        || 'No se puede iniciar el pago hasta recuperar el estado de facturación del servidor. Recarga la página o inténtalo más tarde.';
    }
    return subscriptionState?.checkoutPolicy?.message
      || 'Este método de pago no está disponible para tu mercado en este momento.';
  }, [hasPersistedBusinessCountry, billingReady, billingRemoteError, subscriptionState?.checkoutPolicy?.message]);
  const checkoutAvailability = subscriptionState?.billingProvider || null;
  const alternativeAvailabilityMap = useMemo(
    () => (
      Array.isArray(subscriptionState?.billingProvider?.alternatives)
        ? Object.fromEntries(subscriptionState.billingProvider.alternatives.map((item) => [item.provider, item]))
        : {}
    ),
    [subscriptionState?.billingProvider?.alternatives, subscriptionState?.billingProvider],
  );
  const getDisplayPlanPrice = (slug) =>
    getPlanPrice({ countryCode: businessCountryCode, planSlug: slug }) ?? 0;
  const planExpiryMs = useMemo(() => {
    const iso = billingSubscriptionRow?.next_billing_date || business?.planExpiresAt;
    return iso ? new Date(iso).getTime() : null;
  }, [billingSubscriptionRow?.next_billing_date, business?.planExpiresAt]);
  const trialExpiryMs = useMemo(() => {
    const iso = billingSubscriptionRow?.trial_ends_at || business?.trialExpiresAt;
    return iso ? new Date(iso).getTime() : null;
  }, [billingSubscriptionRow?.trial_ends_at, business?.trialExpiresAt]);
  const hasFuturePlanExpiry = Number.isFinite(planExpiryMs) && planExpiryMs > Date.now();
  const hasFutureTrialExpiry = Number.isFinite(trialExpiryMs) && trialExpiryMs > Date.now();
  const isPaidPlanSlug = (s) => s === 'pro' || s === 'business';
  /** Trial en plan de pago (Pro o Full): prueba vigente o estado de facturación en trial. */
  const isProTrialActive = useMemo(() => {
    const slug = business?.planSlug || 'starter';
    if (!isPaidPlanSlug(slug)) return false;
    if (hasFutureTrialExpiry) return true;
    const bs = subscriptionState?.billing_status;
    return bs === 'trial_with_subscription' || bs === 'trial_without_subscription';
  }, [business?.planSlug, hasFutureTrialExpiry, subscriptionState?.billing_status]);
  const isTrialWithSubscription = subscriptionState?.billing_status === 'trial_with_subscription';

  const unifiedSubscriptionViewModel = useMemo(
    () =>
      buildUnifiedSubscriptionViewModel({
        business,
        subscriptionState,
        currentPlanSlug: currentPlan,
        billingSubscriptionRow,
      }),
    [business, subscriptionState, currentPlan, billingSubscriptionRow],
  );
  useEffect(() => {
    if (!business?.id || !unifiedSubscriptionViewModel) return;
    const displayState = unifiedSubscriptionViewModel.layout;
    const showActivateCta = unifiedSubscriptionViewModel.showActivateCta !== false;
    const billingMode = unifiedSubscriptionViewModel.billingMode || 'subscription';
    console.info(
      `[billing-ui-debug] businessId=${business.id} displayState=${displayState} showActivateCta=${showActivateCta} billingMode=${billingMode}`,
    );
  }, [business?.id, unifiedSubscriptionViewModel]);
  /** "Suscripción programada" solo si hay downgrade/cambio futuro confirmado en BD, no solo por estar en trial. */
  const showStarterScheduledSubscriptionLabel = isTrialWithSubscription && Boolean(business?.scheduledPlanSlug);
  const isRestaurant = isRestaurantBusiness(business);
  const billingHeroSubtitle = isRestaurant
    ? 'Gestiona el plan de tu restaurante y las herramientas disponibles para tu menú.'
    : 'Administra tu suscripción y el crecimiento de tu tienda.';
  const planNoun = isRestaurant ? 'menú' : 'catálogo';
  /** Obtiene access_token válido para Edge Functions que validan JWT internamente. */
  const getValidAccessToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    let token = (session?.access_token && typeof session.access_token === 'string')
      ? session.access_token.trim()
      : '';
    if (token && token.includes('.')) return token;
    try {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) console.warn(`${PAYMENT_DEBUG_PREFIX} refreshSession error`, refreshError?.message);
      token = (refreshed?.session?.access_token && typeof refreshed.session.access_token === 'string')
        ? refreshed.session.access_token.trim()
        : '';
    } catch (err) {
      console.warn(`${PAYMENT_DEBUG_PREFIX} refreshSession exception`, err?.message || err);
    }
    return token && token.includes('.') ? token : null;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const planPrices = PLAN_SLUGS.reduce((acc, slug) => ({ ...acc, [slug]: getDisplayPlanPrice(slug) }), {});
    console.log('[plans-debug] hostname:', window.location?.hostname);
    console.log('[plans-debug] billing market:', marketCode, 'planBillingCurrency:', planBillingDisplayCurrency, 'checkoutProvider:', checkoutProvider, 'billingReady:', billingReady);
    console.log('[plans-debug] plan prices:', planPrices);
    console.info(PAYMENT_DEBUG_PREFIX, { event: 'provider_resolution', countryCode, marketCode, checkoutProvider, billingReady });
    logCountryStateDebug({
      uxCountry: countryState.uxCountry,
      businessCountry: countryState.businessCountry,
      billingCountry: countryState.billingCountry,
      provider: checkoutProvider,
      currency: planBillingDisplayCurrency,
    });
  }, [
    countryCode,
    marketCode,
    checkoutProvider,
    billingReady,
    planBillingDisplayCurrency,
    countryState.uxCountry,
    countryState.businessCountry,
    countryState.billingCountry,
    businessCountryCode,
  ]);

  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success') {
      setPaymentReturnStatus('success');
      toast?.info?.('Verificando tu pago…');
      setSearchParams({}, { replace: true });
      refreshBusiness?.();
    } else if (payment === 'failure' || payment === 'failed') {
      toast?.error?.('El pago no pudo completarse. Intenta de nuevo.');
      setSearchParams({}, { replace: true });
    } else if (payment === 'pending') {
      toast?.info?.('Pago pendiente. Cuando se acredite, tu plan se actualizará.');
      setSearchParams({}, { replace: true });
    } else if (payment === 'error') {
      toast?.error?.('No se pudo verificar el retorno del pago. Revisa tu plan o intenta de nuevo.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, refreshBusiness, toast]);

  // Fuente de verdad: subscription-state (PayPal + MP tras override). Polling: webhook puede llegar unos segundos después del redirect.
  useEffect(() => {
    if (paymentReturnStatus !== 'success' || !user || businessLoading) return;
    let cancelled = false;
    (async () => {
      const POLL_MS = 2000;
      const MAX_ATTEMPTS = 10;

      const pollSubscriptionStateOnce = async (token, businessId) => {
        try {
          const q = new URLSearchParams({ businessId });
          const r = await fetch(`/api/v1/billing/subscription-state?${q}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const sd = await r.json().catch(() => ({}));
          if (!cancelled && r.ok && sd?.ok) {
            const bs = sd?.billing_status;
            if (bs === 'active' || bs === 'trial_with_subscription') return { ok: true };
          }
        } catch {
          /* red o parse: siguiente intento */
        }
        return { ok: false };
      };

      // 1. Polling subscription-state (mismo criterio que PaypalSuccessPage)
      try {
        const token = await getValidAccessToken();
        if (token && business?.id) {
          for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            if (cancelled) return;
            if (attempt > 0) await new Promise((r) => setTimeout(r, POLL_MS));
            if (cancelled) return;
            const { ok } = await pollSubscriptionStateOnce(token, business.id);
            if (ok) {
              setPaymentReturnStatus(null);
              toast?.success?.('Plan activado correctamente.');
              await refetchBillingSubscriptionRow();
              return;
            }
          }
        }
      } catch {
        // seguir a fallback wa_payments
      }
      if (cancelled) return;

      // 2. Fallback: wa_payments (MercadoPago si el webhook aún no reflejó en subscription-state)
      const { data: lastPayment } = await supabase
        .from('wa_payments')
        .select('id, status, plan_slug, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setPaymentReturnStatus(null);
      if (!lastPayment) {
        toast?.info?.('El pago está en proceso. Cuando se acredite, tu plan se actualizará.');
        return;
      }
      const createdMs = lastPayment.created_at ? new Date(lastPayment.created_at).getTime() : NaN;
      const isRecentPayment = Number.isFinite(createdMs) && Date.now() - createdMs < 25 * 60 * 1000;
      if (lastPayment.status === 'approved' && isRecentPayment) {
        toast?.success?.('Pago realizado. Tu plan se ha actualizado.');
        if (business?.id && !cancelled) {
          await refetchBillingSubscriptionRow();
        }
      } else if (lastPayment.status === 'approved' && !isRecentPayment) {
        toast?.info?.('Volviste desde el checkout. Si el pago ya se acreditó, el plan se actualizará en breve; si no, puedes intentar de nuevo.');
        if (business?.id && !cancelled) {
          await refetchBillingSubscriptionRow();
        }
      } else if (lastPayment.status === 'cancelled' || lastPayment.status === 'rejected') {
        toast?.error?.('El pago no pudo completarse. Intenta de nuevo.');
      } else {
        toast?.info?.('El pago está en proceso. Cuando se acredite, tu plan se actualizará.');
      }
    })();
    return () => { cancelled = true; };
  }, [paymentReturnStatus, user, businessLoading, business?.id, refetchBillingSubscriptionRow]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getBillingStatusSafe({
        business,
        authLoading,
        isAuthenticated,
        user,
        getAccessToken: getValidAccessToken,
      });
      if (cancelled) return;
      setSubscriptionState(result.state);
      setBillingReady(result.billingReady === true);
      setBillingRemoteError(result.remoteError ?? null);
      if (result.isStale === true) {
        console.warn('[billing-status] using fallback state');
      }
    })();
    return () => { cancelled = true; };
  }, [business, authLoading, isAuthenticated, user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!business?.id) {
        if (!cancelled) setCurrentSubscription(null);
        return;
      }
      const data = await getCurrentSubscription(business.id);
      if (!cancelled) setCurrentSubscription(data);
    })();
    return () => { cancelled = true; };
  }, [business?.id]);

  const fetchPlanPreview = async (targetPlanSlug) => {
    const token = await getValidAccessToken();
    if (!token) return null;
    const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
    const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
    const body = { targetPlanSlug, provider: checkoutProvider };
    const res = await fetch(`${supabaseUrl}/functions/v1/plan-change-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return res.json().catch(() => null);
  };

  /** Planes internacionales: abre resumen (preview) y luego activación por WhatsApp. */
  const handleOpenIntlPlanPreview = async (planSlug) => {
    if (guard.isBlocked) {
      guard.runIfConfirmed(() => {});
      return;
    }
    console.info(PAYMENT_DEBUG_PREFIX, { event: 'click_plan_button', handler: 'handleOpenIntlPlanPreview', planSlug, resolvedCountryCode: countryCode });
    if (getDisplayPlanPrice(planSlug) <= 0) return;
    setLoadingPlanSlug(planSlug);

    setPreview(null);
    setPreviewPlanSlug(null);
    try {
      if (authLoading) {
        toast.info('Cargando sesión. Intenta nuevamente en unos segundos.');
        return;
      }
      if (!isAuthenticated || !user) {
        toast.error('Debes iniciar sesión para contratar un plan.');
        navigate('/login');
        return;
      }
      const token = await getValidAccessToken();
      if (!token) {
        toast.error('Debes iniciar sesión para contratar un plan.');
        navigate('/login');
        return;
      }
      const previewData = await fetchPlanPreview(planSlug);
      if (!previewData) {
        toast.error('No se pudo obtener el resumen del cambio de plan.');
        return;
      }
      if (previewData.changeType === 'downgrade') {
        toast.info(previewData.message || 'El cambio se aplicará al vencer tu plan actual. No se realiza ningún cargo.');
        return;
      }
      setPreview(previewData);
      setPreviewPlanSlug(planSlug);
    } catch (err) {
      toast.error(err?.message || 'Error al cargar el resumen.');
    } finally {
      setLoadingPlanSlug(null);
    }
  };

  const handlePayWithMercadoPago = async (planSlug) => {
    if (guard.isBlocked) {
      guard.runIfConfirmed(() => {});
      return;
    }
    console.info(PAYMENT_DEBUG_PREFIX, {
      event: 'click_plan_button',
      handler: 'handlePayWithMercadoPago',
      planSlug,
      resolvedCountryCode: countryCode,
      resolvedProvider: checkoutProvider,
    });
    if (getDisplayPlanPrice(planSlug) <= 0) return;
    if (isAutomaticCheckoutBlocked) {
      toast.info(automaticCheckoutBlockedMessage);
      return;
    }
    setLoadingPlanSlug(planSlug);

    setPreview(null);
    setPreviewPlanSlug(null);
    try {
      if (authLoading) {
        toast.info('Cargando sesión. Intenta nuevamente en unos segundos.');
        return;
      }
      if (!isAuthenticated || !user) {
        toast.error('Debes iniciar sesión para contratar un plan.');
        navigate('/login');
        return;
      }
      const token = await getValidAccessToken();
      if (!token) {
        toast.error('Debes iniciar sesión para contratar un plan.');
        navigate('/login');
        return;
      }
      const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
      if (!!anonKey && token === anonKey) {
        toast.error('Error de autenticación: token inválido.');
        return;
      }

      const previewData = await fetchPlanPreview(planSlug);
      if (!previewData) {
        toast.error('No se pudo obtener el resumen del cambio de plan.');
        return;
      }

      if (previewData.changeType === 'downgrade') {
        toast.info(previewData.message || 'El cambio se aplicará al vencer tu plan actual. No se realiza ningún cargo.');
        return;
      }

      setPreview(previewData);
      setPreviewPlanSlug(planSlug);
    } catch (err) {
      toast.error(err?.message || 'Error al cargar el resumen.');
    } finally {
      setLoadingPlanSlug(null);
    }
  };

  const handlePayWithPaypal = async (planSlug) => {
    if (guard.isBlocked) {
      guard.runIfConfirmed(() => {});
      return;
    }
    console.info(PAYMENT_DEBUG_PREFIX, {
      event: 'click_plan_button',
      handler: 'handlePayWithPaypal',
      planSlug,
      resolvedCountryCode: countryCode,
      resolvedProvider: checkoutProvider,
    });
    if (getDisplayPlanPrice(planSlug) <= 0) return;
    console.info(`[billing-cta] provider=paypal plan=${planSlug} action=start`);
    if (isAutomaticCheckoutBlocked) {
      toast.info(automaticCheckoutBlockedMessage);
      return;
    }
    setLoadingPlanSlug(planSlug);

    setPreview(null);
    setPreviewPlanSlug(null);
    try {
      if (authLoading) {
        toast.info('Cargando sesión. Intenta nuevamente en unos segundos.');
        return;
      }
      if (!isAuthenticated || !user || !business?.id) {
        toast.error('Debes iniciar sesión y tener un negocio activo para suscribirte.');
        navigate('/login');
        return;
      }
      const token = await getValidAccessToken();
      if (!token) {
        toast.error('Debes iniciar sesión para suscribirte.');
        navigate('/login');
        return;
      }

      const previewData = await fetchPlanPreview(planSlug);
      if (!previewData) {
        toast.error('No se pudo obtener el resumen del cambio de plan.');
        return;
      }
      if (previewData.changeType === 'downgrade') {
        toast.info(previewData.message || 'El cambio se aplicará al vencer tu plan actual. No se realiza ningún cargo.');
        return;
      }
      // Internacional (PayPal): iniciar checkout directo para evitar CTA sin acción visible.
      await confirmPayWithProvider(PAYMENT_PROVIDERS.PAYPAL, { planSlugOverride: planSlug });
    } catch (err) {
      console.error(`[billing-cta] provider=paypal plan=${planSlug} error=${err?.message || 'unknown_error'}`);
      toast.error(err?.message || 'Error al iniciar PayPal.');
    } finally {
      setLoadingPlanSlug(null);
    }
  };

  const confirmActivationViaWhatsApp = () => {
    if (guard.isBlocked) {
      guard.runIfConfirmed(() => {});
      return;
    }
    if (!previewPlanSlug) return;
    const url = getPlansActivationWhatsappUrl(user?.email);
    if (typeof window !== 'undefined') {
      openWhatsAppUrl(url);
    }
    toast.info('Se abrió WhatsApp para que coordinemos la activación de tu plan. Si no se abrió, revisa el bloqueador de ventanas emergentes.');
    setPreview(null);
    setPreviewPlanSlug(null);
  };

  const confirmPayWithMercadoPago = async () => {
    if (guard.isBlocked) {
      guard.runIfConfirmed(() => {});
      return;
    }
    console.info(PAYMENT_DEBUG_PREFIX, {
      event: 'confirm_payment',
      handler: 'confirmPayWithMercadoPago',
      planSlug: previewPlanSlug,
      resolvedCountryCode: countryCode,
    });
    if (!previewPlanSlug) return;
    if (isAutomaticCheckoutBlocked) {
      toast.info(automaticCheckoutBlockedMessage);
      return;
    }
    setLoadingPlanSlug(previewPlanSlug);

    try {
      if (authLoading) {
        toast.info('Cargando sesión. Intenta nuevamente en unos segundos.');
        return;
      }
      if (!isAuthenticated || !user) {
        toast.error('Debes iniciar sesión.');
        navigate('/login');
        return;
      }
      const token = await getValidAccessToken();
      if (!token) {
        toast.error('Debes iniciar sesión.');
        navigate('/login');
        return;
      }
      const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
      console.info(PAYMENT_DEBUG_PREFIX, {
        event: 'create_mp_preference_request',
        hasAuthorizationHeader: !!token,
        authorizationLooksLikeJwt: token.includes('.'),
        tokenLength: token?.length ?? 0,
        hasApiKeyHeader: !!anonKey,
      });
      // Conservar el host actual para no redirigir a otro país tras el pago
      const returnBaseUrl = (typeof window !== 'undefined' && window.location?.origin)
        ? window.location.origin.replace(/\/$/, '')
        : (getAppBaseUrl() || '');
      const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
      const res = await fetch(`${supabaseUrl}/functions/v1/create-mp-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
        body: JSON.stringify({
          planSlug: previewPlanSlug,
          success_url: `${returnBaseUrl}/planes?payment=success`,
          failure_url: `${returnBaseUrl}/planes?payment=failure`,
          pending_url: `${returnBaseUrl}/planes?payment=pending`,
          origin: returnBaseUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.changeType === 'downgrade') {
          toast.info(data?.message || 'El cambio se aplicará al vencer tu plan actual.');
          setPreview(null);
          setPreviewPlanSlug(null);
          return;
        }
        throw new Error(data?.error ?? res.statusText ?? 'Error al crear preferencia de pago');
      }
      if (data?.error) throw new Error(data.error);
      if (data?.applied) {
        toast.success('Plan actualizado correctamente. No se requirió pago (crédito por tiempo restante).');
        setPreview(null);
        setPreviewPlanSlug(null);
        await refreshBusiness?.();
        if (business?.id) {
          await refetchBillingSubscriptionRow();
        }
        return;
      }
      if (data?.init_point) {
        window.location.href = data.init_point;
        return;
      }
      throw new Error('No se recibió enlace de pago');
    } catch (err) {
      toast.error(err?.message || 'Error al iniciar el pago.');
    } finally {
      setLoadingPlanSlug(null);
    }
  };

  const confirmPayWithProvider = async (provider, options = {}) => {
    if (guard.isBlocked) {
      guard.runIfConfirmed(() => {});
      return;
    }
    const targetPlanSlug = String(options?.planSlugOverride || previewPlanSlug || '').trim().toLowerCase();
    if (!targetPlanSlug) return;
    if (isAutomaticCheckoutBlocked) {
      toast.info(automaticCheckoutBlockedMessage);
      return;
    }
    setLoadingPlanSlug(targetPlanSlug);

    try {
      if (authLoading) {
        toast.info('Cargando sesión. Intenta nuevamente en unos segundos.');
        return;
      }
      if (!isAuthenticated || !user || !business?.id) {
        toast.error('Debes iniciar sesión y tener un negocio activo para suscribirte.');
        navigate('/login');
        return;
      }
      const token = await getValidAccessToken();
      if (!token) {
        toast.error('Debes iniciar sesión para suscribirte.');
        navigate('/login');
        return;
      }

      const normalizedProvider = normalizeBillingProvider(provider);
      if (!normalizedProvider) {
        throw new Error(`Proveedor no soportado: ${provider}`);
      }
      if (normalizedProvider === PAYMENT_PROVIDERS.DLOCAL) {
        console.warn('[billing] dlocal_disabled_ui_fallback provider=dlocal fallback=paypal');
      }
      const safeProvider = normalizedProvider === PAYMENT_PROVIDERS.DLOCAL
        ? PAYMENT_PROVIDERS.PAYPAL
        : normalizedProvider;
      console.info(`[billing-cta] provider=${safeProvider} plan=${targetPlanSlug} action=start`);
      const allowedForUi = normalizedProvider === checkoutProvider
        || secondaryCheckoutProviders.includes(normalizedProvider);
      if (!allowedForUi) {
        throw new Error('Este método de pago no está disponible según el estado del servidor.');
      }

      const endpoint = '/api/v1/billing/subscriptions/create';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: safeProvider,
          businessId: business.id,
          planSlug: targetPlanSlug,
          returnUrl: safeProvider === PAYMENT_PROVIDERS.PAYPAL
            ? `${window.location.origin}/billing/paypal/success`
            : `${window.location.origin}/planes?payment=success`,
          cancelUrl: safeProvider === PAYMENT_PROVIDERS.PAYPAL
            ? `${window.location.origin}/billing/paypal/cancel`
            : `${window.location.origin}/planes?payment=failure`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      console.info('[DLOCAL_CLIENT_CHECKOUT_RESPONSE]', {
        ok: data?.ok === true,
        status: data?.status || null,
        paymentId: data?.paymentId || data?.id || null,
        redirectUrl: data?.redirectUrl || data?.redirect_url || data?.checkoutUrl || null,
        hasCheckoutToken: !!(data?.checkout_token || data?.checkoutToken || data?.merchantCheckoutToken),
      });
      if (!res.ok || !data?.ok) {
        if (data?.code === 'PROVIDER_NOT_READY') {
          throw new Error('Este método de pago no está disponible por el momento.');
        }
        if (data?.code === 'PAYPAL_PLAN_MAPPING_MISSING') {
          throw new Error(
            data?.error
            || 'PayPal no está configurado para este plan. Revisa la tabla paypal_plan_mappings o las variables PAYPAL_PLAN_ID_* en el servidor.',
          );
        }
        throw new Error(data?.error || `No se pudo crear la suscripción ${safeProvider} (HTTP ${res.status}).`);
      }
      const redirectUrl = data?.redirectUrl || data?.redirect_url || data?.checkoutUrl || null;
      if (!redirectUrl) {
        console.error(`[billing-cta] provider=${safeProvider} plan=${targetPlanSlug} error=missing_redirect_url`);
        toast.error('No pudimos iniciar PayPal. Intenta nuevamente.');
        throw new Error(`${safeProvider} no devolvió URL de checkout.`);
      }
      console.info(`[billing-cta] provider=${safeProvider} plan=${targetPlanSlug} result=redirect`);
      window.location.assign(redirectUrl);
    } catch (err) {
      const normalizedProvider = normalizeBillingProvider(provider) || String(provider || 'unknown');
      console.error(`[billing-cta] provider=${normalizedProvider} plan=${targetPlanSlug} error=${err?.message || 'unknown_error'}`);
      toast.error(err?.message || `Error al iniciar ${provider}.`);
    } finally {
      setLoadingPlanSlug(null);
    }
  };

  const handleConfirmPrimaryPayment = () => {
    if (checkoutProvider === PAYMENT_PROVIDERS.PAYPAL) return confirmPayWithProvider(PAYMENT_PROVIDERS.PAYPAL);
    if (checkoutProvider === PAYMENT_PROVIDERS.MERCADO_PAGO) return confirmPayWithMercadoPago();
    if (checkoutProvider === PAYMENT_PROVIDERS.MANUAL) return confirmActivationViaWhatsApp();
    toast.error(`Proveedor no soportado para checkout: ${String(checkoutProvider || 'unknown')}`);
    return undefined;
  };

  const cancelPreview = () => {
    setPreview(null);
    setPreviewPlanSlug(null);
  };

  const getSafePreviewTotal = () => {
    if (!preview || !previewPlanSlug) return 0;
    const providerCatalogAmount = getDisplayPlanPrice(preview.targetPlanSlug);
    const reported = Number(preview.finalAmount);
    if (!Number.isFinite(reported)) return providerCatalogAmount;
    // Guardrail: evita mostrar montos CLP como USD (ej. 5990 -> USD).
    if (planBillingDisplayCurrency === 'USD' && reported > 100 && providerCatalogAmount > 0 && providerCatalogAmount <= 20) {
      return providerCatalogAmount;
    }
    return reported;
  };

  const isProviderReadyForCheckout = (provider) => {
    if (!billingReady) return false;
    const normalized = normalizeBillingProvider(provider);
    if (!normalized) return false;
    if (normalized === PAYMENT_PROVIDERS.PAYPAL && subscriptionState?.paypalPlanCatalog?.ready === false) {
      return false;
    }
    if (normalized === checkoutProvider && checkoutAvailability) {
      return checkoutAvailability.enabled === true && checkoutAvailability.supportsCheckout === true;
    }
    const alt = alternativeAvailabilityMap[normalized];
    if (alt) return alt.enabled === true && alt.supportsCheckout === true;
    return false;
  };

  if (businessLoading) {
    return <PremiumLoader fullScreen business={business} />;
  }

  return (
    <DashboardAppShell backgroundColor="#f6f7fb">
        <PanelHeader
          title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Plan y facturación</h1>}
          subtitle={<p className="text-xs hidden sm:block mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{isManualBillingMode ? 'Gestiona tu plan, límites y renovación manual' : 'Gestiona tu plan, límites y renovación'}</p>}
        />
        <DashboardLayoutContent className="page-enter">

          <section className="mb-7 border-b pb-6" style={{ borderColor: 'rgba(17,24,39,0.08)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Suscripción
            </p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em' }}>
              Plan y facturación
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 sm:text-base" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>
              {billingHeroSubtitle}
            </p>
          </section>

          {business?.id && (
            <UnifiedSubscriptionCard
              subscription={currentPlan}
              viewModel={unifiedSubscriptionViewModel}
              onScrollToPlans={() => document.getElementById('planes-grid')?.scrollIntoView({ behavior: 'smooth' })}
            />
          )}

          <div className="mb-4 mt-8 flex flex-col gap-1">
            <h3 className="text-xl font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>
              Elige cómo quieres crecer
            </h3>
            <p className="text-sm leading-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>
              Planes pensados para operar tu {planNoun} sin ruido técnico.
            </p>
          </div>

          <div id="planes-grid" className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {PLAN_SLUGS.map((slug) => {
              const limits = getPlanLimits(slug);
              const isProTrialCard = slug === 'pro' && isProTrialActive;
              const isCurrent = currentPlan === slug && !isProTrialCard;
              const actionLabel = `Elegir plan ${getPlanLabel(slug)}`;
              const isProRecommended = slug === 'pro';
              const marketPlan = getPlanConfig({
                marketCode,
                planSlug: slug,
                countryCode: billingCountryForUi,
              });
              const isPurchasable = marketPlan?.enabled !== false && marketPlan?.purchasable !== false;
              return (
                <div
                  key={slug}
                  className={[
                    'relative rounded-2xl border p-5 flex flex-col transition-all duration-200 hover:-translate-y-0.5',
                    isProRecommended ? 'shadow-[0_18px_40px_rgba(17,24,39,0.08)]' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    backgroundColor: isCurrent ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.72)',
                    borderColor: isCurrent ? 'rgba(17,24,39,0.22)' : 'rgba(17,24,39,0.08)',
                    boxShadow: isCurrent ? '0 0 0 1px rgba(17,24,39,0.14), 0 18px 42px rgba(17,24,39,0.08)' : '0 12px 30px rgba(17,24,39,0.045)',
                  }}
                >
                  {isProRecommended && (
                    <span
                      className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm font-[family-name:var(--font-caption)]"
                      style={{ backgroundColor: '#111827', color: '#fff' }}
                      aria-hidden
                    >
                      Popular
                    </span>
                  )}
                  <div className="flex items-center justify-between mb-4 pt-1">
                    <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.015em' }}>
                      {getPlanLabel(slug)}
                    </h2>
                    {isCurrent && (
                      <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(17,24,39,0.08)', color: '#111827' }}>
                        Actual
                      </span>
                    )}
                  </div>
                  <div className="mb-4">
                    {getDisplayPlanPrice(slug) === 0 ? (
                      <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>
                        Gratis
                      </p>
                    ) : (
                      <p
                        className={
                          planBillingDisplayCurrency === 'CLP'
                            ? 'text-3xl font-semibold text-slate-950 tracking-tight'
                            : 'text-2xl font-bold text-slate-900'
                        }
                        style={{ fontFamily: 'var(--font-heading)' }}
                      >
                        {formatSubscriptionPlanPrice(getDisplayPlanPrice(slug), planBillingDisplayCurrency, planBillingDisplayLocale)}
                      </p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                      {getDisplayPlanPrice(slug) === 0 ? '' : `por mes · ${planBillingDisplayCurrency}`}
                    </p>
                  </div>
                  <ul className="space-y-2 mb-6 flex-1">
                    <li className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-600" style={{ backgroundColor: 'rgba(17,24,39,0.06)' }} aria-hidden>
                        <Icon name="Package" size={16} color="currentColor" />
                      </span>
                      <span>
                        <span className="font-semibold text-slate-800">Productos</span>
                        {' · '}
                        {limits.maxProducts == null ? 'Ilimitados' : limits.maxProducts}
                      </span>
                    </li>
                    <li className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-600" style={{ backgroundColor: 'rgba(17,24,39,0.06)' }} aria-hidden>
                        <Icon name="ShoppingCart" size={16} color="currentColor" />
                      </span>
                      <span>
                        <span className="font-semibold text-slate-800">Pedidos/mes</span>
                        {' · '}
                        {limits.maxOrdersPerMonth == null ? 'Ilimitados' : limits.maxOrdersPerMonth}
                      </span>
                    </li>
                    {slug === 'starter' && (
                      <>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Sin estadísticas ni ingresos del mes</li>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Sin productos más vendidos</li>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Sin asistencia de IA</li>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Incluye branding de Walinka en mensajes y links compartidos</li>
                      </>
                    )}
                    {slug === 'pro' && (
                      <>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Panel completo y estadísticas</li>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Asistencia de IA para descripciones</li>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Branding discreto: Powered by Walinka</li>
                      </>
                    )}
                    {slug === 'business' && (
                      <>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Panel completo</li>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Estadísticas completas</li>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>IA ilimitada</li>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Sin branding de Walinka en catálogo o mensajes</li>
                      </>
                    )}
                  </ul>
                  <div className="pt-4 border-t" style={{ borderColor: 'rgba(17,24,39,0.08)' }}>
                    {isCurrent ? (
                      <span className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                        Tu plan actual
                      </span>
                    ) : getDisplayPlanPrice(slug) > 0 ? (
                      !billingReady || !checkoutProvider || !hasServerSelectedProvider ? (
                        <button
                          type="button"
                          disabled
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium opacity-60"
                          style={{ color: 'var(--color-muted-foreground)', border: '1px solid rgba(17,24,39,0.10)', backgroundColor: 'rgba(255,255,255,0.54)' }}
                        >
                          {!isAuthenticated
                            ? 'Inicia sesión para contratar'
                            : billingRemoteError
                              ? 'Facturación no disponible'
                              : billingReady && !checkoutProvider
                                ? 'Método de pago no disponible'
                                : 'Cargando facturación…'}
                        </button>
                      ) : checkoutProvider === PAYMENT_PROVIDERS.MERCADO_PAGO ? (
                        <div className="w-full flex flex-col gap-1">
                          <button
                            type="button"
                            disabled={!!loadingPlanSlug || authLoading || !isAuthenticated || !isPurchasable || isAutomaticCheckoutBlocked}
                            onClick={() => handlePayWithMercadoPago(slug)}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:-translate-y-px disabled:opacity-60"
                            style={{ backgroundColor: '#009EE3' }}
                          >
                            {loadingPlanSlug === slug ? (
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <Icon name="Wallet" size={16} color="#fff" />
                                {actionLabel}
                              </>
                            )}
                          </button>
                          <PlanPrimaryTrustBadge provider={checkoutProvider} billingCountryCode={billingCountryForUi} />
                        </div>
                      ) : checkoutProvider === PAYMENT_PROVIDERS.PAYPAL ? (
                        <div className="w-full flex flex-col gap-2">
                          <button
                            type="button"
                            disabled={!!loadingPlanSlug || authLoading || !isAuthenticated || !isPurchasable || isAutomaticCheckoutBlocked || !isProviderReadyForCheckout(PAYMENT_PROVIDERS.PAYPAL)}
                            onClick={() => handlePayWithPaypal(slug)}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:-translate-y-px disabled:opacity-60"
                            style={{ backgroundColor: '#0070ba' }}
                          >
                            {loadingPlanSlug === slug ? (
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <Icon name="CreditCard" size={16} color="#fff" />
                                {actionLabel}
                              </>
                            )}
                          </button>
                          <PayPalCheckoutHelper planSlug={slug} onOpenManualPayment={() => openManualPaymentModal(slug)} />
                        </div>
                      ) : checkoutProvider === PAYMENT_PROVIDERS.MANUAL ? (
                        <div className="w-full flex flex-col gap-1">
                          <button
                            type="button"
                            disabled={!!loadingPlanSlug || authLoading || !isAuthenticated || !isPurchasable}
                            onClick={() => handleOpenIntlPlanPreview(slug)}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:-translate-y-px disabled:opacity-60"
                            style={{ backgroundColor: '#25D366' }}
                          >
                            {loadingPlanSlug === slug ? (
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <Icon name="MessageCircle" size={16} color="#fff" />
                                {actionLabel}
                              </>
                            )}
                          </button>
                          <PlanPrimaryTrustBadge provider={checkoutProvider} billingCountryCode={billingCountryForUi} />
                        </div>
                      ) : (
                        <span className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                          {getPlanUnavailableCopy()}
                        </span>
                      )
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                        {showStarterScheduledSubscriptionLabel ? 'Suscripción programada' : 'Plan gratuito'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {preview && previewPlanSlug && (
            <div className="rounded-2xl border p-5 mt-6" style={{ backgroundColor: 'rgba(255,255,255,0.78)', borderColor: 'rgba(17,24,39,0.10)', boxShadow: '0 16px 40px rgba(17,24,39,0.06)' }}>
              <h3 className="text-base font-semibold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.015em' }}>Resumen antes de pagar</h3>
              <ul className="space-y-1.5 text-sm mb-4" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                <li>Plan actual: <strong>{getPlanLabel(preview.currentPlanSlug)}</strong></li>
                <li>Plan destino: <strong>{getPlanLabel(preview.targetPlanSlug)}</strong></li>
                <li>Días restantes: <strong>{preview.daysRemaining}</strong></li>
                {preview.creditAmount > 0 && (
                  <li>Crédito aplicado: <strong>{formatSubscriptionPlanPrice(preview.creditAmount, planBillingDisplayCurrency, planBillingDisplayLocale)}</strong></li>
                )}
                <li>Precio del plan: <strong>{formatSubscriptionPlanPrice(getDisplayPlanPrice(preview.targetPlanSlug), planBillingDisplayCurrency, planBillingDisplayLocale)}</strong></li>
                {preview.effectiveAt && (
                  <li>Vigente desde: <strong>{new Date(preview.effectiveAt).toLocaleDateString(planBillingDisplayLocale, { dateStyle: 'medium' })}</strong></li>
                )}
                <li className="pt-2 border-t" style={{ borderColor: 'rgba(17,24,39,0.08)' }}>
                  Total a pagar: <strong className="text-base" style={{ color: 'var(--color-foreground)' }}>
                    {preview.changeType === 'downgrade' || preview.finalAmount === 0
                      ? 'Sin cargo (crédito aplicado)'
                      : formatSubscriptionPlanPrice(getSafePreviewTotal(), planBillingDisplayCurrency, planBillingDisplayLocale)}
                  </strong>
                </li>
              </ul>
              {(() => {
                const previewChoose = `Elegir plan ${getPlanLabel(previewPlanSlug)}`;
                const previewSuffix = preview.finalAmount === 0 ? ' (sin cargo)' : '';
                const previewIcon =
                  checkoutProvider === PAYMENT_PROVIDERS.MANUAL
                    ? 'MessageCircle'
                    : checkoutProvider === PAYMENT_PROVIDERS.MERCADO_PAGO
                      ? 'Wallet'
                      : 'CreditCard';
                return (
              <div className="flex flex-wrap gap-3 items-start">
                <div className="flex flex-col gap-2 min-w-[10rem] max-w-[min(100%,20rem)]">
                <button
                  type="button"
                  onClick={handleConfirmPrimaryPayment}
                  disabled={!!loadingPlanSlug || authLoading || !isAuthenticated || !billingReady || !isProviderReadyForCheckout(checkoutProvider) || isAutomaticCheckoutBlocked}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 w-full"
                  style={{ backgroundColor: checkoutProvider === PAYMENT_PROVIDERS.PAYPAL ? '#0070ba' : checkoutProvider === PAYMENT_PROVIDERS.MERCADO_PAGO ? '#009EE3' : '#25D366' }}
                >
                  {loadingPlanSlug ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Icon name={previewIcon} size={16} color="#fff" />
                      {previewChoose}{previewSuffix}
                    </>
                  )}
                </button>
                {checkoutProvider === PAYMENT_PROVIDERS.PAYPAL ? (
                  <PayPalCheckoutHelper planSlug={previewPlanSlug} onOpenManualPayment={() => openManualPaymentModal(previewPlanSlug)} />
                ) : (
                  <PlanPrimaryTrustBadge provider={checkoutProvider} billingCountryCode={billingCountryForUi} />
                )}
                </div>
                <button
                  type="button"
                  onClick={cancelPreview}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ color: 'var(--color-muted-foreground)', border: '1px solid var(--color-border)' }}
                >
                  Cancelar
                </button>
                {secondaryCheckoutProviders.includes(PAYMENT_PROVIDERS.PAYPAL) && (
                  <button
                    type="button"
                    onClick={() => confirmPayWithProvider(PAYMENT_PROVIDERS.PAYPAL)}
                    disabled={!!loadingPlanSlug || authLoading || !isAuthenticated || !billingReady || !isProviderReadyForCheckout(PAYMENT_PROVIDERS.PAYPAL) || isAutomaticCheckoutBlocked}
                    className="inline-flex flex-col items-center justify-center gap-0.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60 min-w-[9rem]"
                    style={{ color: '#0070ba', border: '1px solid #0070ba' }}
                  >
                    <span>{previewChoose}</span>
                    <span className="text-[10px] font-normal opacity-80">PayPal</span>
                  </button>
                )}
                {secondaryCheckoutProviders.includes(PAYMENT_PROVIDERS.MERCADO_PAGO) && (
                  <button
                    type="button"
                    onClick={confirmPayWithMercadoPago}
                    disabled={!!loadingPlanSlug || authLoading || !isAuthenticated || !billingReady || !isProviderReadyForCheckout(PAYMENT_PROVIDERS.MERCADO_PAGO) || isAutomaticCheckoutBlocked}
                    className="inline-flex flex-col items-center justify-center gap-0.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60 min-w-[9rem]"
                    style={{ color: '#009EE3', border: '1px solid #009EE3' }}
                  >
                    <span>{previewChoose}</span>
                    <span className="text-[10px] font-normal opacity-80">Mercado Pago</span>
                  </button>
                )}
              </div>
                );
              })()}
            </div>
          )}
        </DashboardLayoutContent>

        <ManualPaymentLinkModal
          open={manualPaymentModalOpen}
          onClose={closeManualPaymentModal}
          planSlug={manualPaymentPlanSlug}
          user={user}
          business={business}
        />
    </DashboardAppShell>
  );
}
