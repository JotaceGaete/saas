import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { getAppBaseUrl } from '../../config/appUrl';
import { PLAN_SLUGS, getPlanLimits, getPlanLabel, getPlanPrice } from '../../constants/plans';

export default function PlansPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { business, businessLoading, refreshBusiness } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState(null);
  const [loadingPlanSlug, setLoadingPlanSlug] = useState(null);
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';
  const currentPlan = business?.planSlug || 'starter';

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

  const handlePayWithMercadoPago = async (planSlug) => {
    const price = getPlanPrice(planSlug);
    if (price <= 0) return;
    setLoadingPlanSlug(planSlug);
    setPaymentMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setPaymentMessage({ type: 'error', text: 'Debes iniciar sesión para contratar un plan.' });
        return;
      }
      const token = session.access_token;
      const tokenPreview = token.length >= 12 ? `${token.slice(0, 12)}...` : '(short)';
      const looksLikeJwt = token.split('.').length === 3;
      const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
      const isAnonKey = !!anonKey && token === anonKey;
      console.log('[plans] before invoke: session.user.id:', session?.user?.id);
      console.log('[plans] before invoke: session.access_token exists:', !!session?.access_token);
      console.log('[plans] before invoke: token first 12 chars (masked):', tokenPreview);
      console.log('[plans] before invoke: token looks like JWT (3 parts):', looksLikeJwt);
      console.log('[plans] before invoke: token === anon key?', isAnonKey);
      if (isAnonKey) {
        setPaymentMessage({ type: 'error', text: 'Error de autenticación: token inválido.' });
        return;
      }

      const baseUrl = getAppBaseUrl() || window.location?.origin || '';
      const body = {
        planSlug,
        success_url: `${baseUrl}/plans?payment=success`,
        failure_url: `${baseUrl}/plans?payment=failure`,
        pending_url: `${baseUrl}/plans?payment=pending`,
        origin: baseUrl,
      };
      const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
      const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
      const functionUrl = `${supabaseUrl}/functions/v1/create-mp-preference`;
      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: anonKey,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.reason) console.log('[plans] function returned', res.status, 'reason:', data.reason, 'details:', data.details);
        throw new Error(data?.error ?? res.statusText ?? 'Error al crear preferencia de pago');
      }
      if (data?.error) throw new Error(data.error);
      if (data?.init_point) {
        window.location.href = data.init_point;
        return;
      }
      throw new Error('No se recibió enlace de pago');
    } catch (err) {
      const message = err?.message || err?.error || 'Error al iniciar el pago con Mercado Pago.';
      setPaymentMessage({ type: 'error', text: message });
    } finally {
      setLoadingPlanSlug(null);
    }
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
                  {business?.planExpiresAt && (currentPlan === 'pro' || currentPlan === 'business') && new Date(business.planExpiresAt) > new Date() && (
                    <span className="block text-xs mt-0.5">Vence el {new Date(business.planExpiresAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
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
                      {getPlanPrice(slug) === 0 ? 'Gratis' : `$${getPlanPrice(slug).toLocaleString('es-CL')}`}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                      {getPlanPrice(slug) === 0 ? '' : 'pago único · CLP'}
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
                            Pagar con Mercado Pago
                          </>
                        )}
                      </button>
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
              Los planes Pro y Business se pagan con Mercado Pago (mercadopago.cl). Tras el pago, tu plan se actualiza de forma automática.
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
