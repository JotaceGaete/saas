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
    message: 'Confirmando suscripcion con el backend...',
  });

  const subscriptionId = useMemo(
    () => params.get('subscription_id') || params.get('subscriptionId') || '',
    [params]
  );
  const baToken = params.get('ba_token') || params.get('token');

  useEffect(() => {
    console.info('[paypal-success] Subscription ID:', subscriptionId);
    console.info('[paypal-success] Token:', baToken);

    let cancelled = false;

    const getValidAccessToken = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      let token = typeof session?.access_token === 'string' ? session.access_token.trim() : '';
      if (token && token.includes('.')) return token;
      const { data: refreshed } = await supabase.auth.refreshSession();
      token = typeof refreshed?.session?.access_token === 'string' ? refreshed.session.access_token.trim() : '';
      return token && token.includes('.') ? token : null;
    };

    const confirmSubscription = async () => {
      if (!subscriptionId) {
        if (!cancelled) {
          setSyncState({
            loading: false,
            ok: false,
            message: 'No se recibio subscription_id en el retorno de PayPal.',
          });
        }
        return;
      }

      try {
        const token = await getValidAccessToken();
        if (!token) {
          throw new Error('Tu sesion no es valida. Inicia sesion nuevamente.');
        }

        const query = new URLSearchParams({ subscriptionId });
        if (business?.id) query.set('businessId', business.id);

        const res = await fetch(`/api/v1/billing/paypal/subscriptions?${query.toString()}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || `No se pudo confirmar la suscripcion (HTTP ${res.status}).`);
        }

        if (!cancelled) {
          setSyncState({
            loading: false,
            ok: true,
            message: 'Suscripcion confirmada y sincronizada correctamente.',
          });
        }
      } catch (err) {
        if (!cancelled) {
          setSyncState({
            loading: false,
            ok: false,
            message: err?.message || 'Ocurrio un error confirmando la suscripcion.',
          });
        }
      }
    };

    confirmSubscription();
    return () => {
      cancelled = true;
    };
  }, [subscriptionId, baToken, business?.id]);

  useEffect(() => {
    if (!syncState.ok) return undefined;
    const timeoutId = setTimeout(() => {
      navigate('/planes', { replace: true });
    }, 4000);
    return () => clearTimeout(timeoutId);
  }, [syncState.ok, navigate]);

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
          Suscripcion creada
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
        <p className="text-sm mb-6 break-all" style={{ color: 'var(--color-text-secondary)' }}>
          <strong>Token:</strong> {baToken || 'No recibido'}
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
