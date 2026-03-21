-- Tablero activo: pedidos entregados visibles solo un tiempo; luego is_archived=true (historial).
-- No se eliminan filas.

ALTER TABLE public.wa_orders
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE public.wa_orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

COMMENT ON COLUMN public.wa_orders.is_archived IS 'Oculto del tablero activo; visible en Historial.';
COMMENT ON COLUMN public.wa_orders.delivered_at IS 'Momento en que pasó a entregado (ventana antes de archivar).';

CREATE INDEX IF NOT EXISTS idx_wa_orders_business_archived
  ON public.wa_orders (business_id, is_archived);

CREATE INDEX IF NOT EXISTS idx_wa_orders_delivered_expire
  ON public.wa_orders (business_id, order_status, delivered_at)
  WHERE is_archived = false AND order_status = 'entregado';

-- Entregados ya existentes: pasan al historial (evita columnas saturadas tras deploy)
UPDATE public.wa_orders
SET is_archived = true
WHERE order_status = 'entregado'
  AND is_archived = false;

NOTIFY pgrst, 'reload schema';
