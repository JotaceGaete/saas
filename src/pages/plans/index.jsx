import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PanelHeader from 'components/ui/PanelHeader';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmedEmailGuard } from '../../hooks/useConfirmedEmailGuard';
import { supabase } from '../../lib/supabase';
import { getAppBaseUrl } from '../../config/appUrl';
import { getCountryCode } from '../../config/country';
import { formatCurrency } from '../../utils/formatCLP';
import { PLAN_SLUGS, getPlanLimits, getPlanLabel, getPlanActionButtonLabel } from '../../constants/plans';
import { TRIAL_DURATION_DAYS, getTrialDaysLeft } from '../../constants/trial';
import {
  resolveBillingContext,
  getPlanDisplayPrice,
  getPaymentOptions,
  normalizeBillingProvider,
} from '../../lib/billing';
import { getPlansActivationWhatsappUrl } from '../../config/plansActivation';

const PAYMENT_DEBUG_PREFIX = '[plans-payment-debug]';

export default function PlansPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, business, businessLoading, refreshBusiness, loading: authLoading, isAuthenticated } = useAuth();
  const guard = useConfirmedEmailGuard();
  const [paymentMessage, setPaymentMessage] = useState(null);
  const [paymentReturnStatus, setPaymentReturnStatus] = useState(null); // 'success' | 'failure' | 'pending' al volver del checkout
  const [loadingPlanSlug, setLoadingPlanSlug] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewPlanSlug, setPreviewPlanSlug] = useState(null);
  const [subscriptionState, setSubscriptionState] = useState(null);
  const currentPlan = business?.planSlug || 'starter';
  const hostnameCountryCode = getCountryCode();
  const businessCountryCode = business?.countryCode ?? null;
  const userCountryCode = user?.user_metadata?.country_code ?? user?.user_metadata?.country ?? null;
  const { countryCode, region, provider: resolvedProvider, currency } = resolveBillingContext({
    hostnameCountryCode,
    businessCountryCode,
    userCountryCode,
  });
  const paymentOptions = getPaymentOptions({ countryCode: businessCountryCode || countryCode });
  const paymentProvider = normalizeBillingProvider(paymentOptions?.primary || resolvedProvider) || 'dlocal';
  const secondaryProviders = Array.isArray(paymentOptions?.secondary) ? paymentOptions.secondary : [];
  const isUsdProvider = paymentProvider === 'dlocal' || paymentProvider === 'paypal';
  const checkoutProvider = normalizeBillingProvider(subscriptionState?.billingProvider?.provider || paymentProvider) || paymentProvider;
  const checkoutAvailability = subscriptionState?.billingProvider || null;
  const alternativeAvailabilityMap = Array.isArray(subscriptionState?.billingProvider?.alternatives)
    ? Object.fromEntries(subscriptionState.billingProvider.alternatives.map((item) => [item.provider, item]))
    : {};
  const getPlanPrice = (slug) => getPlanDisplayPrice(slug, region);
  const scheduledToStarter = (business?.scheduledPlanSlug || null) === 'starter';
  const planExpiryMs = business?.planExpiresAt ? new Date(business.planExpiresAt).getTime() : null;
  const trialExpiryMs = business?.trialExpiresAt ? new Date(business.trialExpiresAt).getTime() : null;
  const hasFuturePlanExpiry = Number.isFinite(planExpiryMs) && planExpiryMs > Date.now();
  const hasFutureTrialExpiry = Number.isFinite(trialExpiryMs) && trialExpiryMs > Date.now();
  const isProTrialActive = (() => {
    if ((business?.planSlug || 'starter') !== 'pro') return false;
    // Modelo real observado:
    // 1) trial_expires_at vigente + scheduled starter, o
    // 2) plan_expires_at vigente + scheduled starter (cuando trial_expires_at viene nulo).
    if (!scheduledToStarter) return false;
    return hasFutureTrialExpiry || hasFuturePlanExpiry;
  })();
  const trialEndDateIso = business?.trialExpiresAt || business?.scheduledChangeAt || business?.planExpiresAt || null;
  const isTrialWithSubscription = subscriptionState?.billing_status === 'trial_with_subscription';
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
    const planPrices = PLAN_SLUGS.reduce((acc, slug) => ({ ...acc, [slug]: getPlanPrice(slug) }), {});
    console.log('[plans-debug] hostname:', window.location?.hostname);
    console.log('[plans-debug] billing region:', region, 'currency:', currency, 'provider:', paymentProvider);
    console.log('[plans-debug] plan prices:', planPrices);
    console.info(PAYMENT_DEBUG_PREFIX, { event: 'provider_resolution', countryCode, region, provider: paymentProvider });
  }, [countryCode, region, paymentProvider, currency]);

  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success') {
      setPaymentReturnStatus('success');
      setPaymentMessage({ type: 'info', text: 'Verificando tu pago…' });
      setSearchParams({}, { replace: true });
      refreshBusiness?.();
    } else if (payment === 'failure') {
      setPaymentMessage({ type: 'error', text: 'El pago no pudo completarse. Intenta de nuevo.' });
      setSearchParams({}, { replace: true });
    } else if (payment === 'pending') {
      setPaymentMessage({ type: 'info', text: 'Pago pendiente. Cuando se acredite, tu plan se actualizará.' });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, refreshBusiness]);

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
        setPaymentMessage({ type: 'info', text: 'El pago está en proceso. Cuando se acredite, tu plan se actualizará.' });
        return;
      }
      if (lastPayment.status === 'approved') {
        setPaymentMessage({ type: 'success', text: 'Pago realizado. Tu plan se ha actualizado.' });
      } else if (lastPayment.status === 'cancelled' || lastPayment.status === 'rejected') {
        setPaymentMessage({ type: 'error', text: 'El pago no pudo completarse. Intenta de nuevo.' });
      } else {
        setPaymentMessage({ type: 'info', text: 'El pago está en proceso. Cuando se acredite, tu plan se actualizará.' });
      }
    })();
    return () => { cancelled = true; };
  }, [paymentReturnStatus, user, businessLoading]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!business?.id || authLoading || !isAuthenticated || !user) return;
      try {
        const token = await getValidAccessToken();
        if (!token) return;
        const query = new URLSearchParams({ businessId: business.id });
        const res = await fetch(`/api/v1/billing/subscription-state?${query.toString()}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          if (!cancelled && data?.error) {
            const friendly = data?.code === 'AUTH_REQUIRED'
              ? 'Tu sesión venció. Inicia sesión nuevamente.'
              : 'No se pudo cargar el estado de facturación en este momento.';
            setPaymentMessage({ type: 'error', text: friendly });
          }
          return;
        }
        if (!cancelled) setSubscriptionState(data);
      } catch {
        // Fallback silencioso: mantiene estado actual de trial.
      }
    })();
    return () => { cancelled = true; };
  }, [business?.id, authLoading, isAuthenticated, user]);

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
    if (getPlanPrice(planSlug) <= 0) return;
    setLoadingPlanSlug(planSlug);
    setPaymentMessage(null);
    setPreview(null);
    setPreviewPlanSlug(null);
    try {
      if (authLoading) {
        setPaymentMessage({ type: 'info', text: 'Cargando sesión. Intenta nuevamente en unos segundos.' });
        return;
      }
      if (!isAuthenticated || !user) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión para contratar un plan.' });
        navigate('/login');
        return;
      }
      const token = await getValidAccessToken();
      if (!token) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión para contratar un plan.' });
        navigate('/login');
        return;
      }
      const previewData = await fetchPlanPreview(planSlug);
      if (!previewData) {
        setPaymentMessage({ type: 'error', text: 'No se pudo obtener el resumen del cambio de plan.' });
        return;
      }
      if (previewData.changeType === 'downgrade') {
        setPaymentMessage({ type: 'info', text: previewData.message || 'El cambio se aplicará al vencer tu plan actual. No se realiza ningún cargo.' });
        return;
      }
      setPreview(previewData);
      setPreviewPlanSlug(planSlug);
    } catch (err) {
      setPaymentMessage({ type: 'error', text: err?.message || 'Error al cargar el resumen.' });
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
      resolvedProvider: paymentProvider,
    });
    if (getPlanPrice(planSlug) <= 0) return;
    setLoadingPlanSlug(planSlug);
    setPaymentMessage(null);
    setPreview(null);
    setPreviewPlanSlug(null);
    try {
      if (authLoading) {
        setPaymentMessage({ type: 'info', text: 'Cargando sesión. Intenta nuevamente en unos segundos.' });
        return;
      }
      if (!isAuthenticated || !user) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión para contratar un plan.' });
        navigate('/login');
        return;
      }
      const token = await getValidAccessToken();
      if (!token) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión para contratar un plan.' });
        navigate('/login');
        return;
      }
      const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
      if (!!anonKey && token === anonKey) {
        setPaymentMessage({ type: 'error', text: 'Error de autenticación: token inválido.' });
        return;
      }

      const previewData = await fetchPlanPreview(planSlug);
      if (!previewData) {
        setPaymentMessage({ type: 'error', text: 'No se pudo obtener el resumen del cambio de plan.' });
        return;
      }

      if (previewData.changeType === 'downgrade') {
        setPaymentMessage({ type: 'info', text: previewData.message || 'El cambio se aplicará al vencer tu plan actual. No se realiza ningún cargo.' });
        return;
      }

      setPreview(previewData);
      setPreviewPlanSlug(planSlug);
    } catch (err) {
      setPaymentMessage({ type: 'error', text: err?.message || 'Error al cargar el resumen.' });
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
      resolvedProvider: paymentProvider,
    });
    if (getPlanPrice(planSlug) <= 0) return;
    setLoadingPlanSlug(planSlug);
    setPaymentMessage(null);
    setPreview(null);
    setPreviewPlanSlug(null);
    try {
      if (authLoading) {
        setPaymentMessage({ type: 'info', text: 'Cargando sesión. Intenta nuevamente en unos segundos.' });
        return;
      }
      if (!isAuthenticated || !user || !business?.id) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión y tener un negocio activo para suscribirte.' });
        navigate('/login');
        return;
      }
      const token = await getValidAccessToken();
      if (!token) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión para suscribirte.' });
        navigate('/login');
        return;
      }

      const previewData = await fetchPlanPreview(planSlug);
      if (!previewData) {
        setPaymentMessage({ type: 'error', text: 'No se pudo obtener el resumen del cambio de plan.' });
        return;
      }
      if (previewData.changeType === 'downgrade') {
        setPaymentMessage({ type: 'info', text: previewData.message || 'El cambio se aplicará al vencer tu plan actual. No se realiza ningún cargo.' });
        return;
      }

      setPreview(previewData);
      setPreviewPlanSlug(planSlug);
    } catch (err) {
      setPaymentMessage({ type: 'error', text: err?.message || 'Error al iniciar PayPal.' });
    } finally {
      setLoadingPlanSlug(null);
    }
  };

  const handlePayWithDlocal = async (planSlug) => {
    if (guard.isBlocked) {
      guard.runIfConfirmed(() => {});
      return;
    }
    if (getPlanPrice(planSlug) <= 0) return;
    setLoadingPlanSlug(planSlug);
    setPaymentMessage(null);
    setPreview(null);
    setPreviewPlanSlug(null);
    try {
      if (authLoading) {
        setPaymentMessage({ type: 'info', text: 'Cargando sesión. Intenta nuevamente en unos segundos.' });
        return;
      }
      if (!isAuthenticated || !user || !business?.id) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión y tener un negocio activo para suscribirte.' });
        navigate('/login');
        return;
      }
      const previewData = await fetchPlanPreview(planSlug);
      if (!previewData) {
        setPaymentMessage({ type: 'error', text: 'No se pudo obtener el resumen del cambio de plan.' });
        return;
      }
      if (previewData.changeType === 'downgrade') {
        setPaymentMessage({ type: 'info', text: previewData.message || 'El cambio se aplicará al vencer tu plan actual. No se realiza ningún cargo.' });
        return;
      }
      setPreview(previewData);
      setPreviewPlanSlug(planSlug);
    } catch (err) {
      setPaymentMessage({ type: 'error', text: err?.message || 'Error al iniciar dLocal.' });
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
    setPaymentMessage({
      type: 'info',
      text: 'Se abrió WhatsApp para que coordinemos la activación de tu plan. Si no se abrió, revisa el bloqueador de ventanas emergentes.',
    });
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
    setLoadingPlanSlug(previewPlanSlug);
    setPaymentMessage(null);
    try {
      if (authLoading) {
        setPaymentMessage({ type: 'info', text: 'Cargando sesión. Intenta nuevamente en unos segundos.' });
        return;
      }
      if (!isAuthenticated || !user) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión.' });
        navigate('/login');
        return;
      }
      const token = await getValidAccessToken();
      if (!token) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión.' });
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
          setPaymentMessage({ type: 'info', text: data?.message || 'El cambio se aplicará al vencer tu plan actual.' });
          setPreview(null);
          setPreviewPlanSlug(null);
          return;
        }
        throw new Error(data?.error ?? res.statusText ?? 'Error al crear preferencia de pago');
      }
      if (data?.error) throw new Error(data.error);
      if (data?.applied) {
        setPaymentMessage({ type: 'success', text: 'Plan actualizado correctamente. No se requirió pago (crédito por tiempo restante).' });
        setPreview(null);
        setPreviewPlanSlug(null);
        refreshBusiness?.();
        return;
      }
      if (data?.init_point) {
        window.location.href = data.init_point;
        return;
      }
      throw new Error('No se recibió enlace de pago');
    } catch (err) {
      setPaymentMessage({ type: 'error', text: err?.message || 'Error al iniciar el pago.' });
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
    setLoadingPlanSlug(previewPlanSlug);
    setPaymentMessage(null);
    try {
      if (authLoading) {
        setPaymentMessage({ type: 'info', text: 'Cargando sesión. Intenta nuevamente en unos segundos.' });
        return;
      }
      if (!isAuthenticated || !user || !business?.id) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión y tener un negocio activo para suscribirte.' });
        navigate('/login');
        return;
      }
      const token = await getValidAccessToken();
      if (!token) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión para suscribirte.' });
        navigate('/login');
        return;
      }

      const normalizedProvider = normalizeBillingProvider(provider);
      if (!normalizedProvider) {
        throw new Error(`Proveedor no soportado: ${provider}`);
      }

      const res = await fetch('/api/v1/billing/subscriptions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: normalizedProvider,
          businessId: business.id,
          planSlug: previewPlanSlug,
          returnUrl: normalizedProvider === 'paypal'
            ? `${window.location.origin}/billing/paypal/success`
            : `${window.location.origin}/planes?payment=success`,
          cancelUrl: normalizedProvider === 'paypal'
            ? `${window.location.origin}/billing/paypal/cancel`
            : `${window.location.origin}/planes?payment=failure`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (data?.code === 'PROVIDER_NOT_READY') {
          throw new Error('Este método de pago no está disponible por el momento.');
        }
        throw new Error(data?.error || `No se pudo crear la suscripción ${normalizedProvider} (HTTP ${res.status}).`);
      }
      if (!data?.checkoutUrl) {
        throw new Error(`${normalizedProvider} no devolvió URL de checkout.`);
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      setPaymentMessage({ type: 'error', text: err?.message || `Error al iniciar ${provider}.` });
    } finally {
      setLoadingPlanSlug(null);
    }
  };

  const handleConfirmPrimaryPayment = () => {
    if (checkoutProvider === 'dlocal') return confirmPayWithProvider('dlocal');
    if (checkoutProvider === 'paypal') return confirmPayWithProvider('paypal');
    if (checkoutProvider === 'mercadopago') return confirmPayWithMercadoPago();
    if (checkoutProvider === 'manual') return confirmActivationViaWhatsApp();
    setPaymentMessage({
      type: 'error',
      text: `Proveedor no soportado para checkout: ${String(checkoutProvider || 'unknown')}`,
    });
    return undefined;
  };

  const cancelPreview = () => {
    setPreview(null);
    setPreviewPlanSlug(null);
  };

  const getSafePreviewTotal = () => {
    if (!preview || !previewPlanSlug) return 0;
    const providerCatalogAmount = getPlanDisplayPrice(preview.targetPlanSlug, region);
    const reported = Number(preview.finalAmount);
    if (!Number.isFinite(reported)) return providerCatalogAmount;
    // Guardrail: evita mostrar montos CLP como USD (ej. 5990 -> USD).
    if (currency === 'USD' && isUsdProvider && reported > 100 && providerCatalogAmount > 0 && providerCatalogAmount <= 20) {
      return providerCatalogAmount;
    }
    return reported;
  };

  const isProviderReadyForCheckout = (provider) => {
    const normalized = normalizeBillingProvider(provider);
    if (!normalized) return false;
    if (normalized === checkoutProvider && checkoutAvailability) {
      return checkoutAvailability.enabled === true && checkoutAvailability.supportsCheckout === true;
    }
    const alt = alternativeAvailabilityMap[normalized];
    if (alt) return alt.enabled === true && alt.supportsCheckout === true;
    return true;
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

          {/* Tu plan */}
          {business?.id && (
            <div
              className="rounded-xl border p-5 flex flex-wrap items-center justify-between gap-4"
              style={{ backgroundColor: 'rgba(124,58,237,0.06)', borderColor: 'var(--color-primary)' }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Tu plan</p>
                <p className="text-lg font-bold mt-0.5" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                  {getPlanLabel(currentPlan)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                  {(() => {
                    const limits = getPlanLimits(currentPlan);
                    const products = limits.maxProducts == null ? 'Productos ilimitados' : `Hasta ${limits.maxProducts} productos`;
                    const orders = limits.maxOrdersPerMonth == null ? 'Pedidos ilimitados' : `${limits.maxOrdersPerMonth} pedidos/mes`;
                    return `${products} · ${orders}`;
                  })()}
                </p>
                {isProTrialActive && trialEndDateIso && (
                  <p className="text-xs mt-1 font-medium" style={{ color: '#D97706', fontFamily: 'var(--font-caption)' }}>
                    ✨ Prueba gratuita · vence el {new Date(trialEndDateIso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
                {isTrialWithSubscription && (
                  <>
                    <p className="text-xs mt-1 font-medium" style={{ color: '#059669', fontFamily: 'var(--font-caption)' }}>
                      Tu suscripción está activada.
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                      {subscriptionState?.subscription_starts_at
                        ? `Inicia el ${new Date(subscriptionState.subscription_starts_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}.`
                        : 'Iniciará al finalizar tu prueba gratuita.'}
                      {' '}El cobro se realizará al finalizar tu prueba gratuita.
                    </p>
                  </>
                )}
                {business?.planExpiresAt && (currentPlan === 'pro' || currentPlan === 'business') && new Date(business.planExpiresAt) > new Date() && (
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                    Vence el {new Date(business.planExpiresAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
                {business?.scheduledPlanSlug && (
                  <p className="text-xs mt-1" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
                    Cambio a <strong>{getPlanLabel(business.scheduledPlanSlug)}</strong>
                    {business.scheduledChangeAt ? ` el ${new Date(business.scheduledChangeAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => document.getElementById('planes-grid')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                <Icon name="TrendingUp" size={16} color="#fff" />
                Mejorar plan
              </button>
            </div>
          )}

          {paymentMessage && (
            <div
              className="rounded-xl border px-4 py-3 flex items-center gap-3"
              style={{
                backgroundColor: paymentMessage.type === 'success' ? 'rgba(16,185,129,0.1)' : paymentMessage.type === 'error' ? 'rgba(239,68,68,0.1)' : 'var(--color-muted)',
                borderColor: paymentMessage.type === 'success' ? '#10b981' : paymentMessage.type === 'error' ? '#ef4444' : 'var(--color-border)',
                color: paymentMessage.type === 'success' ? '#059669' : paymentMessage.type === 'error' ? '#dc2626' : 'var(--color-text-secondary)',
              }}
            >
              <Icon name={paymentMessage.type === 'success' ? 'CheckCircle' : paymentMessage.type === 'error' ? 'AlertCircle' : 'Info'} size={18} color="currentColor" />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{paymentMessage.text}</span>
            </div>
          )}

          {preview && previewPlanSlug && (
            <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-primary)' }}>
              <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Resumen antes de pagar</h3>
              <ul className="space-y-1.5 text-sm mb-4" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                <li>Plan actual: <strong>{getPlanLabel(preview.currentPlanSlug)}</strong></li>
                <li>Plan destino: <strong>{getPlanLabel(preview.targetPlanSlug)}</strong></li>
                <li>Días restantes: <strong>{preview.daysRemaining}</strong></li>
                {preview.creditAmount > 0 && (
                  <li>Crédito aplicado: <strong>{formatCurrency(preview.creditAmount, currency)}</strong></li>
                )}
                <li>Precio del plan: <strong>{formatCurrency(getPlanDisplayPrice(preview.targetPlanSlug, region), currency)}</strong></li>
                {preview.effectiveAt && (
                  <li>Vigente desde: <strong>{new Date(preview.effectiveAt).toLocaleDateString(currency === 'USD' ? 'en-US' : 'es-CL', { dateStyle: 'medium' })}</strong></li>
                )}
                <li className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  Total a pagar: <strong className="text-base" style={{ color: 'var(--color-foreground)' }}>
                    {preview.changeType === 'downgrade' || preview.finalAmount === 0
                      ? 'Sin cargo (crédito aplicado)'
                      : formatCurrency(getSafePreviewTotal(), currency)}
                  </strong>
                </li>
              </ul>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleConfirmPrimaryPayment}
                  disabled={!!loadingPlanSlug || authLoading || !isAuthenticated || !isProviderReadyForCheckout(checkoutProvider)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: checkoutProvider === 'dlocal' ? '#111827' : checkoutProvider === 'paypal' ? '#0070ba' : checkoutProvider === 'mercadopago' ? '#009EE3' : '#25D366' }}
                >
                  {loadingPlanSlug ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : checkoutProvider === 'dlocal' ? (
                    <>
                      <Icon name="CreditCard" size={16} color="#fff" />
                      {preview.finalAmount === 0 ? 'Confirmar cambio (sin cargo)' : 'Continuar con dLocal'}
                    </>
                  ) : checkoutProvider === 'paypal' ? (
                    <>
                      <Icon name="CreditCard" size={16} color="#fff" />
                      {preview.finalAmount === 0 ? 'Confirmar cambio (sin cargo)' : 'Continuar con PayPal'}
                    </>
                  ) : checkoutProvider === 'manual' ? (
                    <>
                      <Icon name="MessageCircle" size={16} color="#fff" />
                      {preview.finalAmount === 0 ? 'Solicitar activación (sin cargo)' : 'Solicitar activación'}
                    </>
                  ) : preview.finalAmount === 0 ? (
                    <><Icon name="CheckCircle" size={16} color="#fff" /> Confirmar cambio (sin cargo)</>
                  ) : (
                    <><Icon name="Wallet" size={16} color="#fff" /> Confirmar y pagar</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={cancelPreview}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ color: 'var(--color-muted-foreground)', border: '1px solid var(--color-border)' }}
                >
                  Cancelar
                </button>
                {secondaryProviders.includes('paypal') && (
                  <button
                    type="button"
                    onClick={() => confirmPayWithProvider('paypal')}
                    disabled={!!loadingPlanSlug || authLoading || !isAuthenticated || !isProviderReadyForCheckout('paypal')}
                    className="px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ color: '#0070ba', border: '1px solid #0070ba' }}
                  >
                    PayPal
                  </button>
                )}
                {secondaryProviders.includes('mercadopago') && (
                  <button
                    type="button"
                    onClick={confirmPayWithMercadoPago}
                    disabled={!!loadingPlanSlug || authLoading || !isAuthenticated || !isProviderReadyForCheckout('mercadopago')}
                    className="px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ color: '#009EE3', border: '1px solid #009EE3' }}
                  >
                    MercadoPago
                  </button>
                )}
                {secondaryProviders.includes('dlocal') && (
                  <button
                    type="button"
                    onClick={() => confirmPayWithProvider('dlocal')}
                    disabled={!!loadingPlanSlug || authLoading || !isAuthenticated || !isProviderReadyForCheckout('dlocal')}
                    className="px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ color: '#111827', border: '1px solid #111827' }}
                  >
                    dLocal
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Banner de trial activo (PRO en prueba gratuita) */}
          {!isTrialWithSubscription && isProTrialActive && trialEndDateIso && (() => {
            const trialExp = new Date(trialEndDateIso);
            const now = new Date();
            if (trialExp <= now) return null;
            const daysLeft = getTrialDaysLeft(trialEndDateIso, now);
            return (
              <div
                className="rounded-xl border px-5 py-4 flex items-start gap-3"
                style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderColor: '#F59E0B' }}
              >
                <span className="text-xl leading-none mt-0.5">✨</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#92400E', fontFamily: 'var(--font-heading)' }}>
                    Estás usando una prueba gratuita de {TRIAL_DURATION_DAYS} días del plan PRO.
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#B45309', fontFamily: 'var(--font-caption)' }}>
                    Si compras ahora, la suscripción comenzará cuando termine tu período gratuito.
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#B45309', fontFamily: 'var(--font-caption)' }}>
                    {daysLeft === 1
                      ? 'Queda 1 día de prueba.'
                      : `Quedan ${daysLeft} días de prueba.`}
                    {' '}Puedes contratar Pro o Full; si eliges Pro, el plan pagado se activará al finalizar la prueba.
                  </p>
                </div>
              </div>
            );
          })()}

          <div id="planes-grid" className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {PLAN_SLUGS.map((slug) => {
              const limits = getPlanLimits(slug);
              const isProTrialCard = slug === 'pro' && isProTrialActive;
              const isCurrent = currentPlan === slug && !isProTrialCard;
              const actionLabel = isProTrialCard
                ? 'Mantener Pro al terminar la prueba'
                : getPlanActionButtonLabel(currentPlan, slug);
              return (
                <div
                  key={slug}
                  className="rounded-2xl border p-5 flex flex-col transition-all"
                  style={{
                    backgroundColor: isCurrent ? 'rgba(124,58,237,0.06)' : '#ffffff',
                    borderColor: isCurrent ? 'var(--color-primary)' : 'var(--color-border)',
                    boxShadow: isCurrent ? '0 0 0 2px rgba(124,58,237,0.2)' : '0 1px 4px rgba(0,0,0,0.05)',
                  }}
                >
                  <div className="flex items-center justify-between mb-4">
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
                    <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                      {getPlanPrice(slug) === 0 ? 'Gratis' : formatCurrency(getPlanPrice(slug), currency)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                      {getPlanPrice(slug) === 0 ? '' : `por mes · ${currency}`}
                    </p>
                  </div>
                  <ul className="space-y-2 mb-6 flex-1">
                    <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                      <Icon name="Package" size={14} color="var(--color-muted-foreground)" />
                      Productos: {limits.maxProducts == null ? 'Ilimitados' : limits.maxProducts}
                    </li>
                    <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                      <Icon name="ShoppingCart" size={14} color="var(--color-muted-foreground)" />
                      Pedidos/mes: {limits.maxOrdersPerMonth == null ? 'Ilimitados' : limits.maxOrdersPerMonth}
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
                    ) : getPlanPrice(slug) > 0 ? (
                      paymentProvider === 'mercadopago' ? (
                        <button
                          type="button"
                          disabled={!!loadingPlanSlug || authLoading || !isAuthenticated}
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
                      ) : paymentProvider === 'dlocal' ? (
                        <button
                          type="button"
                          disabled={!!loadingPlanSlug || authLoading || !isAuthenticated}
                          onClick={() => handlePayWithDlocal(slug)}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                          style={{ backgroundColor: '#111827' }}
                        >
                          {loadingPlanSlug === slug ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <Icon name="CreditCard" size={16} color="#fff" />
                              Continuar con dLocal
                            </>
                          )}
                        </button>
                      ) : paymentProvider === 'paypal' ? (
                        <button
                          type="button"
                          disabled={!!loadingPlanSlug || authLoading || !isAuthenticated}
                          onClick={() => handlePayWithPaypal(slug)}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                          style={{ backgroundColor: '#0070ba' }}
                        >
                          {loadingPlanSlug === slug ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <Icon name="CreditCard" size={16} color="#fff" />
                              Suscribirme
                            </>
                          )}
                        </button>
                      ) : paymentProvider === 'manual' ? (
                        <button
                          type="button"
                          disabled={!!loadingPlanSlug || authLoading || !isAuthenticated}
                          onClick={() => handleOpenIntlPlanPreview(slug)}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                          style={{ backgroundColor: '#25D366' }}
                        >
                          {loadingPlanSlug === slug ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <Icon name="MessageCircle" size={16} color="#fff" />
                              Solicitar activación
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                          Activación no disponible en tu región
                        </span>
                      )
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                        {isTrialWithSubscription ? 'Suscripción programada' : 'Plan gratuito'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-xl border p-5" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
              {paymentProvider === 'mercadopago'
                ? 'Para este negocio, MercadoPago es el método principal. El flujo actual se mantiene sin cambios.'
                : paymentProvider === 'dlocal'
                  ? 'Para este negocio, dLocal es el proveedor principal (tarjeta o transferencia).'
                : paymentProvider === 'paypal'
                  ? 'Fuera de Chile los planes se procesan con PayPal en USD. Tras aprobar el pago, tu suscripción se confirma en el backend.'
                : paymentProvider === 'manual'
                  ? 'Fuera de Chile la activación de planes Pro o Full es por contacto directo (WhatsApp). Los precios en USD son de referencia hasta activar un nuevo proveedor de pago.'
                  : 'Consulta disponibilidad de pago en tu país.'}
            </p>
            {secondaryProviders.length > 0 && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                Otras opciones: {secondaryProviders.map((provider) => {
                  if (provider === 'mercadopago') return 'MercadoPago';
                  if (provider === 'paypal') return 'PayPal';
                  if (provider === 'dlocal') return 'dLocal';
                  return provider;
                }).join(' · ')}.
              </p>
            )}
            {checkoutAvailability && (!checkoutAvailability.enabled || !checkoutAvailability.supportsCheckout) && (
              <p className="text-xs mt-2" style={{ color: '#b45309', fontFamily: 'var(--font-caption)' }}>
                Este método de pago estará disponible próximamente.
              </p>
            )}
          </div>
        </DashboardLayoutContent>
      
    </DashboardAppShell>
  );
}
