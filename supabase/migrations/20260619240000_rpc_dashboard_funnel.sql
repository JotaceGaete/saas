-- ============================================================
-- rpc_dashboard_funnel: embudo de conversión en una sola llamada
--
-- Reemplaza getConversionFunnelStats() que hacía 8 queries en
-- paralelo (4 periodo actual + 4 periodo anterior).
-- Esta RPC devuelve todos los conteos en un objeto JSON con
-- una sola round-trip.
--
-- La lógica de "paid_at fallback a updated_at" se replica con
-- COALESCE(paid_at, updated_at) para pedidos payment_status='pagado'.
--
-- wa_catalog_whatsapp_clicks puede no existir en staging viejo;
-- se captura con EXCEPTION y se devuelve 0 en ese caso.
--
-- Parámetros (timestamptz para respetar la TZ del cliente):
--   p_business_id  UUID
--   p_start        TIMESTAMPTZ   — inicio periodo actual
--   p_end          TIMESTAMPTZ   — fin periodo actual
--   p_prev_start   TIMESTAMPTZ   — inicio periodo anterior
--   p_prev_end     TIMESTAMPTZ   — fin periodo anterior
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_dashboard_funnel(
  p_business_id UUID,
  p_start       TIMESTAMPTZ,
  p_end         TIMESTAMPTZ,
  p_prev_start  TIMESTAMPTZ,
  p_prev_end    TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visits       BIGINT := 0;
  v_clicks       BIGINT := 0;
  v_orders       BIGINT := 0;
  v_paid         BIGINT := 0;
  v_paid_revenue NUMERIC := 0;

  v_prev_visits       BIGINT := 0;
  v_prev_clicks       BIGINT := 0;
  v_prev_orders       BIGINT := 0;
  v_prev_paid         BIGINT := 0;
  v_prev_revenue      NUMERIC := 0;
BEGIN
  -- ── Visitas ──────────────────────────────────────────────
  SELECT COUNT(*) INTO v_visits
  FROM public.wa_catalog_visits
  WHERE business_id = p_business_id
    AND created_at BETWEEN p_start AND p_end;

  SELECT COUNT(*) INTO v_prev_visits
  FROM public.wa_catalog_visits
  WHERE business_id = p_business_id
    AND created_at BETWEEN p_prev_start AND p_prev_end;

  -- ── Clicks WhatsApp (tabla puede no existir) ─────────────
  BEGIN
    SELECT COUNT(*) INTO v_clicks
    FROM public.wa_catalog_whatsapp_clicks
    WHERE business_id = p_business_id
      AND created_at BETWEEN p_start AND p_end;

    SELECT COUNT(*) INTO v_prev_clicks
    FROM public.wa_catalog_whatsapp_clicks
    WHERE business_id = p_business_id
      AND created_at BETWEEN p_prev_start AND p_prev_end;
  EXCEPTION WHEN undefined_table THEN
    v_clicks      := 0;
    v_prev_clicks := 0;
  END;

  -- ── Pedidos (por created_at) ──────────────────────────────
  SELECT COUNT(*) INTO v_orders
  FROM public.wa_orders
  WHERE business_id = p_business_id
    AND created_at BETWEEN p_start AND p_end;

  SELECT COUNT(*) INTO v_prev_orders
  FROM public.wa_orders
  WHERE business_id = p_business_id
    AND created_at BETWEEN p_prev_start AND p_prev_end;

  -- ── Pedidos pagados (por COALESCE(paid_at, updated_at)) ───
  SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
  INTO v_paid, v_paid_revenue
  FROM public.wa_orders
  WHERE business_id = p_business_id
    AND payment_status = 'pagado'
    AND COALESCE(paid_at, updated_at) BETWEEN p_start AND p_end;

  SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
  INTO v_prev_paid, v_prev_revenue
  FROM public.wa_orders
  WHERE business_id = p_business_id
    AND payment_status = 'pagado'
    AND COALESCE(paid_at, updated_at) BETWEEN p_prev_start AND p_prev_end;

  RETURN json_build_object(
    'visits',        v_visits,
    'clicks',        v_clicks,
    'orders',        v_orders,
    'paid',          v_paid,
    'paid_revenue',  v_paid_revenue,
    'prev_visits',   v_prev_visits,
    'prev_clicks',   v_prev_clicks,
    'prev_orders',   v_prev_orders,
    'prev_paid',     v_prev_paid,
    'prev_revenue',  v_prev_revenue
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_dashboard_funnel(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
