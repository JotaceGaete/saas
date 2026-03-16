-- Agrega referencia de mesa/mostrador para pedidos del catálogo
ALTER TABLE public.wa_orders
  ADD COLUMN IF NOT EXISTS table_reference TEXT;

COMMENT ON COLUMN public.wa_orders.table_reference IS
  'Referencia de mesa o mostrador para rubro restaurant';

CREATE INDEX IF NOT EXISTS idx_wa_orders_table_reference
  ON public.wa_orders(table_reference);

