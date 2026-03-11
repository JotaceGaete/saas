-- ============================================================
-- Sistema de suscripciones / pagos profesional
-- Tablas: wa_payments, wa_payment_events
-- Compatible con flujo existente: no toca wa_businesses salvo constraint
-- ============================================================

-- 0. Asegurar columnas base en wa_businesses (idempotentes)
ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS plan_slug       TEXT        NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ NULL;

ALTER TABLE public.wa_businesses
  DROP CONSTRAINT IF EXISTS wa_businesses_plan_slug_check;
ALTER TABLE public.wa_businesses
  ADD CONSTRAINT wa_businesses_plan_slug_check
  CHECK (plan_slug IN ('starter', 'control', 'pro', 'business'));

-- 1. wa_payments — historial completo de intentos de pago
CREATE TABLE IF NOT EXISTS public.wa_payments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID        NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  user_id            UUID        NOT NULL REFERENCES auth.users(id)           ON DELETE CASCADE,
  plan_slug          TEXT        NOT NULL,
  amount             NUMERIC(10,2) NOT NULL,
  currency           TEXT        NOT NULL DEFAULT 'CLP',

  -- Estado interno: pending | approved | rejected | cancelled | in_process
  status             TEXT        NOT NULL DEFAULT 'pending',

  -- Datos de Mercado Pago
  mp_preference_id   TEXT,
  mp_payment_id      TEXT,
  mp_status          TEXT,
  mp_status_detail   TEXT,
  mp_payment_type    TEXT,
  mp_payment_method  TEXT,

  -- Referencia usada en external_reference de MP
  external_reference TEXT        NOT NULL,

  -- Cuando se activó el plan (si fue aprobado)
  plan_activated_at  TIMESTAMPTZ,
  plan_expires_at    TIMESTAMPTZ,

  -- Respuesta cruda de MP (para auditoría/soporte)
  raw_mp_response    JSONB,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.wa_payments                    IS 'Historial completo de intentos de pago de planes.';
COMMENT ON COLUMN public.wa_payments.status             IS 'pending | approved | rejected | cancelled | in_process';
COMMENT ON COLUMN public.wa_payments.mp_preference_id   IS 'ID de la preferencia en Mercado Pago.';
COMMENT ON COLUMN public.wa_payments.mp_payment_id      IS 'ID del pago real en Mercado Pago (único).';
COMMENT ON COLUMN public.wa_payments.external_reference IS 'Formato: waP:<payment_id>:<business_id>:<plan_slug>';

-- 2. wa_payment_events — audit log de cada notificación webhook (idempotencia)
CREATE TABLE IF NOT EXISTS public.wa_payment_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id     UUID        REFERENCES public.wa_payments(id) ON DELETE SET NULL,
  mp_payment_id  TEXT        NOT NULL,
  event_type     TEXT        NOT NULL DEFAULT 'webhook',   -- webhook | manual
  mp_status      TEXT,
  raw_payload    JSONB,
  processed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_payment_events IS 'Audit log de webhooks de Mercado Pago. Permite idempotencia.';
COMMENT ON COLUMN public.wa_payment_events.mp_payment_id IS 'ID del pago en MP. Indexado para chequeo de duplicados.';

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_wa_payments_business_id    ON public.wa_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_wa_payments_user_id        ON public.wa_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_payments_mp_payment_id  ON public.wa_payments(mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_payments_status         ON public.wa_payments(status);
CREATE INDEX IF NOT EXISTS idx_wa_payments_created_at     ON public.wa_payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_payment_events_mp_id    ON public.wa_payment_events(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_wa_payment_events_payment  ON public.wa_payment_events(payment_id)
  WHERE payment_id IS NOT NULL;

-- 4. Trigger updated_at en wa_payments
DROP TRIGGER IF EXISTS wa_payments_updated_at ON public.wa_payments;
CREATE TRIGGER wa_payments_updated_at
  BEFORE UPDATE ON public.wa_payments
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- 5. RLS
ALTER TABLE public.wa_payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_payment_events ENABLE ROW LEVEL SECURITY;

-- wa_payments: el dueño del negocio ve sus propios pagos
DROP POLICY IF EXISTS "wa_payments_owner_select"  ON public.wa_payments;
DROP POLICY IF EXISTS "wa_payments_admin_select"  ON public.wa_payments;

CREATE POLICY "wa_payments_owner_select"
  ON public.wa_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "wa_payments_admin_select"
  ON public.wa_payments FOR SELECT TO authenticated
  USING (public.wa_is_admin());

-- wa_payment_events: solo admins y service_role
DROP POLICY IF EXISTS "wa_payment_events_admin_select" ON public.wa_payment_events;

CREATE POLICY "wa_payment_events_admin_select"
  ON public.wa_payment_events FOR SELECT TO authenticated
  USING (public.wa_is_admin());

-- 6. Vista admin (no tiene RLS, solo para uso desde service_role / admin)
CREATE OR REPLACE VIEW public.wa_payments_admin_view AS
SELECT
  p.id,
  p.created_at,
  p.status,
  p.plan_slug,
  p.amount,
  p.currency,
  p.mp_payment_id,
  p.mp_preference_id,
  p.mp_status,
  p.mp_status_detail,
  p.plan_activated_at,
  p.plan_expires_at,
  p.external_reference,
  b.id   AS business_id,
  b.name AS business_name,
  b.slug AS business_slug,
  u.email AS user_email,
  p.raw_mp_response
FROM public.wa_payments p
JOIN public.wa_businesses b ON b.id = p.business_id
LEFT JOIN auth.users u ON u.id = p.user_id
ORDER BY p.created_at DESC;

COMMENT ON VIEW public.wa_payments_admin_view IS 'Vista de pagos para panel admin. Usar solo con service_role o RLS admin.';

-- 7. Refrescar schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
