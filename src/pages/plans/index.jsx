import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { getAppBaseUrl } from '../../config/appUrl';
import { getCountryCode, getCurrency } from '../../config/country';
import { getPaymentProvider, PAYMENT_COUNTRY_CODES } from '../../config/paymentProvider';
import { formatCurrency } from '../../utils/formatCLP';
import { PLAN_SLUGS, getPlanLimits, getPlanLabel, getPlanPriceByCountry, getPlanActionButtonLabel } from '../../constants/plans';

const PAYMENT_DEBUG_PREFIX = '[plans-payment-debug]';
const SUPPORTED_PAYMENT_COUNTRIES = new Set(PAYMENT_COUNTRY_CODES);

function normalizeCountryCode(value) {
  if (!value || typeof value !== 'string') return null;
  const code = value.toUpperCase().trim();
  if (SUPPORTED_PAYMENT_COUNTRIES.has(code)) return code;
  return null;
}

function resolveCountryCode({ hostnameCountryCode, businessCountryCode, userCountryCode }) {
  // En ar.ventalink.app siempre forzamos AR para evitar caer en CL por datos legacy.
  if (hostnameCountryCode === 'AR') return 'AR';
  if (businessCountryCode) return businessCountryCode;
  if (userCountryCode) return userCountryCode;
  if (hostnameCountryCode) return hostnameCountryCode;
  return 'CL';
}

