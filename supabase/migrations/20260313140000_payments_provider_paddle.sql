-- ============================================================
-- Soporte Paddle como provider de pago (fuera de Chile)
-- ============================================================

-- 1. wa_payments: añadir 'paddle' al CHECK de provider
ALTER TABLE public.wa_payments DROP CONSTRAINT IF EXISTS wa_payments_provider_check;
ALTER TABLE public.wa_payments ADD CONSTRAINT wa_payments_provider_check
  CHECK (provider IN ('mercado_pago', 'dlocal_go', 'internal_proration', 'paddle'));

COMMENT ON COLUMN public.wa_payments.provider IS 'mercado_pago | dlocal_go | internal_proration | paddle';

-- 2. wa_payment_events: añadir 'paddle' al provider (comentario; no hay CHECK en eventos)
COMMENT ON COLUMN public.wa_payment_events.provider IS 'mercado_pago | dlocal_go | paddle';

-- 3. Vista admin: incluir origin 'paddle'
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
    WHEN p.provider = 'paddle' THEN 'paddle'
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

COMMENT ON VIEW public.wa_payments_admin_view IS 'Vista de pagos para panel admin. Incluye origin (mercado_pago | dlocal_go | paddle | internal).';

NOTIFY pgrst, 'reload schema';
