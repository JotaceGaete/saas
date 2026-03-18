-- ============================================================
-- LemonSqueezy: wa_subscriptions, wa_subscription_events
-- Tablas para suscripciones internacionales (Argentina, resto del mundo).
-- Chile sigue usando Mercado Pago.
-- ============================================================

-- 1. wa_subscriptions — suscripciones de LemonSqueezy (y futuros providers)
CREATE TABLE IF NOT EXISTS public.wa_subscriptions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  business_id             UUID        NULL REFERENCES public.wa_businesses(id) ON DELETE SET NULL,
  email                  TEXT        NOT NULL,
  provider               TEXT        NOT NULL DEFAULT 'lemonsqueezy',
  provider_customer_id   TEXT,
  provider_subscription_id TEXT      NULL UNIQUE,
  provider_order_id      TEXT,
  provider_variant_id    TEXT,
  plan_slug              TEXT        NOT NULL,
  status                 TEXT        NOT NULL DEFAULT 'active',
  currency               TEXT        NOT NULL DEFAULT 'USD',
  amount                 NUMERIC(10,2),
  interval               TEXT,
  current_period_end     TIMESTAMPTZ,
  trial_ends_at          TIMESTAMPTZ,
  cancel_at              TIMESTAMPTZ,
  cancelled_at           TIMESTAMPTZ,
  metadata               JSONB       DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_subscriptions IS 'Suscripciones LemonSqueezy. Argentina y resto del mundo (no Chile).';
COMMENT ON COLUMN public.wa_subscriptions.provider_subscription_id IS 'ID de suscripción en LemonSqueezy. Único para idempotencia.';

CREATE INDEX IF NOT EXISTS idx_wa_subscriptions_user_id ON public.wa_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_subscriptions_business_id ON public.wa_subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_wa_subscriptions_provider_sub_id ON public.wa_subscriptions(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_subscriptions_email ON public.wa_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_wa_subscriptions_status ON public.wa_subscriptions(status);

DROP TRIGGER IF EXISTS wa_subscriptions_updated_at ON public.wa_subscriptions;
CREATE TRIGGER wa_subscriptions_updated_at
  BEFORE UPDATE ON public.wa_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

ALTER TABLE public.wa_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS: dueño ve sus suscripciones; admin puede ver todo
CREATE POLICY "wa_subscriptions_owner_select"
  ON public.wa_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "wa_subscriptions_admin_select"
  ON public.wa_subscriptions FOR SELECT TO authenticated
  USING (public.wa_is_admin());

-- 2. wa_subscription_events — audit log de webhooks LemonSqueezy
CREATE TABLE IF NOT EXISTS public.wa_subscription_events (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider               TEXT        NOT NULL DEFAULT 'lemonsqueezy',
  event_name             TEXT        NOT NULL,
  provider_event_id      TEXT,
  provider_subscription_id TEXT,
  payload                JSONB       DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_subscription_events IS 'Audit log de eventos webhook LemonSqueezy (subscription_created, etc.).';

CREATE INDEX IF NOT EXISTS idx_wa_subscription_events_provider ON public.wa_subscription_events(provider);
CREATE INDEX IF NOT EXISTS idx_wa_subscription_events_sub_id ON public.wa_subscription_events(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_subscription_events_created ON public.wa_subscription_events(created_at DESC);

ALTER TABLE public.wa_subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_subscription_events_admin_select"
  ON public.wa_subscription_events FOR SELECT TO authenticated
  USING (public.wa_is_admin());

-- 3. wa_payments: añadir lemonsqueezy al CHECK
ALTER TABLE public.wa_payments DROP CONSTRAINT IF EXISTS wa_payments_provider_check;
ALTER TABLE public.wa_payments ADD CONSTRAINT wa_payments_provider_check
  CHECK (provider IN ('mercado_pago', 'dlocal_go', 'internal_proration', 'paddle', 'lemonsqueezy'));

COMMENT ON COLUMN public.wa_payments.provider IS 'mercado_pago | dlocal_go | internal_proration | paddle | lemonsqueezy';

-- 4. wa_payment_events: comentario
COMMENT ON COLUMN public.wa_payment_events.provider IS 'mercado_pago | dlocal_go | paddle | lemonsqueezy';

-- 5. Vista admin: incluir origin lemonsqueezy
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
    WHEN p.provider = 'lemonsqueezy' THEN 'lemonsqueezy'
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

COMMENT ON VIEW public.wa_payments_admin_view IS 'Vista de pagos para panel admin. Incluye origin (mercado_pago | dlocal_go | paddle | lemonsqueezy | internal).';

NOTIFY pgrst, 'reload schema';
