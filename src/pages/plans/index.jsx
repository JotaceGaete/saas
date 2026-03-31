import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PanelHeader from 'components/ui/PanelHeader';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
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
import { getCurrentSubscription } from '../../lib/billing/subscriptionService';
import { normalizePlanSlugForBilling } from '../../lib/billing/billingSubscriptionsClient';
import { buildUnifiedSubscriptionViewModel } from '../../lib/billing/unifiedSubscriptionCardModel';
import { useBillingSubscriptionDisplayRow } from '../../hooks/useBillingSubscriptionDisplayRow';
import { resolveCountryState, resolveBillingSetup, logCountryStateDebug } from '../../lib/country/state-model';
import UnifiedSubscriptionCard from './components/UnifiedSubscriptionCard';
import { useToast } from '../../components/ui/Toast';

const PAYMENT_DEBUG_PREFIX = '[plans-payment-debug]';

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
  const [subscriptionState, setSubscriptionState] = useState(null);
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
  /** "Suscripción programada" solo si hay downgrade/cambio futuro confirmado en BD, no solo por estar en trial. */
  const showStarterScheduledSubscriptionLabel = isTrialWithSubscription && Boolean(business?.scheduledPlanSlug);
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

  // Solo mostrar éxito cuando la BD confirma: wa_payments.status = approved (no por success_url ni query params)
  useEffect(() => {
    if (paymentReturnStatus !== 'success' || !user || businessLoading) return;
    let cancelled = false;
    (async () => {
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
      if (lastPayment.status === 'approved') {
        toast?.success?.('Pago realizado. Tu plan se ha actualizado.');
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

      setPreview(previewData);
      setPreviewPlanSlug(planSlug);
    } catch (err) {
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
      window.open(url, '_blank', 'noopener,noreferrer');
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

  const confirmPayWithProvider = async (provider) => {
    if (guard.isBlocked) {
      guard.runIfConfirmed(() => {});
      return;
    }
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
          planSlug: previewPlanSlug,
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
        throw new Error(data?.error || `No se pudo crear la suscripción ${safeProvider} (HTTP ${res.status}).`);
      }
      const redirectUrl = data?.redirectUrl || data?.redirect_url || data?.checkoutUrl || null;
      if (!redirectUrl) {
        throw new Error(`${safeProvider} no devolvió URL de checkout.`);
      }
      window.location.assign(redirectUrl);
    } catch (err) {
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
    if (normalized === checkoutProvider && checkoutAvailability) {
      return checkoutAvailability.enabled === true && checkoutAvailability.supportsCheckout === true;
    }
    const alt = alternativeAvailabilityMap[normalized];
    if (alt) return alt.enabled === true && alt.supportsCheckout === true;
    return false;
  };

  if (businessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <DashboardAppShell backgroundColor="var(--color-background)">
        <PanelHeader
          title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Plan y facturación</h1>}
          subtitle={<p className="text-xs hidden sm:block mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Gestiona tu plan, límites y renovación</p>}
        />
        <DashboardLayoutContent>

          {business?.id && (
            <UnifiedSubscriptionCard
              subscription={currentPlan}
              viewModel={unifiedSubscriptionViewModel}
              onScrollToPlans={() => document.getElementById('planes-grid')?.scrollIntoView({ behavior: 'smooth' })}
            />
          )}

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
                    'relative rounded-2xl border p-5 flex flex-col transition-all',
                    isProRecommended ? 'ring-2 ring-violet-500/20 border-violet-200/90 shadow-md shadow-violet-500/10' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    backgroundColor: isCurrent ? 'rgba(124,58,237,0.06)' : '#ffffff',
                    borderColor: isCurrent ? 'var(--color-primary)' : 'var(--color-border)',
                    boxShadow: isCurrent ? '0 0 0 2px rgba(124,58,237,0.2)' : '0 1px 4px rgba(0,0,0,0.05)',
                  }}
                >
                  {isProRecommended && (
                    <span
                      className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm font-[family-name:var(--font-caption)]"
                      aria-hidden
                    >
                      Popular
                    </span>
                  )}
                  <div className="flex items-center justify-between mb-4 pt-1">
                    <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                      {getPlanLabel(slug)}
                    </h2>
                    {isCurrent && (
                      <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
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
                            ? 'text-3xl font-extrabold text-violet-900 tracking-tight'
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
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600" aria-hidden>
                        <Icon name="Package" size={16} color="currentColor" />
                      </span>
                      <span>
                        <span className="font-semibold text-slate-800">Productos</span>
                        {' · '}
                        {limits.maxProducts == null ? 'Ilimitados' : limits.maxProducts}
                      </span>
                    </li>
                    <li className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600" aria-hidden>
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
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Incluye branding de Ventalink en mensajes y links compartidos</li>
                      </>
                    )}
                    {slug === 'pro' && (
                      <>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Panel completo y estadísticas</li>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Asistencia de IA para descripciones</li>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Branding discreto: Powered by Ventalink</li>
                      </>
                    )}
                    {slug === 'business' && (
                      <>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Panel completo</li>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Estadísticas completas</li>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>IA ilimitada</li>
                        <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Sin branding de Ventalink en catálogo o mensajes</li>
                      </>
                    )}
                  </ul>
                  <div className="pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                    {isCurrent ? (
                      <span className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                        Tu plan actual
                      </span>
                    ) : getDisplayPlanPrice(slug) > 0 ? (
                      !billingReady || !checkoutProvider || !hasServerSelectedProvider ? (
                        <button
                          type="button"
                          disabled
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium opacity-60"
                          style={{ color: 'var(--color-muted-foreground)', border: '1px solid var(--color-border)' }}
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
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
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
                        <div className="w-full flex flex-col gap-1">
                          <button
                            type="button"
                            disabled={!!loadingPlanSlug || authLoading || !isAuthenticated || !isPurchasable || isAutomaticCheckoutBlocked}
                            onClick={() => handlePayWithPaypal(slug)}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
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
                          <PlanPrimaryTrustBadge provider={checkoutProvider} billingCountryCode={billingCountryForUi} />
                        </div>
                      ) : checkoutProvider === PAYMENT_PROVIDERS.MANUAL ? (
                        <div className="w-full flex flex-col gap-1">
                          <button
                            type="button"
                            disabled={!!loadingPlanSlug || authLoading || !isAuthenticated || !isPurchasable}
                            onClick={() => handleOpenIntlPlanPreview(slug)}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
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
            <div className="rounded-xl border p-5 mt-6" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-primary)' }}>
              <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Resumen antes de pagar</h3>
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
                <li className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
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
                <div className="flex flex-col gap-1 min-w-[10rem]">
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
                <PlanPrimaryTrustBadge provider={checkoutProvider} billingCountryCode={billingCountryForUi} />
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
      
    </DashboardAppShell>
  );
}