export default function PlansPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, business, businessLoading, refreshBusiness } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState(null);
  const [loadingPlanSlug, setLoadingPlanSlug] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewPlanSlug, setPreviewPlanSlug] = useState(null);
  const [selectedPaymentProvider, setSelectedPaymentProvider] = useState('mercado_pago'); // 'mercado_pago' | 'dlocal_go'
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';
  const currentPlan = business?.planSlug || 'starter';
  const hostnameCountryCode = normalizeCountryCode(getCountryCode());
  const businessCountryCode = normalizeCountryCode(business?.countryCode);
  const userCountryCode = normalizeCountryCode(user?.user_metadata?.country_code ?? user?.user_metadata?.country);
  const countryCode = resolveCountryCode({ hostnameCountryCode, businessCountryCode, userCountryCode });
  const currency = getCurrency(countryCode);
  const paymentProvider = getPaymentProvider(countryCode);
  const getPlanPrice = (slug) => getPlanPriceByCountry(slug, countryCode);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    console.info(PAYMENT_DEBUG_PREFIX, {
      event: 'provider_resolution',
      hostname: window.location?.hostname ?? null,
      hostnameCountryCode,
      businessCountryCode,
      userCountryCode,
      resolvedCountryCode: countryCode,
      resolvedProvider: paymentProvider,
    });
  }, [hostnameCountryCode, businessCountryCode, userCountryCode, countryCode, paymentProvider]);

  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success') {
      setPaymentMessage({ type: 'success', text: 'Pago realizado. Tu plan se ha actualizado.' });
      refreshBusiness?.();
      setSearchParams({}, { replace: true });
    } else if (payment === 'failure') {
      setPaymentMessage({ type: 'error', text: 'El pago no pudo completarse. Intenta de nuevo.' });
      setSearchParams({}, { replace: true });
    } else if (payment === 'pending') {
      setPaymentMessage({ type: 'info', text: 'Pago pendiente. Cuando se acredite, tu plan se actualizará.' });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, refreshBusiness]);

  const fetchPlanPreview = async (targetPlanSlug) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
    const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
    const res = await fetch(`${supabaseUrl}/functions/v1/plan-change-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: anonKey },
      body: JSON.stringify({ targetPlanSlug }),
    });
    if (!res.ok) return null;
    return res.json().catch(() => null);
  };

  const handlePayWithMercadoPago = async (planSlug) => {
    console.info(PAYMENT_DEBUG_PREFIX, {
      event: 'click_plan_button',
      handler: 'handlePayWithMercadoPago',
      planSlug,
      resolvedCountryCode: countryCode,
      resolvedProvider: paymentProvider,
      selectedPaymentProviderBefore: selectedPaymentProvider,
    });
    if (getPlanPrice(planSlug) <= 0) return;
    setSelectedPaymentProvider('mercado_pago');
    setLoadingPlanSlug(planSlug);
    setPaymentMessage(null);
    setPreview(null);
    setPreviewPlanSlug(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión para contratar un plan.' });
        return;
      }
      const token = session.access_token;
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

  const handlePayWithDlocal = async (planSlug) => {
    console.info(PAYMENT_DEBUG_PREFIX, {
      event: 'click_plan_button',
      handler: 'handlePayWithDlocal',
      planSlug,
      resolvedCountryCode: countryCode,
      resolvedProvider: paymentProvider,
      selectedPaymentProviderBefore: selectedPaymentProvider,
    });
    if (getPlanPrice(planSlug) <= 0) return;
    setSelectedPaymentProvider('dlocal_go');
    setLoadingPlanSlug(planSlug);
    setPaymentMessage(null);
    setPreview(null);
    setPreviewPlanSlug(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión para contratar un plan.' });
        return;
      }
      const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
      if (anonKey && session.access_token === anonKey) {
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

  const confirmPayWithDlocal = async () => {
    console.info(PAYMENT_DEBUG_PREFIX, {
      event: 'confirm_payment',
      handler: 'confirmPayWithDlocal',
      planSlug: previewPlanSlug,
      resolvedCountryCode: countryCode,
      resolvedProvider: paymentProvider,
      selectedPaymentProvider,
    });
    if (!previewPlanSlug) return;
    setLoadingPlanSlug(previewPlanSlug);
    setPaymentMessage(null);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error('[auth-debug] getSession error:', sessionError.message);
      }
      if (!session?.access_token) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión.' });
        return;
      }
      const accessToken = session.access_token;
      console.log('[auth-debug] dlocal tokenLength:', accessToken.length);
      console.log('[auth-debug] dlocal tokenPreview:', accessToken.slice(0, 20));

      const baseUrl = getAppBaseUrl() || window.location?.origin || '';
      const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
      const payload = {
        planSlug: previewPlanSlug,
        success_url: `${baseUrl}/plans?payment=success`,
        cancel_url: `${baseUrl}/plans?payment=failure`,
      };

      const res = await fetch(`${supabaseUrl}/functions/v1/create-dlocal-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.changeType === 'downgrade') {
          setPaymentMessage({ type: 'info', text: data?.message || 'El cambio se aplicará al vencer tu plan actual.' });
          setPreview(null);
          setPreviewPlanSlug(null);
          return;
        }
        throw new Error(data?.error ?? res.statusText ?? 'Error al crear checkout');
      }
      if (data?.error) throw new Error(data.error);
      if (data?.applied) {
        setPaymentMessage({ type: 'success', text: 'Plan actualizado correctamente. No se requirió pago (crédito por tiempo restante).' });
        setPreview(null);
        setPreviewPlanSlug(null);
        refreshBusiness?.();
        return;
      }
      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }
      throw new Error('No se recibió enlace de pago');
    } catch (err) {
      setPaymentMessage({ type: 'error', text: err?.message || 'Error al iniciar el pago.' });
    } finally {
      setLoadingPlanSlug(null);
    }
  };

  const confirmPayWithMercadoPago = async () => {
    console.info(PAYMENT_DEBUG_PREFIX, {
      event: 'confirm_payment',
      handler: 'confirmPayWithMercadoPago',
      planSlug: previewPlanSlug,
      resolvedCountryCode: countryCode,
      resolvedProvider: paymentProvider,
      selectedPaymentProvider,
    });
    if (!previewPlanSlug) return;
    setLoadingPlanSlug(previewPlanSlug);
    setPaymentMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión.' });
        return;
      }
      const token = session.access_token;
      const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
      const baseUrl = getAppBaseUrl() || window.location?.origin || '';
      const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
      const res = await fetch(`${supabaseUrl}/functions/v1/create-mp-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
        body: JSON.stringify({
          planSlug: previewPlanSlug,
          success_url: `${baseUrl}/plans?payment=success`,
          failure_url: `${baseUrl}/plans?payment=failure`,
          pending_url: `${baseUrl}/plans?payment=pending`,
          origin: baseUrl,
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

  const cancelPreview = () => {
    setPreview(null);
    setPreviewPlanSlug(null);
  };

  if (businessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden transition-all duration-200"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, minHeight: '100vh', transition: 'margin-left var(--transition-base)' }}
      >
        <div className="w-full max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 pb-20 lg:pb-8">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-1">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)' }}
              >
                <Icon name="CreditCard" size={17} color="#fff" />
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Planes</h1>
                <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  Tu plan actual: <strong>{getPlanLabel(currentPlan)}</strong>
                  {business?.planExpiresAt && (currentPlan === 'control' || currentPlan === 'pro' || currentPlan === 'business') && new Date(business.planExpiresAt) > new Date() && (
                    <span className="block text-xs mt-0.5">Vence el {new Date(business.planExpiresAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  )}
                  {business?.scheduledPlanSlug && (
                    <span className="block text-xs mt-1" style={{ color: 'var(--color-primary)' }}>
                      Tu plan cambiará a <strong>{getPlanLabel(business.scheduledPlanSlug)}</strong>
                      {business.scheduledChangeAt
                        ? ` el ${new Date(business.scheduledChangeAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}`
                        : ''}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {paymentMessage && (
            <div
              className="mb-6 rounded-xl border px-4 py-3 flex items-center gap-3"
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
            <div className="mb-6 rounded-xl border p-5" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-primary)' }}>
              <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Resumen antes de pagar</h3>
              <ul className="space-y-1.5 text-sm mb-4" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                <li>Plan actual: <strong>{getPlanLabel(preview.currentPlanSlug)}</strong></li>
                <li>Plan destino: <strong>{getPlanLabel(preview.targetPlanSlug)}</strong></li>
                <li>Días restantes: <strong>{preview.daysRemaining}</strong></li>
                {preview.creditAmount > 0 && (
                  <li>Crédito aplicado: <strong>{formatCurrency(preview.creditAmount, currency)}</strong></li>
                )}
                <li>Precio del plan: <strong>{formatCurrency(preview.targetPlanPrice, currency)}</strong></li>
                {preview.effectiveAt && (
                  <li>Vigente desde: <strong>{new Date(preview.effectiveAt).toLocaleDateString(currency === 'ARS' ? 'es-AR' : 'es-CL', { dateStyle: 'medium' })}</strong></li>
                )}
                <li className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  Total a pagar: <strong className="text-base" style={{ color: 'var(--color-foreground)' }}>
                    {preview.finalAmount === 0 ? 'Sin cargo (crédito aplicado)' : formatCurrency(preview.finalAmount, currency)}
                  </strong>
                </li>
              </ul>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={selectedPaymentProvider === 'dlocal_go' ? confirmPayWithDlocal : confirmPayWithMercadoPago}
                  disabled={!!loadingPlanSlug}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: '#009EE3' }}
                >
                  {loadingPlanSlug ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : preview.finalAmount === 0 ? <><Icon name="CheckCircle" size={16} color="#fff" /> Confirmar cambio (sin cargo)</> : <><Icon name="Wallet" size={16} color="#fff" /> Confirmar y pagar</>}
                </button>
                <button
                  type="button"
                  onClick={cancelPreview}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ color: 'var(--color-muted-foreground)', border: '1px solid var(--color-border)' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {PLAN_SLUGS.map((slug) => {
              const limits = getPlanLimits(slug);
              const isCurrent = currentPlan === slug;
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
                      {getPlanPrice(slug) === 0 ? '' : `pago único · ${currency}`}
                    </p>
                  </div>
                  <ul className="space-y-2 mb-6 flex-1">
                    <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                      <Icon name="Package" size={14} color="var(--color-muted-foreground)" />
                      Productos activos: {limits.maxProducts == null ? 'Ilimitados' : limits.maxProducts}
                    </li>
                    <li className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                      <Icon name="ShoppingCart" size={14} color="var(--color-muted-foreground)" />
                      Pedidos/mes: {limits.maxOrdersPerMonth == null ? 'Ilimitados' : limits.maxOrdersPerMonth}
                    </li>
                  </ul>
                  <div className="pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                    {isCurrent ? (
                      <span className="text-sm font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                        Tu plan actual
                      </span>
                    ) : getPlanPrice(slug) > 0 ? (
                      paymentProvider === 'mercado_pago' ? (
                        <button
                          type="button"
                          disabled={!!loadingPlanSlug}
                          onClick={() => handlePayWithMercadoPago(slug)}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                          style={{ backgroundColor: '#009EE3' }}
                        >
                          {loadingPlanSlug === slug ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <Icon name="Wallet" size={16} color="#fff" />
                              {getPlanActionButtonLabel(currentPlan, slug)}
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!!loadingPlanSlug}
                          onClick={() => handlePayWithDlocal(slug)}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                          style={{ backgroundColor: 'var(--color-primary)' }}
                        >
                          {loadingPlanSlug === slug ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <Icon name="CreditCard" size={16} color="#fff" />
                              {getPlanActionButtonLabel(currentPlan, slug)}
                            </>
                          )}
                        </button>
                      )
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                        Plan gratuito
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-xl border p-4" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
              {paymentProvider === 'mercado_pago'
                ? 'En Chile los planes de pago se procesan con Mercado Pago. Tras el pago, tu plan se activa automáticamente.'
                : 'Los planes de pago se procesan con dLocal Go. Tras el pago aprobado, tu plan se activa automáticamente.'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/business-configuration')}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <Icon name="Settings" size={14} color="#fff" />
              Ir a Configuración
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
