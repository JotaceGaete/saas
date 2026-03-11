-- ============================================================
-- Pedidos: estados unificados, campos opcionales e índices
-- Estados: pedido | en_preparacion | enviado | entregado | cancelado
-- ============================================================

-- 1. wa_orders: columnas opcionales si no existen
ALTER TABLE public.wa_orders
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS subtotal       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS currency       TEXT DEFAULT 'CLP';

-- 2. Normalizar status: actualizar filas antiguas primero, luego CHECK y default
ALTER TABLE public.wa_orders
  DROP CONSTRAINT IF EXISTS wa_orders_status_check;

UPDATE public.wa_orders
SET status = 'pedido'
WHERE status IS NULL OR status NOT IN ('pedido', 'en_preparacion', 'enviado', 'entregado', 'cancelado');

ALTER TABLE public.wa_orders
  ADD CONSTRAINT wa_orders_status_check
  CHECK (status IN ('pedido', 'en_preparacion', 'enviado', 'entregado', 'cancelado'));

ALTER TABLE public.wa_orders
  ALTER COLUMN status SET DEFAULT 'pedido';

-- 3. wa_order_items: selected_options para opciones del producto
ALTER TABLE public.wa_order_items
  ADD COLUMN IF NOT EXISTS selected_options JSONB DEFAULT '[]'::jsonb;

-- 4. Índices para listado y filtros
CREATE INDEX IF NOT EXISTS idx_wa_orders_status       ON public.wa_orders(status);
CREATE INDEX IF NOT EXISTS idx_wa_orders_created_at_d  ON public.wa_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_orders_business_id   ON public.wa_orders(business_id);  -- puede existir
CREATE INDEX IF NOT EXISTS idx_wa_order_items_order_id ON public.wa_order_items(order_id); -- puede existir

NOTIFY pgrst, 'reload schema';
