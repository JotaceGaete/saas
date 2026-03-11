-- ============================================================
-- wa_orders: separar estado operativo (order_status) y pago (payment_status)
-- order_status: pedido | en_preparacion | enviado | entregado | cancelado
-- payment_status: pendiente | pagado | anulado
-- ============================================================

-- 1. Añadir columna payment_status
ALTER TABLE public.wa_orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pendiente';

UPDATE public.wa_orders
SET payment_status = 'pendiente'
WHERE payment_status IS NULL;

ALTER TABLE public.wa_orders
  DROP CONSTRAINT IF EXISTS wa_orders_payment_status_check;

ALTER TABLE public.wa_orders
  ADD CONSTRAINT wa_orders_payment_status_check
  CHECK (payment_status IN ('pendiente', 'pagado', 'anulado'));

-- 2. Renombrar status -> order_status (solo si existe la columna status)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wa_orders' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.wa_orders RENAME COLUMN status TO order_status;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wa_orders' AND column_name = 'order_status'
  ) THEN
    ALTER TABLE public.wa_orders ADD COLUMN order_status TEXT DEFAULT 'pedido';
    UPDATE public.wa_orders SET order_status = 'pedido' WHERE order_status IS NULL;
  END IF;
END $$;

-- Asegurar constraint y default de order_status
ALTER TABLE public.wa_orders DROP CONSTRAINT IF EXISTS wa_orders_status_check;
ALTER TABLE public.wa_orders DROP CONSTRAINT IF EXISTS wa_orders_order_status_check;
ALTER TABLE public.wa_orders
  ADD CONSTRAINT wa_orders_order_status_check
  CHECK (order_status IN ('pedido', 'en_preparacion', 'enviado', 'entregado', 'cancelado'));
ALTER TABLE public.wa_orders ALTER COLUMN order_status SET DEFAULT 'pedido';

-- Normalizar valores antiguos (p. ej. 'pending' -> 'pedido')
UPDATE public.wa_orders SET order_status = 'pedido'
WHERE order_status IS NULL OR order_status NOT IN ('pedido', 'en_preparacion', 'enviado', 'entregado', 'cancelado');

-- 3. Índices para consultas
CREATE INDEX IF NOT EXISTS idx_wa_orders_payment_status ON public.wa_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_wa_orders_order_status ON public.wa_orders(order_status);

COMMENT ON COLUMN public.wa_orders.order_status IS 'Estado operativo: pedido, en_preparacion, enviado, entregado, cancelado';
COMMENT ON COLUMN public.wa_orders.payment_status IS 'Estado del pago: pendiente, pagado, anulado';

NOTIFY pgrst, 'reload schema';
