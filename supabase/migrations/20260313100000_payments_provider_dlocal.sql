-- ============================================================
-- Soporte multi-provider: dLocal Go junto a Mercado Pago
-- No rompe flujo MP. Añade provider y provider_payment_id.
-- ============================================================

-- 1. wa_payments: columna provider y provider_payment_id genérico
ALTER TABLE public.wa_payments
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'mercado_pago',
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT NULL;

COMMENT ON COLUMN public.wa_payments.provider IS 'mercado_pago | dlocal_go | internal_proration';
COMMENT ON COLUMN public.wa_payments.provider_payment_id IS 'ID del pago en el provider (MP: mp_payment_id; dLocal: id de pago).';

-- Constraint para valores conocidos
ALTER TABLE public.wa_payments DROP CONSTRAINT IF EXISTS wa_payments_provider_check;
ALTER TABLE public.wa_payments ADD CONSTRAINT wa_payments_provider_check
  CHECK (provider IN ('mercado_pago', 'dlocal_go', 'internal_proration'));

-- Backfill: MP ya tiene mp_payment_id
UPDATE public.wa_payments
SET provider_payment_id = mp_payment_id
WHERE provider = 'mercado_pago' AND mp_payment_id IS NOT NULL AND provider_payment_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_wa_payments_provider_payment_id
  ON public.wa_payments(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

-- 2. wa_payment_events: soporte multi-provider para idempotencia
ALTER TABLE public.wa_payment_events
  ADD COLUMN IF NOT EXISTS provider TEXT NULL DEFAULT 'mercado_pago',
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT NULL;

COMMENT ON COLUMN public.wa_payment_events.provider IS 'mercado_pago | dlocal_go';
COMMENT ON COLUMN public.wa_payment_events.provider_payment_id IS 'ID del pago en el provider para idempotencia.';

UPDATE public.wa_payment_events
SET provider = 'mercado_pago', provider_payment_id = mp_payment_id
WHERE provider_payment_id IS NULL AND mp_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_payment_events_provider_payment_id
  ON public.wa_payment_events(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

-- 3. Vista admin: usar columna provider
DROP VIEW IF EXISTS public.wa_payments_admin_view;

CREATE VIEW public.wa_payments_admin_view AS
SELECT
  p.id,
  p.created_at,
  p.updated_at,
  p.status,
  p.plan_slug,
  p.amount,
  p.currency,
  p.mp_payment_id,
  p.mp_preference_id,
  p.provider,
  p.provider_payment_id,
  p.mp_status,
  p.mp_status_detail,
  p.plan_activated_at,
  p.plan_expires_at,
  p.external_reference,
  p.user_id,
  p.metadata,
  CASE
    WHEN p.provider = 'internal_proration' OR (p.metadata->>'provider') = 'internal_proration' THEN 'internal'
    WHEN p.provider = 'dlocal_go' THEN 'dlocal_go'
    ELSE 'mercado_pago'
  END AS origin,
  b.id   AS business_id,
  b.name AS business_name,
  b.slug AS business_slug,
  b.plan_slug AS business_plan_slug,
  b.plan_expires_at AS business_plan_expires_at,
  u.email AS user_email
FROM public.wa_payments p
JOIN public.wa_businesses b ON b.id = p.business_id
LEFT JOIN auth.users u ON u.id = p.user_id
ORDER BY p.created_at DESC;

COMMENT ON VIEW public.wa_payments_admin_view IS 'Vista de pagos para panel admin. Incluye origin (mercado_pago | dlocal_go | internal).';

NOTIFY pgrst, 'reload schema';
