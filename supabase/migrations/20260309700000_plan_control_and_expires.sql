-- Incluir plan 'control' en wa_businesses y asegurar plan_expires_at.
-- Ejecutar en Supabase si la migración 20260309600000 no se aplicó o el CHECK no incluye 'control'.

-- 1. Columna plan_expires_at (por si no se aplicó 20260309600000)
ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.wa_businesses.plan_expires_at IS 'Hasta cuándo el plan está activo. NULL = sin vencimiento.';

-- 2. Permitir plan_slug = 'control' (plan de prueba Mercado Pago)
ALTER TABLE public.wa_businesses
  DROP CONSTRAINT IF EXISTS wa_businesses_plan_slug_check;

ALTER TABLE public.wa_businesses
  ADD CONSTRAINT wa_businesses_plan_slug_check
  CHECK (plan_slug IN ('starter', 'control', 'pro', 'business'));
