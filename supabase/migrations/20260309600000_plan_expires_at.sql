-- Expiración de planes: fecha hasta la cual el plan está activo.
-- Si plan_expires_at es NULL, el plan no vence (ej. starter o legacy).
-- Pro/Business: al pagar se setea plan_expires_at = now() + 30 días.

ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.wa_businesses.plan_expires_at IS 'Hasta cuándo el plan (pro/business) está activo. NULL = sin vencimiento.';
