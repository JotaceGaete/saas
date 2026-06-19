-- ============================================================
-- rpc_orders_by_day: pedidos agrupados por día calendario
--
-- Reemplaza getOrdersByDay() que descargaba todos los
-- created_at del periodo y agrupaba en JS.
-- Esta RPC genera la serie de días en DB y hace LEFT JOIN,
-- garantizando que días sin pedidos aparezcan con count = 0.
--
-- Parámetros:
--   p_business_id  UUID  — negocio
--   p_days         INT   — últimos N días calendario (default 7)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_orders_by_day(
  p_business_id UUID,
  p_days        INT DEFAULT 7
)
RETURNS TABLE (
  day   TEXT,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.rpc_orders_by_day(UUID, INT) TO authenticated;
