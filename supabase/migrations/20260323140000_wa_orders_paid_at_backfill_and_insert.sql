-- Re-backfill paid_at (idempotente) + INSERT siempre fija paid_at al marcar pagado (ignora valor del cliente).

UPDATE public.wa_orders
SET paid_at = updated_at
WHERE payment_status = 'pagado'
  AND paid_at IS NULL
  AND updated_at IS NOT NULL;

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
    IF NEW.payment_status = 'pagado' THEN
      NEW.paid_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.payment_status = 'pagado' THEN
    IF OLD.payment_status IS DISTINCT FROM 'pagado' THEN
      IF NEW.paid_at IS NULL THEN
        NEW.paid_at := now();
      END IF;
    ELSE
      NEW.paid_at := OLD.paid_at;
    END IF;
  ELSE
    NEW.paid_at := OLD.paid_at;
  END IF;

  RETURN NEW;
END;
$f$;
