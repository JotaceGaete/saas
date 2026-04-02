import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function PaypalSuccessPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { business } = useAuth();
  const [syncState, setSyncState] = useState({
    loading: true,
    ok: false,
    paypalStatus: null,
    message: 'Estamos confirmando tu suscripción...',
  });

  const subscriptionId = useMemo(
    () => params.get('subscription_id') || params.get('subscriptionId') || '',
    [params]
  );
  const baToken = params.get('ba_token') || '';
  const tokenParam = params.get('token') || '';

  useEffect(() => {
    console.info('[paypal-success] Subscription ID:', subscriptionId);
    console.info('[paypal-success] Token:', baToken || tokenParam || null);

    let cancelled = false;

    const getValidAccessToken = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      let token = typeof session?.access_token === 'string' ? session.access_token.trim() : '';
      if (token && token.includes('.')) return token;
      const { data: refreshed } = await supabase.auth.refreshSession();
      token = typeof refreshed?.session?.access_token === 'string' ? refreshed.session.access_token.trim() : '';
      return token && token.includes('.') ? token : null;
    };

    const resolveBusinessIdForConfirm = async () => {
      if (business?.id) return business.id;
      const { data: { user } } = await supabase.auth.getUser();
      const userId = String(user?.id || '').trim();
      if (!userId) return null;
      const { data, error } = await supabase
        .from('wa_businesses')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn('[paypal-confirm-debug] failed to resolve businessId from wa_businesses', {
          message: error.message,
          userId,
        });
        return null;
      }
      return data?.id || null;
    };

    const pollSubscriptionState = async (token, businessId) => {
      try {
        const q = new URLSearchParams({ businessId });
        const r = await fetch(`/api/v1/billing/subscription-state?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d?.ok) return d?.billing_status || null;
      } catch {
        // red o parse error: ignorar este intento
      }
      return null;
    };

    const confirmAndPoll = async () => {
      const mappedSubscriptionId = String(subscriptionId || '').trim();
      if (!mappedSubscriptionId) {
        if (!cancelled) {
          setSyncState({
            loading: false,
            ok: false,
            paypalStatus: null,
            message: 'No se recibió subscription_id en el retorno de PayPal.',
          });
        }
        return;
      }

      try {
        const token = await getValidAccessToken();
        if (!token) throw new Error('Tu sesión no es válida. Inicia sesión nuevamente.');

        const resolvedBusinessId = await resolveBusinessIdForConfirm();
        console.info(
          `[paypal-confirm-debug] payload businessId=${resolvedBusinessId || 'null'} subscriptionId=${mappedSubscriptionId} hasAuth=true`,
        );

        // Paso 1: /confirm — verificación de propiedad y chequeo remoto (sin escritura en BD)
        const res = await fetch('/api/v1/billing/paypal/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            subscriptionId: mappedSubscriptionId,
            businessId: resolvedBusinessId || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        console.info('[paypal-confirm-debug] client confirm response', {
          status: res.status,
          ok: res.ok,
          paypalStatus: data?.paypalStatus || null,
          error: data?.error || null,
        });
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || `No se pudo confirmar la suscripción (HTTP ${res.status}).`);
        }

        const confirmedPaypalStatus = data?.paypalStatus || null;
        const effectiveBizId = resolvedBusinessId || business?.id || null;

        if (!effectiveBizId) {
          // Sin businessId no se puede hacer polling; ir a estado neutro
          console.warn('[paypal-poll] no businessId available; redirecting to pending');
          if (!cancelled) navigate('/planes?payment=pending', { replace: true });
          return;
        }

        if (!cancelled) {
          setSyncState({
            loading: true,
            ok: false,
            paypalStatus: confirmedPaypalStatus,
            message: 'Estamos confirmando tu suscripción con el servidor...',
          });
        }

        // Paso 2: polling a subscription-state cada 2 s, máx 20 s (10 intentos)
        const POLL_MS = 2000;
        const MAX_ATTEMPTS = 10;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          if (cancelled) return;
          if (attempt > 0) await new Promise(r => setTimeout(r, POLL_MS));
          if (cancelled) return;

          const billingStatus = await pollSubscriptionState(token, effectiveBizId);
          const isConfirmed = billingStatus === 'active' || billingStatus === 'trial_with_subscription';
          console.info(`[paypal-poll] attempt=${attempt + 1} billing_status=${billingStatus || 'null'} confirmed=${isConfirmed}`);

          if (isConfirmed) {
            if (!cancelled) {
              setSyncState({
                loading: false,
                ok: true,
                paypalStatus: confirmedPaypalStatus,
                message: 'Suscripción activada correctamente.',
              });
              setTimeout(() => {
                if (!cancelled) navigate('/planes?payment=success', { replace: true });
              }, 3000);
            }
            return;
          }
        }

        // Timeout: el webhook aún no actualizó billing_subscriptions — estado neutro
        console.warn('[paypal-poll] timeout after 20s; billing_status still pending_payment');
        if (!cancelled) navigate('/planes?payment=pending', { replace: true });

      } catch (err) {
        if (!cancelled) {
          setSyncState({
            loading: false,
            ok: false,
            paypalStatus: null,
            message: err?.message || 'Ocurrió un error confirmando la suscripción.',
          });
        }
      }
    };

    confirmAndPoll();
    return () => { cancelled = true; };
  }, [subscriptionId, baToken, business?.id, navigate]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <div className="max-w-xl w-full mx-4 text-center rounded-xl p-6" style={{ border: '1px solid var(--color-border)' }}>
        <h1
          className="text-xl font-bold mb-3"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
        >
          Confirmacion de suscripcion
        </h1>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
          El retorno de PayPal fue recibido correctamente.
        </p>
        <p
          className="text-sm mb-4"
          style={{ color: syncState.ok ? '#059669' : syncState.loading ? 'var(--color-text-secondary)' : '#dc2626' }}
        >
          {syncState.message}
        </p>
        <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          <strong>ID:</strong> {subscriptionId || 'No recibido'}
        </p>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          <strong>Estado PayPal:</strong> {syncState.paypalStatus || 'Pendiente de confirmacion'}
        </p>
        <button
          type="button"
          onClick={() => navigate('/planes', { replace: true })}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Ir a Plan y facturacion
        </button>
      </div>
    </div>
  );
}
