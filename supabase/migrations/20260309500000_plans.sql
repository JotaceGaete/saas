-- Planes: Starter (gratis), Pro, Business. Límites se aplican en la app.
ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS plan_slug TEXT NOT NULL DEFAULT 'starter';

COMMENT ON COLUMN public.wa_businesses.plan_slug IS 'starter | pro | business';

-- Valores permitidos (opcional, la app también valida)
ALTER TABLE public.wa_businesses
  DROP CONSTRAINT IF EXISTS wa_businesses_plan_slug_check;

ALTER TABLE public.wa_businesses
  ADD CONSTRAINT wa_businesses_plan_slug_check
  CHECK (plan_slug IN ('starter', 'pro', 'business'));
