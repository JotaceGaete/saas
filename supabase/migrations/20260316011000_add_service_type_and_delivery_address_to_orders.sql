-- Tipificación de modalidad de pedido para rubro restaurant
ALTER TABLE public.wa_orders
  ADD COLUMN IF NOT EXISTS service_type TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address TEXT;

-- Validar valores permitidos para service_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wa_orders_service_type_check'
  ) THEN
    ALTER TABLE public.wa_orders
      ADD CONSTRAINT wa_orders_service_type_check
      CHECK (service_type IS NULL OR service_type IN ('mesa', 'pickup', 'delivery'));
  END IF;
END $$;

COMMENT ON COLUMN public.wa_orders.service_type IS
  'Tipo de atención del pedido: mesa, pickup, delivery';
COMMENT ON COLUMN public.wa_orders.delivery_address IS
  'Dirección de entrega cuando service_type = delivery';

CREATE INDEX IF NOT EXISTS idx_wa_orders_service_type
  ON public.wa_orders(service_type);

