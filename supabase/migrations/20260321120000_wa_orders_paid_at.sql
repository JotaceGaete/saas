-- wa_orders.paid_at: momento en que el pedido queda pagado (fuente de verdad para ingresos).
-- Inmutable tras asignarse; solo se rellena al pasar a payment_status = 'pagado'.

ALTER TABLE public.wa_orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

COMMENT ON COLUMN public.wa_orders.paid_at IS 'Timestamp cuando el pedido se marcó pagado; única fuente de verdad para ingresos (dashboard, informes).';

-- Pedidos ya pagados sin paid_at: aproximación con updated_at (antes del trigger).
UPDATE public.wa_orders
SET paid_at = updated_at
WHERE payment_status = 'pagado'
  AND paid_at IS NULL
  AND updated_at IS NOT NULL;

-- Si aún falta (caso raro), usar created_at
UPDATE public.wa_orders
SET paid_at = created_at
WHERE payment_status = 'pagado'
  AND paid_at IS NULL;

CREATE OR REPLACE FUNCTION public.wa_orders_set_paid_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $f$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status = 'pagado' AND NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.payment_status = 'pagado' THEN
    IF OLD.payment_status IS DISTINCT FROM 'pagado' THEN
      IF NEW.paid_at IS NULL THEN
        NEW.paid_at := now();
      END IF;
    ELSE
      -- Sigue pagado: no permitir que el cliente/sobrescritura altere paid_at
      NEW.paid_at := OLD.paid_at;
    END IF;
  ELSE
    -- Dejó de estar pagado u otro estado: conservar paid_at (auditoría; ingresos filtran payment_status = pagado)
    NEW.paid_at := OLD.paid_at;
  END IF;

  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS wa_orders_set_paid_at ON public.wa_orders;
CREATE TRIGGER wa_orders_set_paid_at
  BEFORE INSERT OR UPDATE ON public.wa_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.wa_orders_set_paid_at();

CREATE INDEX IF NOT EXISTS idx_wa_orders_business_paid_at
  ON public.wa_orders (business_id, paid_at)
  WHERE payment_status = 'pagado';
