-- Momento en que el pedido pasó a estado enviado (trazabilidad).
ALTER TABLE public.wa_orders
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.wa_orders.sent_at IS 'Marca de tiempo al pasar a enviado; no reutilizar created_at para eso.';
