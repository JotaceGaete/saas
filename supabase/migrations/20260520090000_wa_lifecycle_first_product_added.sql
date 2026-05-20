-- Lifecycle event queue for external automation workers (n8n).
-- This migration only records pending events in Postgres; it does not call HTTP.

CREATE TABLE IF NOT EXISTS public.wa_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  user_id UUID NULL,
  business_id UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_lifecycle_events_first_product_added_business_uidx
  ON public.wa_lifecycle_events (business_id)
  WHERE event_name = 'first_product_added';

CREATE INDEX IF NOT EXISTS wa_lifecycle_events_pending_idx
  ON public.wa_lifecycle_events (status, created_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.wa_queue_first_product_added_lifecycle_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  business_row public.wa_businesses%ROWTYPE;
  product_count INTEGER;
BEGIN
  IF NEW.business_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO product_count
  FROM public.wa_products
  WHERE business_id = NEW.business_id;

  IF product_count <> 1 THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO business_row
  FROM public.wa_businesses
  WHERE id = NEW.business_id;

  IF business_row.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.wa_lifecycle_events (
    event_name,
    user_id,
    business_id,
    payload
  )
  VALUES (
    'first_product_added',
    business_row.user_id,
    NEW.business_id,
    jsonb_build_object(
      'business_name', business_row.name
    )
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wa_products_queue_first_product_added_lifecycle_event ON public.wa_products;
CREATE TRIGGER wa_products_queue_first_product_added_lifecycle_event
  AFTER INSERT ON public.wa_products
  FOR EACH ROW
  EXECUTE FUNCTION public.wa_queue_first_product_added_lifecycle_event();

CREATE OR REPLACE VIEW public.wa_lifecycle_events_pending AS
SELECT
  id,
  event_name,
  user_id,
  business_id,
  payload,
  status,
  created_at
FROM public.wa_lifecycle_events
WHERE status = 'pending'
ORDER BY created_at ASC;
