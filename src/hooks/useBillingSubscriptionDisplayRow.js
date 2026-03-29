import { useCallback, useEffect, useState } from 'react';
import { fetchBillingSubscriptionWithLegacyFallback } from '../lib/billing/billingSubscriptionsClient';

/**
 * Carga la fila de `billing_subscriptions` o, si falta (negocios antiguos), un objeto compatible
 * construido desde `wa_businesses`. Ver `fetchBillingSubscriptionWithLegacyFallback`.
 */
export function useBillingSubscriptionDisplayRow(businessId, planSlugRev) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    const id = String(businessId || '').trim();
    if (!id) {
      setRow(null);
      return null;
    }
    setLoading(true);
    try {
      const r = await fetchBillingSubscriptionWithLegacyFallback(id);
      setRow(r);
      return r;
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = String(businessId || '').trim();
      if (!id) {
        if (!cancelled) setRow(null);
        return;
      }
      if (!cancelled) setLoading(true);
      const r = await fetchBillingSubscriptionWithLegacyFallback(id);
      if (!cancelled) {
        setRow(r);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [businessId, planSlugRev]);

  return { row, loading, setRow, refetch };
}
