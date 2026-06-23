-- Fix rpc_top_products: exclude cancelled/voided orders from product ranking.
-- wa_orders.status = 'cancelado' and payment_status = 'anulado' must not
-- count toward quantity sold or revenue totals.

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.product_id,
    i.product_name::TEXT,
    SUM(i.quantity)::NUMERIC            AS total_qty,
    SUM(i.subtotal)::NUMERIC            AS total_revenue
  FROM public.wa_order_items  i
  JOIN public.wa_orders        o ON o.id = i.order_id
  WHERE o.business_id = p_business_id
    AND o.order_status   <> 'cancelado'
    AND o.payment_status <> 'anulado'
    AND (
      p_days IS NULL
      OR o.created_at >= NOW() - (p_days::TEXT || ' days')::INTERVAL
    )
  GROUP BY i.product_id, i.product_name
  ORDER BY total_qty DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_top_products(UUID, INT, INT) TO authenticated;
