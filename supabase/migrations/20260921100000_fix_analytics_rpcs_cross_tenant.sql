-- ============================================================
-- SEGURIDAD-WALINKA-1A — fix P0: rpc_dashboard_funnel, rpc_orders_by_day
-- y rpc_top_products reciben p_business_id del cliente y lo usan directo
-- en el WHERE, sin verificar que ese negocio pertenezca a auth.uid().
--
-- CAUSA RAÍZ: las tres funciones (20260619220000_rpc_top_products.sql,
-- 20260619230000_rpc_orders_by_day.sql, 20260619240000_rpc_dashboard_funnel.sql)
-- fueron creadas como reemplazo de agregaciones que antes se hacían en JS
-- client-side -- el foco de esas migraciones fue rendimiento (mover el
-- agrupamiento a la base), y ninguna agregó el guard de ownership que sí
-- usa el resto del sistema (ej. wa_get_business_visit_stats,
-- crm_create_invoice_document): "EXISTS (SELECT 1 FROM wa_businesses
-- WHERE id = p_business_id AND user_id = auth.uid())". Además, ninguna de
-- las tres migraciones originales hizo REVOKE explícito de PUBLIC -- el
-- GRANT EXECUTE ... TO authenticated se sumó al EXECUTE que Postgres
-- otorga a PUBLIC por defecto al crear una función (a diferencia de las
-- tablas, que no tienen privilegios por defecto), dejándolas ejecutables
-- también por `anon` sin sesión.
--
-- Consumidores actuales (sin cambios de contrato): getOrdersByDay(),
-- getTopProducts() y getConversionFunnelStats() en
-- src/services/waBusinessService.js -- las tres llaman siempre con
-- business?.id del negocio del usuario autenticado (AuthContext), nunca
-- con un business_id ajeno. El guard no cambia su comportamiento; solo
-- cierra la posibilidad de invocarlas con un business_id de otro negocio.
--
-- Firma, tipo de retorno, cálculos y nombres de columnas: IDÉNTICOS a las
-- migraciones originales. rpc_top_products y rpc_orders_by_day pasan de
-- LANGUAGE sql a LANGUAGE plpgsql -- adaptación estructural mínima y
-- necesaria: un cuerpo `LANGUAGE sql` no admite IF/RAISE EXCEPTION, y el
-- ticket pide exactamente ese patrón (el mismo que ya usan las funciones
-- seguras del repo). rpc_dashboard_funnel ya era plpgsql; solo se le
-- agrega el guard al inicio del cuerpo.
-- ============================================================

-- ── rpc_top_products ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_top_products(
  p_business_id UUID,
  p_limit       INT  DEFAULT 5,
  p_days        INT  DEFAULT NULL
)
RETURNS TABLE (
  product_id    UUID,
  product_name  TEXT,
  total_qty     NUMERIC,
  total_revenue NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.wa_businesses
    WHERE id = p_business_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    i.product_id,
    i.product_name::TEXT,
    SUM(i.quantity)::NUMERIC            AS total_qty,
    SUM(i.subtotal)::NUMERIC            AS total_revenue
  FROM public.wa_order_items  i
  JOIN public.wa_orders        o ON o.id = i.order_id
  WHERE o.business_id = p_business_id
    AND (
      p_days IS NULL
      OR o.created_at >= NOW() - (p_days::TEXT || ' days')::INTERVAL
    )
  GROUP BY i.product_id, i.product_name
  ORDER BY total_qty DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.rpc_top_products(UUID, INT, INT) IS
  'Top productos vendidos por negocio, con filtro de días. SEGURIDAD-WALINKA-1A (2026-09-21): valida que p_business_id pertenezca a auth.uid() antes de calcular nada -- antes cualquier authenticated (y anon, por el EXECUTE implícito a PUBLIC) podía leer revenue por producto de cualquier negocio.';

REVOKE ALL ON FUNCTION public.rpc_top_products(UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_top_products(UUID, INT, INT) TO authenticated;

-- ── rpc_orders_by_day ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_orders_by_day(
  p_business_id UUID,
  p_days        INT DEFAULT 7
)
RETURNS TABLE (
  day   TEXT,
  count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.wa_businesses
    WHERE id = p_business_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH day_series AS (
    SELECT generate_series(
      (NOW() AT TIME ZONE 'UTC')::DATE - (p_days - 1),
      (NOW() AT TIME ZONE 'UTC')::DATE,
      INTERVAL '1 day'
    )::DATE AS d
  ),
  order_counts AS (
    SELECT (created_at AT TIME ZONE 'UTC')::DATE AS d,
           COUNT(*)                              AS cnt
    FROM public.wa_orders
    WHERE business_id = p_business_id
      AND created_at >= (NOW() AT TIME ZONE 'UTC')::DATE - (p_days - 1)
    GROUP BY 1
  )
  SELECT
    ds.d::TEXT  AS day,
    COALESCE(oc.cnt, 0) AS count
  FROM day_series  ds
  LEFT JOIN order_counts oc USING (d)
  ORDER BY ds.d;
END;
$$;

COMMENT ON FUNCTION public.rpc_orders_by_day(UUID, INT) IS
  'Pedidos por día calendario, por negocio. SEGURIDAD-WALINKA-1A (2026-09-21): valida que p_business_id pertenezca a auth.uid() antes de calcular nada -- mismo fix que rpc_top_products/rpc_dashboard_funnel.';

REVOKE ALL ON FUNCTION public.rpc_orders_by_day(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_orders_by_day(UUID, INT) TO authenticated;

-- ── rpc_dashboard_funnel ──────────────────────────────────────────────
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.wa_businesses
    WHERE id = p_business_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

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

COMMENT ON FUNCTION public.rpc_dashboard_funnel(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Embudo de conversión (visitas/clicks/pedidos/pagos/revenue) por negocio, período actual vs. anterior. SEGURIDAD-WALINKA-1A (2026-09-21): valida que p_business_id pertenezca a auth.uid() antes de calcular nada -- mismo fix que rpc_top_products/rpc_orders_by_day.';

REVOKE ALL ON FUNCTION public.rpc_dashboard_funnel(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_dashboard_funnel(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

NOTIFY pgrst, 'reload schema';
