import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Carga datos de visualización de suscripción desde el contrato oficial backend
 * `/api/v1/billing/subscription-state` y evita lecturas directas legacy desde frontend.
 */
export function useBillingSubscriptionDisplayRow(businessId, planSlugRev) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchFromSubscriptionState = useCallback(async (id) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = typeof session?.access_token === 'string' ? session.access_token.trim() : '';
    if (!token || !token.includes('.')) return null;
    const query = new URLSearchParams({ businessId: id });
    const res = await fetch(`/api/v1/billing/subscription-state?${query.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok !== true) return null;
    return {
      trial_ends_at: data?.trial_ends_at ?? null,
      next_billing_date: data?.current_period_ends_at ?? null,
      current_period_ends_at: data?.current_period_ends_at ?? null,
      plan_slug: data?.plan_slug ?? null,
      status: data?.billing_status ?? null,
      _displaySource: data?.source === 'billing_subscriptions'
        ? 'billing_subscriptions'
        : 'legacy_wa_businesses',
    };
  }, []);

  const refetch = useCallback(async () => {
    const id = String(businessId || '').trim();
    if (!id) {
      setRow(null);
      return null;
    }
    setLoading(true);
    try {
      const r = await fetchFromSubscriptionState(id);
      setRow(r);
      return r;
    } finally {
      setLoading(false);
    }
  }, [businessId, fetchFromSubscriptionState]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = String(businessId || '').trim();
      if (!id) {
        if (!cancelled) setRow(null);
        return;
      }
      if (!cancelled) setLoading(true);
      const r = await fetchFromSubscriptionState(id);
      if (!cancelled) {
        setRow(r);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [businessId, planSlugRev, fetchFromSubscriptionState]);

  return { row, loading, setRow, refetch };
}
